const { logger } = require("../../config/logger");

const JUDGE0_API_URL = "https://ce.judge0.com/submissions?base64_encoded=true&wait=true";

// Upper bound on the synchronous Judge0 call. Slightly above the worst-case
// compile+run so legitimate slow runs are not cut off.
const JUDGE0_TIMEOUT_MS = Number(process.env.JUDGE0_TIMEOUT_MS || 30000);

// Mapping SAM Compiler language IDs to Judge0 language IDs
const LANGUAGE_MAP = {
  python: 71,     // Python 3
  javascript: 63, // Node.js
  cpp: 54,        // C++ (GCC 9.2.0)
  c: 50,          // C (GCC 9.2.0)
  java: 62        // Java (OpenJDK 13.0.1)
  // go and rust were listed here but are rejected by the zod enum on both
  // entry points, so they were unreachable and implied support that the rest
  // of the app does not have.
};

const STATUS_MAP = {
  3: "succeeded",
  4: "runtime_error",      // Wrong Answer (often logic error in competitive programming, but here it's just failed execution)
  5: "timeout",           // Time Limit Exceeded
  6: "compilation_error", // Compilation Error
  7: "runtime_error",      // SIGSEGV
  8: "runtime_error",      // SIGXFSZ
  9: "runtime_error",      // SIGFPE
  10: "runtime_error",     // SIGABRT
  11: "runtime_error",     // NZEC
  12: "memory_limit",      // Memory Limit Exceeded
  13: "failed",            // Internal Error
  14: "failed"             // Exec Format Error
};

const https = require("node:https");

/**
 * Execute code using the Judge0 public API.
 */
async function executeViaPiston(run, onLog) { // Keeping name for compatibility
  const runtime = run.runtime || run.language;
  const jobId = run._id.toString();
  const entrypoint = run.entrypoint || (runtime === "java" ? "Solution.java" : "solution.js");
  const files = run.files || [];
  
  const mainFile = files.find(f => f.path === entrypoint);
  const code = mainFile ? mainFile.content : (run.code || "");

  const languageId = LANGUAGE_MAP[runtime];
  if (!languageId) {
    throw new Error(`Cloud Sandbox does not support runtime: ${runtime}`);
  }

  let finalCode = code;
  if (runtime === "java") {
    // Judge0 requires the public class to be named Main. Only the FIRST match is
    // rewritten deliberately: a file has exactly one public class, and a global
    // replace would rename every other class to Main too, producing a file that
    // no longer compiles.
    finalCode = code.replace(/public\s+class\s+\w+/, "public class Main");
  }

  const payload = JSON.stringify({
    source_code: Buffer.from(finalCode).toString("base64"),
    language_id: languageId,
    stdin: Buffer.from(run.stdin || "").toString("base64"),
  });

  return new Promise((resolve, reject) => {
    const req = https.request(JUDGE0_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`Cloud Sandbox Error (${res.statusCode}): ${data}`));
        }
        try {
          const result = JSON.parse(data);
          
          let stdout = result.stdout ? Buffer.from(result.stdout, "base64").toString("utf8") : "";
          let stderr = result.stderr ? Buffer.from(result.stderr, "base64").toString("utf8") : "";
          let compile_output = result.compile_output ? Buffer.from(result.compile_output, "base64").toString("utf8") : "";
          
          if (!stderr && compile_output) {
             stderr = compile_output;
          }

          // 🛡️ High-Fidelity Capture: If it's a compile error, usually stderr is in compile_output
          if (result.status?.id === 6 && compile_output) {
             stderr = compile_output;
          }

          const statusId = result.status?.id || 13;
          const status = STATUS_MAP[statusId] || "failed";

          if (stdout && onLog) onLog(jobId, "stdout", stdout);
          if (stderr && onLog) onLog(jobId, "stderr", stderr);

          resolve({
            stdout,
            stderr,
            exitCode: statusId === 3 ? 0 : 1,
            status
          });
        } catch (e) {
          reject(new Error(`Failed to parse Sandbox response: ${e.message}`));
        }
      });
    });

    // This is the primary production execution path (the Docker worker is
    // usually offline). Without a timeout, a hung upstream request meant the
    // promise never settled: no "end" was emitted to the socket, the run stayed
    // "running" forever, and the closure leaked.
    req.setTimeout(JUDGE0_TIMEOUT_MS, () => {
      req.destroy(new Error(`Cloud Sandbox timed out after ${JUDGE0_TIMEOUT_MS}ms`));
    });

    req.on("error", (err) => {
      logger.error({ err, jobId }, "Judge0 execution failed");
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

module.exports = { executeViaPiston };
