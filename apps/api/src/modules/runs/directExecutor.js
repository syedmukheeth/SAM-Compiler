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

async function execWithTimeout(cmd, args, timeoutMs, jobId, onLog, spawnOpts = {}) {
  return new Promise(async (resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let killed = false;

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
          try { ptyProcess.kill(); } catch (e) {}
          if (onLog) onLog(jobId, "stderr", "\n❌ Execution Timed Out\n");
          resolve({ stdout, stderr: "Timed Out", exitCode: 124 });
        }, timeoutMs);

        const inputHandler = (data) => {
          try {
            ptyProcess.write(data);
          } catch (e) {
            logger.warn({ jobId, error: e.message }, "PTY write failed");
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
          if (onLog) onLog(jobId, "end", { status: exitCode === 0 ? "succeeded" : "failed" });
          resolve({ stdout, stderr, exitCode });
        });
        return;
      } catch (e) {
        logger.error({ error: e.message }, "PTY spawn failed, falling back to spawn");
      }
    }

    const child = spawn(cmd, args, { ...spawnOpts, windowsHide: true });
    const timeout = setTimeout(() => {
      killed = true;
      try { child.kill(); } catch (e) {}
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
      if (onLog) onLog(jobId, "end", { status: code === 0 ? "succeeded" : "failed" });
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      if (jobId) process.off(`run:input:${jobId}`, inputHandler);
      reject(err);
    });
  });
}

async function executeDirectly(run, onLog) {
  const { language, code } = run;
  const jobId = run._id.toString();
  const tempDir = path.join(os.tmpdir(), `liquid-${jobId}`);

  try {
    await fs.mkdir(tempDir, { recursive: true });

    if (language === "cpp") {
      const filePath = path.join(tempDir, "solution.cpp");
      const outPath = path.join(tempDir, IS_WINDOWS ? "program.exe" : "program");
      await fs.writeFile(filePath, code);
      if (onLog) onLog(jobId, "stdout", "🔨 \x1b[1;34mCompiling program...\x1b[0m\n");
      const compile = await execWithTimeout("g++", [filePath, "-o", outPath], 15000, null, null, { noPty: true });
      if (compile.exitCode !== 0) {
        if (onLog) onLog(jobId, "stderr", compile.stderr || "Compilation failed\n");
        return { status: "failed", stderr: compile.stderr };
      }
      if (onLog) onLog(jobId, "stdout", "✅ \x1b[1;32mCompilation successful.\x1b[0m\n🚀 \x1b[1;36mRunning interactive terminal...\x1b[0m\n\r\n");
      return await execWithTimeout(outPath, [], 60000, jobId, onLog, { cwd: tempDir });

    } else if (language === "c") {
      const filePath = path.join(tempDir, "solution.c");
      const outPath = path.join(tempDir, IS_WINDOWS ? "program.exe" : "program");
      await fs.writeFile(filePath, code);
      if (onLog) onLog(jobId, "stdout", "🔨 \x1b[1;34mCompiling C program...\x1b[0m\n");
      const compile = await execWithTimeout("gcc", [filePath, "-o", outPath], 15000, null, null, { noPty: true });
      if (compile.exitCode !== 0) {
        if (onLog) onLog(jobId, "stderr", compile.stderr || "Compilation failed\n");
        return { status: "failed", stderr: compile.stderr };
      }
      if (onLog) onLog(jobId, "stdout", "✅ \x1b[1;32mCompilation successful.\x1b[0m\n🚀 \x1b[1;36mRunning interactive terminal...\x1b[0m\n\r\n");
      return await execWithTimeout(outPath, [], 60000, jobId, onLog, { cwd: tempDir });

    } else if (language === "python" || language === "python3") {
      const filePath = path.join(tempDir, "solution.py");
      await fs.writeFile(filePath, code);
      if (onLog) onLog(jobId, "stdout", "🚀 \x1b[1;36mRunning Python script...\x1b[0m\n\r\n");
      return await execWithTimeout(IS_WINDOWS ? "python" : "python3", [filePath], 60000, jobId, onLog, { cwd: tempDir, env: { PYTHONUNBUFFERED: "1" } });

    } else if (language === "nodejs") {
      const filePath = path.join(tempDir, "solution.js");
      await fs.writeFile(filePath, code);
      if (onLog) onLog(jobId, "stdout", "🚀 \x1b[1;36mRunning Node.js script...\x1b[0m\n\r\n");
      return await execWithTimeout("node", [filePath], 60000, jobId, onLog, { cwd: tempDir });

    } else if (language === "java") {
      const filePath = path.join(tempDir, "Solution.java");
      await fs.writeFile(filePath, code);
      if (onLog) onLog(jobId, "stdout", "🔨 \x1b[1;34mCompiling Java...\x1b[0m\n");
      const compile = await execWithTimeout("javac", [filePath], 15000, null, null, { noPty: true });
      if (compile.exitCode !== 0) {
        if (onLog) onLog(jobId, "stderr", compile.stderr || "Compilation failed\n");
        return { status: "failed", stderr: compile.stderr };
      }
      if (onLog) onLog(jobId, "stdout", "✅ \x1b[1;32mCompilation successful.\x1b[0m\n🚀 \x1b[1;36mRunning Java...\x1b[0m\n\r\n");
      return await execWithTimeout("java", ["Solution"], 60000, jobId, onLog, { cwd: tempDir });
    }
    throw new Error(`Unsupported language: ${language}`);
  } catch (err) {
    if (onLog) onLog(jobId, "stderr", err.message);
    return { status: "failed", stderr: err.message };
  } finally {
    setTimeout(async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (e) {
        logger.warn({ path: tempDir }, "Failed to cleanup temp execution directory");
      }
    }, 10000);
  }
}

module.exports = { executeDirectly };
