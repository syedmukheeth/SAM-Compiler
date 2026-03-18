const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { env } = require("../../config/env");
const { logger } = require("../../config/logger");

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

async function executeDirectly(run) {
  const language = run.runtime;
  const config = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.javascript;
  
  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "liquidide-direct-"));
  try {
    await materializeFiles(runDir, run.files);
    const entry = path.posix.normalize(run.entrypoint).replace(/^(\.\.(\/|\\|$))+/, "");
    
    // 1. Try Docker first
    try {
      const dockerArgs = [
        "run", "--rm", "--network", "none",
        "--memory", env.RUN_MEMORY || "128m",
        "--cpus", env.RUN_CPUS || "0.5",
        "-v", `${runDir}:/workspace:rw`,
        "-w", "/workspace",
        config.image,
        ...config.command(entry)
      ];
      return await execWithTimeout("docker", dockerArgs, 10000);
    } catch (dockerErr) {
      if (dockerErr.code !== "ENOENT") throw dockerErr;
      
      // 2. Fallback to Local execution if Docker is missing
      logger.warn(`Docker not found. Falling back to local execution for ${language}`);
      
      const isWin = process.platform === "win32";
      const exeExt = isWin ? ".exe" : "";
      const shell = isWin ? "cmd" : "sh";
      const shellFlag = isWin ? "/c" : "-c";

      const localCmds = {
        javascript: ["node", entry],
        python: ["python", entry],
        cpp: [shell, shellFlag, `g++ ${entry} -o main${exeExt} && .${path.sep}main${exeExt}`],
        java: [shell, shellFlag, `javac ${entry} && java ${entry.replace(".java", "")}`],
        go: ["go", "run", entry]
      };

      const [cmd, ...args] = localCmds[language] || localCmds.javascript;
      return await execWithTimeout(cmd, args, 10000, { cwd: runDir });
    }
  } catch (err) {
    return { stdout: "", stderr: `Execution Error: ${err.message}`, exitCode: 1 };
  } finally {
    // Keep files for a bit if debugging, but usually cleanup
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
        try { child.kill("SIGKILL"); } catch (e) { /* ignore kill error */ void e; }
      }, timeoutMs);

      child.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        resolve({ stdout, stderr, exitCode: code });
      });
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { executeDirectly };
