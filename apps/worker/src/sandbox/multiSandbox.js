const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { env } = require("../config/env");

// The worker used to guess the Java main class with its own regex (first
// `class` token in the file, comments included), which disagreed with the
// cloud executor's regex. Both now share one implementation.
const { normalizeJavaSource } = require("@sam/shared");

// The entry file every Java run is written to, matching what the Judge0 path
// does, so the two backends produce identical results for the same source.
const JAVA_ENTRY = "Main.java";

// Bare `gcc file -o main` fails to link math.h and pthread users, and GCC's
// default standard lags the language, so these mirror the cloud path's
// compiler_options exactly.
const C_FLAGS = "-std=gnu17 -O2 -lm -pthread";
const CPP_FLAGS = "-std=gnu++20 -O2 -pthread";

const LANGUAGE_CONFIGS = {
  javascript: {
    image: env.SANDBOX_NODE_IMAGE,
    command: (entry) => ["node", entry]
  },
  python: {
    image: env.SANDBOX_PYTHON_IMAGE,
    command: (entry) => ["python", entry]
  },
  cpp: {
    image: env.SANDBOX_GCC_IMAGE,
    command: (entry) => ["sh", "-c", `g++ ${entry} ${CPP_FLAGS} -o main || exit 6; ./main`]
  },
  c: {
    image: env.SANDBOX_GCC_IMAGE,
    command: (entry) => ["sh", "-c", `gcc ${entry} ${C_FLAGS} -o main || exit 6; ./main`]
  },
  java: {
    image: env.SANDBOX_OPENJDK_IMAGE,
    command: () => ["sh", "-c", `javac ${JAVA_ENTRY} || exit 6; java Main`]
  }
};

/**
 * Everything that decides WHAT will run, with no I/O: the files to write, the
 * entry file name, and the exact docker argv.
 *
 * Pulled out of executeRun so `apps/worker/tests/multiSandbox.test.js` can
 * assert on the composed command without Docker installed - which is how the
 * Java bug below stayed invisible for so long.
 *
 * @param {{language: string, files: Array<{path: string, content: string}>, entrypoint: string, runDir?: string}} opts
 */
function prepareRun({ language, files, entrypoint, runDir = "/run" }) {
  const config = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.javascript;

  // A deep copy. This used to be `[...files]`, a shallow copy whose elements
  // were the caller's own objects, so the Java rename below mutated
  // `files[i].path` too. The lookup that followed then searched `files` for the
  // ORIGINAL entrypoint, missed, and passed an empty string as the source -
  // which made the command `javac Solution.java` while the file on disk was
  // Main.java. Every Java run on this path failed to compile.
  const materializedFiles = files.map((f) => ({ path: f.path, content: f.content }));

  // Resolved once, before any path is rewritten.
  const mainFile = materializedFiles.find((f) => f.path === entrypoint) || materializedFiles[0];
  let sourceCode = mainFile ? mainFile.content : "";

  let entry = path.posix.normalize(entrypoint).replace(/^(\.\.(\/|\\|$))+/, "");

  // Java's file name must match its public type, so the entry point is
  // normalized into a type called Main and written to Main.java.
  if (language === "java" && mainFile) {
    sourceCode = normalizeJavaSource(sourceCode).source;
    mainFile.content = sourceCode;
    mainFile.path = JAVA_ENTRY;
    entry = JAVA_ENTRY;
  }

  // Robustly escape commands for the shell script
  const cmdParts = config.command(entry, sourceCode);
  const escapedCmd = cmdParts.map((p) => `'${p.replace(/'/g, "'\\''")}'`).join(" ");

  const dockerArgs = [
    "run", "--rm", "--network", "none",
    "--memory", env.RUN_MEMORY || "128m",
    "--cpus", env.RUN_CPUS || "0.5",
    "--pids-limit", String(env.RUN_PIDS_LIMIT || 32),
    "--read-only",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
    // NOT noexec: g++/gcc compile to /workspace/main and then execute it,
    // so noexec here made every C and C++ run fail structurally on the
    // Docker path. Running the compiled artifact is the point of the
    // sandbox; isolation still comes from --network none, --cap-drop ALL,
    // --read-only, no-new-privileges, the pid/memory/cpu caps and uid 1000.
    "--tmpfs", "/workspace:rw,nosuid,size=128m",
    "-v", `${runDir}:/workspace-host:ro`,
    "-w", "/workspace",
    "-u", "1000:1000",
    config.image,
    "sh", "-c", `cp -r /workspace-host/. /workspace/ && ${escapedCmd}`
  ];

  return { entry, sourceCode, files: materializedFiles, dockerArgs, image: config.image, shellCommand: escapedCmd };
}

