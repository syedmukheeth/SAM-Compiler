const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { env } = require("../../config/env");

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
  } catch (err) {
    return { stdout: "", stderr: `Direct Execution Error: ${err.message}`, exitCode: 1 };
  } finally {
    await fs.rm(runDir, { recursive: true, force: true });
  }
}

async function materializeFiles(root, files) {
  for (const f of files) {
    const abs = path.join(root, path.basename(f.path));
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, f.content, "utf8");
  }
}

function execWithTimeout(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    if (child.stdout) child.stdout.on("data", (d) => (stdout += d.toString()));
    if (child.stderr) child.stderr.on("data", (d) => (stderr += d.toString()));

    const timeout = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode: code });
    });
  });
}

module.exports = { executeDirectly };
