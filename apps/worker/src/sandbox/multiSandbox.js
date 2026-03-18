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
  c: {
    image: "gcc:latest",
    command: (entry) => ["sh", "-c", `gcc ${entry} -o main && ./main`]
  },
  java: {
    image: "openjdk:17-slim",
    command: (entry) => ["sh", "-c", `javac ${entry} && java ${entry.replace(".java", "")}`]
  }
};

async function executeRun(opts) {
  const { language, files, entrypoint } = opts;
  const config = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.javascript;
  
  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "liquidide-run-"));
  try {
    await materializeFiles(runDir, files);
    const entry = path.posix.normalize(entrypoint).replace(/^(\.\.(\/|\\|$))+/, "");
    
    // 1. Try Docker first
    try {
      const dockerArgs = [
        "run", "--rm", "--network", "none",
        "--memory", env.RUN_MEMORY || "128m",
        "--cpus", env.RUN_CPUS || "0.5",
        "--pids-limit", String(env.RUN_PIDS_LIMIT || 32),
        "--read-only",
        "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
        "-v", `${runDir}:/workspace:rw`,
        "-w", "/workspace",
        "-u", "1000:1000",
        config.image,
        ...config.command(entry)
      ];
      return await execWithTimeout("docker", dockerArgs, env.RUN_TIMEOUT_MS || 10000);
    } catch (dockerErr) {
      if (dockerErr.code !== "ENOENT") throw dockerErr;
      
      // 2. Fallback to Local execution if Docker is missing
      console.warn(`Docker not found. Falling back to local execution for ${language}`);
      
      const isWin = process.platform === "win32";
      const exeExt = isWin ? ".exe" : "";
      const shell = isWin ? "cmd" : "sh";
      const shellFlag = isWin ? "/c" : "-c";

      const pythonCmd = await findPythonCommand();
      const localCmds = {
        javascript: ["node", entry],
        python: pythonCmd ? [pythonCmd, entry] : null,
        cpp: [shell, shellFlag, `g++ ${entry} -o main${exeExt} && .${path.sep}main${exeExt}`],
        c: [shell, shellFlag, `gcc ${entry} -o main${exeExt} && .${path.sep}main${exeExt}`],
        java: [shell, shellFlag, `javac ${entry} && java ${entry.replace(".java", "")}`]
      };

      const cmdInfo = localCmds[language];
      if (!cmdInfo) {
        return { 
          stdout: "", 
          stderr: `Local Execution Error: ${language} is not installed or detected on the host compute. \nTip: Install ${language} or start Docker for a sandboxed experience.`, 
          exitCode: 127 
        };
      }

      const [cmd, ...args] = cmdInfo;
      return await execWithTimeout(cmd, args, env.RUN_TIMEOUT_MS || 10000, { cwd: runDir });
    }
  } catch (err) {
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

async function findPythonCommand() {
  const commands = ["python3", "python", "py"];
  const { exec } = require("node:child_process");
  const { promisify } = require("node:util");
  const execAsync = promisify(exec);

  const isWin = process.platform === "win32";

  for (const cmd of commands) {
    try {
      if (isWin) {
        // Specifically check 'where' and ignore WindowsApps stubs
        const { stdout } = await execAsync(`where ${cmd}`);
        const paths = stdout.split(/\r?\n/).filter(Boolean);
        const realPath = paths.find(p => !p.includes("Microsoft\\WindowsApps"));
        
        if (realPath) {
          // Verify it actually runs
          await execAsync(`"${realPath}" --version`);
          return `"${realPath}"`;
        }
      } else {
        await execAsync(`command -v ${cmd}`);
        await execAsync(`${cmd} --version`);
        return cmd;
      }
    } catch (err) {
      // Continue searching
    }
  }
  return null;
}

module.exports = { executeRun };
