const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { logger } = require("../../config/logger");

/**
 * Executes JavaScript code directly using Node.js.
 * Only JavaScript is supported here — compiled languages (C++, Java, Python)
 * are sent to the BullMQ Worker which runs them in Docker containers.
 */
async function executeDirectly(run) {
  const { runtime, files, entrypoint } = run;

  if (runtime !== "javascript" && runtime !== "nodejs") {
    return {
      stdout: "",
      stderr: `Unsupported runtime for inline execution: ${runtime}. This should be handled by the queue worker.`,
      exitCode: 1
    };
  }

  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "liquidide-"));
  try {
    await materializeFiles(runDir, files);
    const entry = sanitizeRelPath(entrypoint);
    return await execWithTimeout("node", [entry], 10000, { cwd: runDir });
  } catch (err) {
    logger.error({ err }, "Direct execution failed");
    return { stdout: "", stderr: `Execution Error: ${err.message}`, exitCode: 1 };
  } finally {
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
  const parts = normalized.split("/").filter(Boolean);
  const safeParts = parts.filter((seg) => seg !== "." && seg !== ".." && !seg.includes(":"));
  const joined = safeParts.join(path.sep);
  if (!joined) return crypto.randomUUID() + ".txt";
  return joined;
}

function execWithTimeout(cmd, args, timeoutMs, opts = {}) {
  return new Promise((resolve, reject) => {
    try {
      const child = spawn(cmd, args, { ...opts, windowsHide: true });
      let stdout = "";
      let stderr = "";

      if (child.stdout) child.stdout.on("data", (d) => (stdout += d.toString()));
      if (child.stderr) child.stderr.on("data", (d) => (stderr += d.toString()));

      const timeout = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* ignore */ }
      }, timeoutMs);

      child.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        resolve({ stdout, stderr, exitCode: code ?? 1 });
      });
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { executeDirectly };
