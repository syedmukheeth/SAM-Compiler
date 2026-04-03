const { spawn } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");
const { logger } = require("../../config/logger");
const { getBufferedInput } = require("./socketHandler");

let pty = null;
function getPty() {
  if (pty) return pty;
  if (process.env.VERCEL) return null;
  try {
    pty = require("node-pty");
    return pty;
  } catch (e) {
    return null;
  }
}

const IS_WINDOWS = os.platform() === "win32";
const { execSync } = require("node:child_process");

/**
 * Checks if a specific command/tool is available in the system PATH.
 */
function isToolAvailable(cmd) {
  try {
    const isWin = os.platform() === "win32";
    const checkCmd = isWin ? `where ${cmd}` : `command -v ${cmd}`;
    
    // 1. Try standard path check (where/command -v)
    try {
      execSync(checkCmd, { stdio: "ignore" });
    } catch (e) {
      // If 'where' fails, it might still be available but not in a way 'where' likes.
      // We'll proceed to the version check regardless.
    }

    // 2. Critical Check: Does the tool actually run?
    // We use a short timeout to prevent hanging.
    execSync(`${cmd} --version`, { stdio: "ignore", timeout: 3000 });
    return true;
  } catch (e) {
    return false;
  }
}

async function execWithTimeout(cmd, args, timeoutMs, jobId, onLog, spawnOpts = {}) {
  return new Promise((resolve, reject) => {
    (async () => {
      let stdout = "";
      let stderr = "";
      let killed = false;
      const startTime = Date.now();

      const ptyMod = getPty();
      if (ptyMod && !spawnOpts.noPty) {
        try {
          const ptyProcess = ptyMod.spawn(cmd, args, {
            name: 'xterm-color',
            cols: 80,
            rows: 24,
            cwd: spawnOpts.cwd || process.cwd(),
            env: { ...process.env, ...spawnOpts.env },
          });

          const timeout = setTimeout(() => {
            killed = true;
            try { 
              if (IS_WINDOWS) {
                execSync(`taskkill /F /T /PID ${ptyProcess.pid}`, { stdio: "ignore" });
              } else {
                ptyProcess.kill(); 
              }
            } catch (e) { /* ignore signal error */ }
            if (onLog) onLog(jobId, "stderr", "\n❌ Execution Timed Out after " + (timeoutMs / 1000) + "s\n");
            resolve({ stdout, stderr: "Timed Out", exitCode: 124 });
          }, timeoutMs);

          const inputHandler = (data) => {
            try {
              ptyProcess.write(data);
            } catch (e) {
              logger.warn({ jobId, error: e.message }, "PTY write failed");
              /* ignore write error */
            }
          };

          if (jobId) {
            process.on(`run:input:${jobId}`, inputHandler);
            const buffered = getBufferedInput(jobId);
            if (buffered.length > 0) {
              setTimeout(() => {
                buffered.forEach(input => inputHandler(input));
              }, 300);
            }
          }

          ptyProcess.onData((data) => {
            stdout += data;
            if (onLog) onLog(jobId, "stdout", data);
          });

          ptyProcess.onExit(({ exitCode }) => {
            clearTimeout(timeout);
            if (jobId) process.off(`run:input:${jobId}`, inputHandler);
            if (killed) return;
            
            const durationMs = Date.now() - startTime;
            const metrics = { durationMs, sandbox: "local-host-pty" };
            
            if (onLog) onLog(jobId, "end", { status: exitCode === 0 ? "succeeded" : "failed", metrics });
            resolve({ stdout, stderr, exitCode, metrics });
          });
          return;
        } catch (e) {
          logger.error({ error: e.message }, "PTY spawn failed, falling back to spawn");
        }
      }

      const child = spawn(cmd, args, { ...spawnOpts, windowsHide: true });
      const timeout = setTimeout(() => {
        killed = true;
        try { 
          if (IS_WINDOWS) {
            execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: "ignore" });
          } else {
            child.kill('SIGKILL'); 
          }
        } catch (e) { /* ignore */ }
        if (onLog) onLog(jobId, "stderr", "\n❌ Execution Timed Out after " + (timeoutMs / 1000) + "s\n");
        resolve({ stdout, stderr: "Timed Out", exitCode: 124 });
      }, timeoutMs);

      const inputHandler = (data) => {
        if (child.stdin && !child.stdin.destroyed) {
          child.stdin.write(data);
        }
      };

      if (jobId) {
        process.on(`run:input:${jobId}`, inputHandler);
        const buffered = getBufferedInput(jobId);
        if (buffered.length > 0) {
          setTimeout(() => {
            buffered.forEach(input => inputHandler(input));
          }, 300);
        }
      }

      child.stdout.on("data", (data) => {
        const chunk = data.toString();
        stdout += chunk;
        if (onLog) onLog(jobId, "stdout", chunk);
      });

      child.stderr.on("data", (data) => {
        const chunk = data.toString();
        stderr += chunk;
        if (onLog) onLog(jobId, "stderr", chunk);
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        if (jobId) process.off(`run:input:${jobId}`, inputHandler);
        if (killed) return;
        
        const durationMs = Date.now() - startTime;
        const metrics = { durationMs, sandbox: "local-host" };
        
        if (onLog) onLog(jobId, "end", { status: code === 0 ? "succeeded" : "failed", metrics });
        resolve({ stdout, stderr, exitCode: code ?? 1, metrics });
      });

      child.on("error", (err) => {
        clearTimeout(timeout);
        if (jobId) process.off(`run:input:${jobId}`, inputHandler);
        reject(err);
      });
    })().catch(err => {
      logger.error({ err }, "Fatal error in PTY executor");
      resolve({ stdout: "", stderr: `Execution Error: ${err.message}`, exitCode: 1 });
    });
  });
}

