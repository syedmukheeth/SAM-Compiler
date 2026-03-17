const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { env } = require("../config/env");

const LANGUAGE_CONFIGS = {
  javascript: {
    image: "node:20-alpine",
    command: (entry) => ["node", entry]
  },
  python: {
    image: "python:3.11-alpine",
    command: (entry) => ["python", entry]
  },
  cpp: {
    image: "gcc:latest",
    command: (entry) => ["sh", "-c", `g++ ${entry} -o main && ./main`]
  },
  java: {
    image: "openjdk:17-slim",
    command: (entry) => ["sh", "-c", `javac ${entry} && java ${entry.replace(".java", "")}`]
  },
  go: {
    image: "golang:1.21-alpine",
    command: (entry) => ["go", "run", entry]
  }
};

async function executeRun(opts) {
  const { language, files, entrypoint } = opts;
  const config = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.javascript;
  
  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "liquidide-run-"));
  try {
    await materializeFiles(runDir, files);

    const entry = path.posix.normalize(entrypoint).replace(/^(\.\.(\/|\\|$))+/, "");
    
    const dockerArgs = [
      "run",
      "--rm",
      "--network",
      "none",
      "--memory",
      env.RUN_MEMORY || "128m",
      "--cpus",
      env.RUN_CPUS || "0.5",
      "--pids-limit",
      String(env.RUN_PIDS_LIMIT || 32),
      "--read-only",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=64m",
      "-v",
      `${runDir}:/workspace:rw`,
      "-w",
      "/workspace",
      "-u",
      "1000:1000",
      config.image,
      ...config.command(entry)
    ];

    const { stdout, stderr, exitCode } = await execWithTimeout("docker", dockerArgs, env.RUN_TIMEOUT_MS || 10000);
    return { stdout, stderr, exitCode };
  } catch (err) {
    if (err.code === "ENOENT") {
      return {
        stdout: "",
        stderr: "Error: 'docker' command not found. Please ensure Docker is installed and running.",
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

module.exports = { executeRun };