async function executeRun(opts, onLog) {
  const { language, files, entrypoint, stdin = "" } = opts;

  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "sam-run-"));
  try {
    const prepared = prepareRun({ language, files, entrypoint, runDir });
    await materializeFiles(runDir, prepared.files);

    // 1. Try Docker first (Hardened Sandbox)
    try {
      const dockerArgs = prepared.dockerArgs;

      const start = Date.now();
      const result = await execWithTimeout("docker", dockerArgs, env.RUN_TIMEOUT_MS || 5000, { onLog, stdin });
      const duration = Date.now() - start;

      // High-Fidelity Status Mapping
      let status = "runtime_error";
      if (result.limitExceeded) status = "output_limit";
      else if (result.exitCode === 0) status = "succeeded";
      else if (result.exitCode === 6) status = "compilation_error";
      else if (result.exitCode === 137) status = "timeout";

      return { 
        ...result, 
        status,
        metrics: { durationMs: duration, sandbox: "docker-hardened" } 
      };
    } catch (dockerErr) {
      // Host execution is strictly forbidden in SAM Compiler by design.
      // If Docker is unavailable, we explicitly reject local execution so the task 
      // fails securely, allowing the upstream service to fallback to Judge0 Cloud API.
      throw new Error(`Security Error: Docker is required for executing untrusted code. Host fallback disabled.\nDetails: ${dockerErr.message}`);
    }
  } finally {
    // Errors deliberately propagate. This used to be a catch that returned
    // { exitCode: 1 }, which made "the sandbox is unavailable" look identical to
    // "the user's program exited 1" - so BullMQ marked the job completed and no
    // retry or failover ever happened.
    await fs.rm(runDir, { recursive: true, force: true });
  }
}

async function materializeFiles(root, files) {
  for (const f of files) {
    const safeRel = sanitizeRelPath(f.path);
    const abs = path.join(root, safeRel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, f.content, "utf8");
  }
}

function sanitizeRelPath(p) {
  const normalized = String(p || "").replaceAll("\\", "/");
  const extension = path.extname(normalized);
  const parts = normalized.split("/").filter(Boolean);
  const safeParts = parts.filter((seg) => seg !== "." && seg !== ".." && !seg.includes(":"));
  const joined = safeParts.join(path.sep);
  
  if (!joined) return crypto.randomUUID() + extension;
  return joined;
}


function execWithTimeout(cmd, args, timeoutMs, opts = {}) {
  const { onLog, stdin = "", ...spawnOpts } = opts;
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    console.log(`[SAM-AUDIT] [SANDBOX] Spawning command: ${cmd}`);
    try {
      const child = spawn(cmd, args, { ...spawnOpts, windowsHide: true });
      const MAX_OUTPUT_BYTES = 5 * 1024 * 1024; // 5MB guard rail
      let isLimitExceeded = false;
      
      const checkLimit = () => {
        if (!isLimitExceeded && (stdout.length + stderr.length) > MAX_OUTPUT_BYTES) {
          isLimitExceeded = true;
          stderr += "\n\x1b[1;31m[Output limit exceeded]\x1b[0m\n";
          if (onLog) onLog("stderr", "\n[Output limit exceeded]\n");
          try { child.kill("SIGKILL"); } catch (e) { /* ignore */ void e; }
        }
      };

      if (child.stdout) {
        child.stdout.on("data", (d) => {
          if (isLimitExceeded) return;
          const chunk = d.toString();
          stdout += chunk;
          if (onLog) onLog("stdout", chunk);
          checkLimit();
        });
      }
      if (child.stderr) {
        child.stderr.on("data", (d) => {
          if (isLimitExceeded) return;
          const chunk = d.toString();
          stderr += chunk;
          if (onLog) onLog("stderr", chunk);
          checkLimit();
        });
      }

      const timeout = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch (e) { /* ignore kill error */ void e; }
      }, timeoutMs);

      // STDIN PIPE: Write user input then close stdin so the process can proceed
      if (child.stdin) {
        try {
          if (stdin) child.stdin.write(stdin);
          child.stdin.end();
        } catch (e) {
          // Ignore errors writing to stdin (process may have already exited)
          void e;
        }
      }

      child.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        // 137 is SIGKILL, which the timeout above also produces. Reporting the
        // output-cap kill as 137 too made "output too large" indistinguishable
        // from "timed out" upstream, so it was reported to users as a timeout.
        resolve({ stdout, stderr, exitCode: code, limitExceeded: isLimitExceeded });
      });
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { executeRun, prepareRun, LANGUAGE_CONFIGS };
