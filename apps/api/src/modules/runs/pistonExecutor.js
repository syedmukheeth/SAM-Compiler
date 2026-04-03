const { logger } = require("../../config/logger");

const JUDGE0_API_URL = "https://ce.judge0.com/submissions?base64_encoded=false&wait=true";

// Mapping SAM Compiler language IDs to Judge0 language IDs
const LANGUAGE_MAP = {
  python: 71,     // Python 3
  javascript: 63, // Node.js
  cpp: 54,        // C++ (GCC 9.2.0)
  c: 50,          // C (GCC 9.2.0)
  java: 62        // Java (OpenJDK 13.0.1)
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
    throw new Error(`Judge0 does not support runtime: ${runtime}`);
  }

  if (onLog) {
    onLog(jobId, "stdout", `📡 \x1b[1;36mConnecting to SAM Compiler Cloud Sandbox (Judge0)...\x1b[0m\n\r`);
    onLog(jobId, "stdout", `🔨 \x1b[1;33mCompiling & Preparing Environment...\x1b[0m\n\r`);
  }

  let finalCode = code;
  if (runtime === "java") {
    // Judge0 expects the public class to be named 'Main' if the file is Main.java
    finalCode = code.replace(/public\s+class\s+\w+/, "public class Main");
  }

  const payload = JSON.stringify({
    source_code: finalCode,
    language_id: languageId,
    stdin: "",
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
          return reject(new Error(`Judge0 API Error (${res.statusCode}): ${data}`));
        }
        try {
          const result = JSON.parse(data);
          
          if (onLog) {
            onLog(jobId, "stdout", `🚀 \x1b[1;32mExecution Started\x1b[0m\n\r\n`);
          }

          let stdout = result.stdout || "";
          let stderr = result.stderr || result.compile_output || "";
          let exitCode = result.status?.id === 3 ? 0 : 1; // 3 is "Accepted"

          if (stdout && onLog) onLog(jobId, "stdout", stdout);
          if (stderr && onLog) onLog(jobId, "stderr", stderr);

          resolve({
            stdout,
            stderr,
            exitCode,
            status: exitCode === 0 ? "succeeded" : "failed"
          });
        } catch (e) {
          reject(new Error(`Failed to parse Judge0 response: ${e.message}`));
        }
      });
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