function getJavaMainClass(code) {
  const match = code.match(/public\s+class\s+(\w+)/);
  return match ? match[1] : "Solution";
}

async function materializeFiles(root, files) {
  for (const f of files) {
    const normalized = String(f.path || "").replaceAll("\\", "/");
    const parts = normalized.split("/").filter(Boolean).filter(s => s !== ".." && s !== ".");
    const safePath = path.join(root, ...parts);
    await fs.mkdir(path.dirname(safePath), { recursive: true });
    await fs.writeFile(safePath, f.content, "utf8");
  }
}

async function executeDirectly(run, onLog) {
  const runtime = run.runtime || run.language;
  const language = runtime;
  const jobId = run._id.toString();
  const entrypoint = run.entrypoint || (language === "java" ? "Solution.java" : "solution.js");
  const files = run.files || [];
  
  const mainFile = files.find(f => f.path === entrypoint);
  const code = mainFile ? mainFile.content : (run.code || "");

  if (!runtime) {
    logger.error({ runId: jobId }, "Execution failed: No runtime specified");
    throw new Error("Unsupported language/runtime (Check model consistency)");
  }

  const tempDir = path.join(os.tmpdir(), `sam-run-${jobId}`);

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await materializeFiles(tempDir, files);

    if (files.length === 0 || !mainFile) {
        await fs.writeFile(path.join(tempDir, entrypoint), code);
    }

    if (language === "cpp") {
      const filePath = path.join(tempDir, "solution.cpp");
      const outPath = path.join(tempDir, IS_WINDOWS ? "program.exe" : "program");
      await fs.writeFile(filePath, code);
      const compile = await execWithTimeout("g++", [filePath, "-o", outPath], 15000, null, null, { noPty: true });
      if (compile.exitCode !== 0) {
        if (onLog) onLog(jobId, "stderr", compile.stderr || "Compilation failed\n");
        return { status: "failed", stderr: compile.stderr };
      }
      return await execWithTimeout(outPath, [], 60000, jobId, onLog, { cwd: tempDir });

    } else if (language === "c") {
      const filePath = path.join(tempDir, "solution.c");
      const outPath = path.join(tempDir, IS_WINDOWS ? "program.exe" : "program");
      await fs.writeFile(filePath, code);
      const compile = await execWithTimeout("gcc", [filePath, "-o", outPath], 15000, null, null, { noPty: true });
      if (compile.exitCode !== 0) {
        if (onLog) onLog(jobId, "stderr", compile.stderr || "Compilation failed\n");
        return { status: "failed", stderr: compile.stderr };
      }
      return await execWithTimeout(outPath, [], 60000, jobId, onLog, { cwd: tempDir });

    } else if (language === "python" || language === "python3") {
      const filePath = path.join(tempDir, "solution.py");
      await fs.writeFile(filePath, code);
      return await execWithTimeout(IS_WINDOWS ? "python" : "python3", [filePath], 60000, jobId, onLog, { cwd: tempDir, env: { PYTHONUNBUFFERED: "1" } });

    } else if (language === "nodejs" || language === "javascript") {
      const filePath = path.join(tempDir, "solution.js");
      await fs.writeFile(filePath, code);
      return await execWithTimeout("node", [filePath], 60000, jobId, onLog, { cwd: tempDir });

    } else if (language === "java") {
      const javaClass = getJavaMainClass(code);
      const javaFile = `${javaClass}.java`;
      const javaFilePath = path.join(tempDir, javaFile);
      
      await fs.writeFile(javaFilePath, code);
      
      const compile = await execWithTimeout("javac", [javaFile], 15000, null, null, { noPty: true, cwd: tempDir });
      if (compile.exitCode !== 0) {
        if (onLog) onLog(jobId, "stderr", compile.stderr || "Compilation failed\n");
        return { status: "failed", stderr: compile.stderr };
      }
      return await execWithTimeout("java", [javaClass], 60000, jobId, onLog, { cwd: tempDir });

    }
    throw new Error(`Unsupported language/runtime: ${runtime}`);
  } catch (err) {
    if (onLog) onLog(jobId, "stderr", err.message);
    return { status: "failed", stderr: err.message };
  } finally {
    setTimeout(async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (e) {
        /* ignore cleanup error */
        logger.warn({ path: tempDir }, "Failed to cleanup temp execution directory");
      }
    }, 10000);
  }
}

module.exports = { executeDirectly, isToolAvailable };
