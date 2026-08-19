const https = require("node:https");
const { logger } = require("../../config/logger");
const { normalizeJavaSource } = require("@sam/shared");

const JUDGE0_HOST = process.env.JUDGE0_HOST || "https://ce.judge0.com";

// Upper bound on the whole Judge0 interaction, whether it is answered by the
// synchronous `wait=true` call or by the polling fallback below.
const JUDGE0_TIMEOUT_MS = Number(process.env.JUDGE0_TIMEOUT_MS || 30000);
const JUDGE0_POLL_MS = Number(process.env.JUDGE0_POLL_MS || 400);

/**
 * SAM language id -> Judge0 language id.
 *
 * These were pinned to 63/71/54/50/62, which are Node 12.14, Python 3.8.1,
 * GCC 9.2 and OpenJDK 13 - runtimes old enough that ordinary modern code did
 * not run at all: `?.` and `??` were syntax errors, `match` was a syntax error,
 * `<ranges>` did not exist, and records and switch expressions were rejected as
 * preview features. `apps/api/tests/executor.payload.test.js` guards these
 * values so a future edit cannot quietly pin them backwards again.
 */
const LANGUAGE_MAP = {
  python: 109,     // Python 3.13.2
  javascript: 102, // Node.js 22.08.0
  cpp: 105,        // C++ (GCC 14.1.0)
  c: 103,          // C (GCC 14.1.0)
  java: 91         // Java (JDK 17.0.6)
  // go and rust were listed here but are rejected by the zod enum on both
  // entry points, so they were unreachable and implied support that the rest
  // of the app does not have.
};

/**
 * Judge0 compiles with bare defaults unless told otherwise, and the defaults
 * break textbook programs:
 *   - `#include <math.h>` + sqrt() -> "undefined reference to `sqrt`"
 *   - std::thread / pthread_create -> "undefined reference to `pthread_create`"
 *   - GCC 14 still defaults to gnu++17, so std::views is "not declared"
 * Flags go in front of the source file in Judge0's compile command, which is
 * why the C entry keeps -lm even on a glibc that no longer needs it.
 */
const COMPILER_OPTIONS = {
  c: "-std=gnu17 -O2 -lm -pthread",
  cpp: "-std=gnu++20 -O2 -pthread"
};

/**
 * Judge0 defaults are 5s CPU / 10s wall / 256MB / 64MB stack, so a program that
 * merely takes a few seconds came back as a timeout. These sit at or under the
 * public instance's advertised maxima (cpu 20, wall 30, memory 2048000).
 */
const RESOURCE_LIMITS = {
  cpu_time_limit: 15,
  wall_time_limit: 25,
  memory_limit: 512000,
  stack_limit: 128000
};

const STATUS_MAP = {
  1: "queued",             // In Queue
  2: "running",            // Processing
  3: "succeeded",
  4: "runtime_error",      // Wrong Answer (only with expected_output, which we never send)
  5: "timeout",            // Time Limit Exceeded
  6: "compilation_error",
  7: "runtime_error",      // SIGSEGV
  8: "runtime_error",      // SIGXFSZ
  9: "runtime_error",      // SIGFPE
  10: "runtime_error",     // SIGABRT
  11: "runtime_error",     // NZEC
  12: "memory_limit",      // Memory Limit Exceeded
  13: "failed",            // Internal Error
  14: "failed"             // Exec Format Error
};

const isTerminal = (statusId) => Number(statusId) >= 3;

// Judge0's default field set omits exit_code, so a `System.exit(3)` was
// indistinguishable from any other non-zero exit. Naming the fields explicitly
// also keeps the (base64) source out of every response.
const RESULT_FIELDS = "stdout,stderr,compile_output,message,status,exit_code,time,memory,token";

/** Entry file the executor will see, per SAM language id. */
function runtimeFilename(language) {
  switch (language) {
    case "java": return "Main.java";
    case "python": return "solution.py";
    case "cpp": return "solution.cpp";
    case "c": return "solution.c";
    default: return "solution.js";
  }
}

/**
 * Pure payload builder, exported so the regression suite can assert on the
 * language ids, compiler flags and resource limits without touching the network.
 *
 * @param {{runtime?: string, language?: string, entrypoint?: string, files?: Array, code?: string, stdin?: string}} run
 */
function buildJudge0Payload(run) {
  const runtime = run.runtime || run.language;
  const languageId = LANGUAGE_MAP[runtime];
  if (!languageId) {
    throw new Error(`Cloud Sandbox does not support runtime: ${runtime}`);
  }

  const entrypoint = run.entrypoint || runtimeFilename(runtime);
  const files = run.files || [];
  const mainFile = files.find((f) => f.path === entrypoint) || files[0];
  const code = mainFile ? mainFile.content : (run.code || "");

  // Judge0 always writes Java to Main.java and runs `java Main`, so the entry
  // point has to live in a type called Main. The old one-line regex missed
  // non-public classes, `public final class`, and constructors.
  const source = runtime === "java" ? normalizeJavaSource(code).source : code;

  const payload = {
    source_code: Buffer.from(source).toString("base64"),
    language_id: languageId,
    stdin: Buffer.from(run.stdin || "").toString("base64"),
    ...RESOURCE_LIMITS
  };

  if (COMPILER_OPTIONS[runtime]) payload.compiler_options = COMPILER_OPTIONS[runtime];

  return payload;
}

