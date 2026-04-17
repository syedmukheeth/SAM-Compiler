const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { env } = require("../config/env");

function getJavaMainClass(code) {
  // Support both public and non-public classes
  const match = code.match(/(?:public\s+)?class\s+(\w+)/);
  if (match) return match[1];
  
  // Last resort: scan for main method if class not found with regex
  if (code.includes("public static void main")) return "Solution";
  return "Solution";
}

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
    command: (entry) => ["sh", "-c", `g++ ${entry} -o main && ./main`]
  },
  c: {
    image: env.SANDBOX_GCC_IMAGE,
    command: (entry) => ["sh", "-c", `gcc ${entry} -o main && ./main`]
  },
  java: {
    image: env.SANDBOX_OPENJDK_IMAGE,
    command: (entry, code) => {
      const className = getJavaMainClass(code);
      return ["sh", "-c", `javac ${className}.java && java ${className}`];
    }
  }
};

async function executeRun(opts, onLog) {
  const { language, files, entrypoint } = opts;
  const config = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS.javascript;
  
  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "sam-run-"));
  try {
    const materializedFiles = [...files];
    let entry = path.posix.normalize(entrypoint).replace(/^(\.\.(\/|\\|$))+/, "");
    
    // For Java, ensuring the entry filename matches the public class name
    if (language === "java") {
      const mainFile = materializedFiles.find(f => f.path === entrypoint);
      if (mainFile) {
        const className = getJavaMainClass(mainFile.content);
        const newPath = `${className}.java`;
        mainFile.path = newPath;
        entry = newPath;
      }
    }

    await materializeFiles(runDir, materializedFiles);
    
    // 1. Try Docker first (Hardened Sandbox)
    try {
      // Robustly escape commands for the shell script
      const cmdParts = config.command(entry, files.find(f => f.path === entrypoint)?.content || "");
      const escapedCmd = cmdParts.map(p => `'${p.replace(/'/g, "'\\''")}'`).join(" ");

      const dockerArgs = [
        "run", "--rm", "--network", "none",
        "--memory", env.RUN_MEMORY || "128m",
        "--cpus", env.RUN_CPUS || "0.5",
        "--pids-limit", String(env.RUN_PIDS_LIMIT || 32),
        "--read-only",
        "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges",
        "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
        "--tmpfs", "/workspace:rw,noexec,nosuid,size=128m",
        "-v", `${runDir}:/workspace-host:ro`,
        "-w", "/workspace",
        "-u", "1000:1000",
        config.image,
        "sh", "-c", `cp -r /workspace-host/. /workspace/ && ${escapedCmd}`
      ];

      const start = Date.now();
      const result = await execWithTimeout("docker", dockerArgs, env.RUN_TIMEOUT_MS || 10000, { onLog });
      const duration = Date.now() - start;

      return { 
        ...result, 
        metrics: { durationMs: duration, sandbox: "docker-hardened" } 
      };
    } catch (dockerErr) {
      // 🚨 Host execution is strictly forbidden in SAM Compiler by design.
      // If Docker is unavailable, we explicitly reject local execution so the task 
      // fails securely, allowing the upstream service to fallback to Judge0 Cloud API.
      throw new Error(`Security Error: Docker is required for executing untrusted code. Host fallback disabled.\nDetails: ${dockerErr.message}`);
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
  const extension = path.extname(normalized);
  const parts = normalized.split("/").filter(Boolean);
  const safeParts = parts.filter((seg) => seg !== "." && seg !== ".." && !seg.includes(":"));
  const joined = safeParts.join(path.sep);
  
  if (!joined) return crypto.randomUUID() + extension;
  return joined;
}


function execWithTimeout(cmd, args, timeoutMs, opts = {}) {
  const { onLog, ...spawnOpts } = opts;
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    console.log(`📡 [SAM-AUDIT] [SANDBOX] Spawning command: ${cmd}`);
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

      child.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        console.log(`📡 [SAM-AUDIT] [SANDBOX] Command finished with exitCode: ${code}`);
        resolve({ stdout, stderr, exitCode: isLimitExceeded ? 137 : code });
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
