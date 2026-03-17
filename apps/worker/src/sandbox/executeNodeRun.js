const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { env } = require("../config/env");

async function executeNodeRun(opts) {
  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "liquidide-run-"));
  try {
    await materializeFiles(runDir, opts.files);

    const entry = path.posix.normalize(opts.entrypoint).replace(/^(\.\.(\/|\\|$))+/, "");
    const dockerArgs = [
      "run",
      "--rm",
      "--network",
      "none",
      "--memory",
      env.RUN_MEMORY,
      "--cpus",
      env.RUN_CPUS,
      "--pids-limit",
      String(env.RUN_PIDS_LIMIT),
      "--read-only",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=64m",
      "-v",
      `${runDir}:/workspace:rw`,
      "-w",
      "/workspace",
      "-u",
      "1000:1000",
      env.SANDBOX_NODE_IMAGE,
      "node",
      entry
    ];

    const { stdout, stderr, exitCode } = await execWithTimeout("docker", dockerArgs, env.RUN_TIMEOUT_MS);
    return { stdout, stderr, exitCode };
  } catch (err) {
    if (err.code === "ENOENT") {
      return {
        stdout: "",
        stderr: "Error: 'docker' command not found. Please ensure Docker is installed and running on the host system.",
        exitCode: 127
      };
    }
    throw err;
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

function execWithTimeout(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true });

    let stdout = "";
    let stderr = "";
    if (child.stdout) child.stdout.on("data", (d) => (stdout += d.toString()));
    if (child.stderr) child.stderr.on("data", (d) => (stderr += d.toString()));

    const timeout = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode: code });
    });
  });
}

module.exports = { executeNodeRun };

