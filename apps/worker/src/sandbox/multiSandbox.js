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
        "sh", "-c", `cp -r /workspace-host/. /workspace/ && ${config.command(entry, files.find(f => f.path === entrypoint)?.content || "").join(" ")}`
      ];

      const start = Date.now();
      const result = await execWithTimeout("docker", dockerArgs, env.RUN_TIMEOUT_MS || 10000, { onLog });
      const duration = Date.now() - start;

      return { 
        ...result, 
        metrics: { durationMs: duration, sandbox: "docker-hardened" } 
      };
    } catch (dockerErr) {
      if (env.SECURITY_STRICT) {
         return {
           stdout: "",
           stderr: `Security Error: Docker is unavailable and SECURITY_STRICT is enabled.\n${dockerErr.message}`,
           exitCode: 1,
           metrics: { sandbox: "failed" }
         };
      }
      if (dockerErr.code !== "ENOENT") throw dockerErr;
      
      // 2. Fallback to Local execution if Docker is missing (and not in strict mode)
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
        java: (() => {
          const className = entry.replace(".java", "");
          return [shell, shellFlag, `javac ${entry} && java ${className}`];
        })()
      };

      const cmdInfo = localCmds[language];
      if (!cmdInfo) {
        return { 
          stdout: "", 
          stderr: `SAM Compiler Execution Engine Error:\n- ${language} configuration is missing for this host.\n- Docker is not available for sandboxed execution.\n\nPlease install ${language} or start Docker to enable execution for this language.`, 
          exitCode: 127 
        };
      }

      const [cmd, ...args] = cmdInfo;
      
      // Verify the command or the first part of the shell script exists
      try {
        const { execSync } = require("node:child_process");
        const checkCmd = isWin ? `where ${cmd}` : `command -v ${cmd}`;
        try {
          execSync(checkCmd, { stdio: "ignore" });
        } catch (err) {
          console.warn(`Warning: Shell command '${cmd}' not found in PATH via '${checkCmd}'. Attempting execution anyway...`);
        }
        
        // If it's a compiler command, also check the compiler itself inside the shell script
        if (language === "cpp" || language === "c" || language === "java") {
            const tool = language === "cpp" ? "g++" : language === "c" ? "gcc" : "javac";
            const checkTool = isWin ? `where ${tool}` : `command -v ${tool}`;
            try {
              execSync(checkTool, { stdio: "ignore" });
            } catch (err) {
               // If it's Java, we can be more specific
               if (language === "java") {
                 throw new Error(`javac (Java Compiler) not found. Please ensure JDK is installed and in your PATH.\n- PATH searched: ${process.env.PATH}`);
               }
               throw new Error(`${tool} not found. Please install the ${language.toUpperCase()} compiler.`);
            }
        }
      } catch (e) {
        return {
          stdout: "",
          stderr: `SAM Compiler Worker Error:\n- ${e.message}\n\n💡 If running locally, ensure the compiler is installed and in your PATH.\n💡 Otherwise, use the Cloud Sandbox (Docker).`,
          exitCode: 127 
        };
      }
      return await execWithTimeout(cmd, args, env.RUN_TIMEOUT_MS || 10000, { cwd: runDir, onLog });
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
  const { onLog, ...spawnOpts } = opts;
  return new Promise((resolve, reject) => {
    try {
      const child = spawn(cmd, args, { ...spawnOpts, windowsHide: true });
      let stdout = "";
      let stderr = "";
      
      if (child.stdout) {
        child.stdout.on("data", (d) => {
          const chunk = d.toString();
          stdout += chunk;
          if (onLog) onLog("stdout", chunk);
        });
      }
      if (child.stderr) {
        child.stderr.on("data", (d) => {
          const chunk = d.toString();
          stderr += chunk;
          if (onLog) onLog("stderr", chunk);
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