function request(method, url, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(url, {
      method,
      headers: payload
        ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
        : {}
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 400) {
          const err = new Error(`Cloud Sandbox Error (${res.statusCode}): ${data.slice(0, 300)}`);
          err.statusCode = res.statusCode;
          return reject(err);
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse Sandbox response: ${e.message}`));
        }
      });
    });

    // Without this, a hung upstream request meant the promise never settled: no
    // "end" was emitted to the socket, the run stayed "running" forever, and the
    // closure leaked.
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Cloud Sandbox timed out after ${timeoutMs}ms`));
    });
    req.on("error", reject);

    if (payload) req.write(payload);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * `wait=true` is the fast path, but the public instance advertises
 * `enable_wait_result: false` in its config, so it may hand back a submission
 * that is still queued (or refuse the parameter outright). Either way we fall
 * back to creating the submission and polling its token until it is terminal,
 * instead of reporting a queued run as "failed".
 */
async function submitAndAwait(payload, deadline) {
  const remaining = () => Math.max(1000, deadline - Date.now());

  try {
    const result = await request(
      "POST",
      `${JUDGE0_HOST}/submissions?base64_encoded=true&wait=true&fields=${RESULT_FIELDS}`,
      payload,
      remaining()
    );
    if (isTerminal(result?.status?.id)) return result;
    if (result?.token) return pollToken(result.token, deadline);
  } catch (err) {
    if (err.statusCode !== 400 && err.statusCode !== 422) throw err;
    logger.warn({ err: err.message }, "Judge0 rejected wait=true; falling back to polling");
  }

  const created = await request(
    "POST",
    `${JUDGE0_HOST}/submissions?base64_encoded=true&wait=false&fields=${RESULT_FIELDS}`,
    payload,
    remaining()
  );
  if (!created?.token) throw new Error("Cloud Sandbox did not return a submission token");
  return pollToken(created.token, deadline);
}

async function pollToken(token, deadline) {
  const url = `${JUDGE0_HOST}/submissions/${encodeURIComponent(token)}?base64_encoded=true&fields=${RESULT_FIELDS}`;
  for (;;) {
    const result = await request("GET", url, null, Math.max(1000, deadline - Date.now()));
    if (isTerminal(result?.status?.id)) return result;
    if (Date.now() >= deadline) {
      throw new Error(`Cloud Sandbox timed out after ${JUDGE0_TIMEOUT_MS}ms`);
    }
    await sleep(JUDGE0_POLL_MS);
  }
}

const decode = (val) => (val ? Buffer.from(val, "base64").toString("utf8") : "");

/**
 * Execute code using the Judge0 public API.
 */
async function executeViaPiston(run, onLog) { // Keeping name for compatibility
  const jobId = run._id.toString();
  const payload = buildJudge0Payload(run);

  const result = await submitAndAwait(payload, Date.now() + JUDGE0_TIMEOUT_MS);

  const stdout = decode(result.stdout);
  const compileOutput = decode(result.compile_output);
  const message = decode(result.message);
  let stderr = decode(result.stderr);

  // A compilation failure carries its diagnostics in compile_output, and a
  // sandbox-level failure (timeout, OOM) only in message.
  if (!stderr) stderr = compileOutput || message;
  else if (compileOutput) stderr = `${compileOutput}\n${stderr}`;

  const statusId = result.status?.id || 13;
  const status = STATUS_MAP[statusId] || "failed";

  if (stdout && onLog) onLog(jobId, "stdout", stdout);
  if (stderr && onLog) onLog(jobId, "stderr", stderr);

  return {
    stdout,
    stderr,
    // Judge0 reports the process's real exit code; synthesizing 0/1 threw away
    // the distinction between `System.exit(3)` and a segfault.
    exitCode: typeof result.exit_code === "number" ? result.exit_code : (statusId === 3 ? 0 : 1),
    status,
    metrics: {
      sandbox: "judge0-cloud",
      durationMs: result.time ? Math.round(Number(result.time) * 1000) : undefined,
      memoryKb: result.memory ?? undefined
    }
  };
}

module.exports = {
  executeViaPiston,
  buildJudge0Payload,
  runtimeFilename,
  LANGUAGE_MAP,
  COMPILER_OPTIONS,
  RESOURCE_LIMITS,
  STATUS_MAP
};
