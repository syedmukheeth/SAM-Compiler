const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { logger } = require("../../config/logger");

const TIMEOUT_MS = 15000;

/**
 * Language execution configurations.
 * Each language defines how to compile (if needed) and run the code.
 */
const LANG_CONFIG = {
  javascript: {
    compile: null,
    run: (entry) => ({ cmd: "node", args: [entry] })
  },
  nodejs: {
    compile: null,
    run: (entry) => ({ cmd: "node", args: [entry] })
  },
  python: {
    compile: null,
    run: (entry) => ({ cmd: "python", args: [entry] })
  },
  cpp: {
    compile: (entry) => ({ cmd: "g++", args: ["-o", "a.out", entry] }),
    run: () => {
      const exe = os.platform() === "win32" ? "a.out.exe" : "./a.out";
      return { cmd: exe, args: [] };
    }
  },
  c: {
    compile: (entry) => ({ cmd: "gcc", args: ["-o", "a.out", entry] }),
    run: () => {
      const exe = os.platform() === "win32" ? "a.out.exe" : "./a.out";
      return { cmd: exe, args: [] };
    }
  },
  java: {
    compile: (entry) => ({ cmd: "javac", args: [entry] }),
    run: (entry) => {
      const className = path.basename(entry, ".java");
      return { cmd: "java", args: [className] };
    }
  }
};

/**
 * Executes code directly on this server for ANY supported language.
 * For compiled languages (C++, C, Java), it compiles first, then runs.
 */
async function executeDirectly(run) {
  const { runtime, files, entrypoint } = run;

  const config = LANG_CONFIG[runtime];
  if (!config) {
    return {
      stdout: "",
      stderr: `Unsupported language: ${runtime}. Supported: ${Object.keys(LANG_CONFIG).join(", ")}`,
      exitCode: 1
    };
  }

  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "liquidide-"));
  try {
    await materializeFiles(runDir, files);
    const entry = sanitizeRelPath(entrypoint);

    // Step 1: Compile (if needed)
    if (config.compile) {
      const { cmd, args } = config.compile(entry);
      logger.info({ cmd, args, runtime }, "Compiling code");
      const compileResult = await execWithTimeout(cmd, args, TIMEOUT_MS, { cwd: runDir });
      
      if (compileResult.exitCode !== 0) {
        return {
          stdout: "",
          stderr: compileResult.stderr || `Compilation failed with exit code ${compileResult.exitCode}`,
          exitCode: compileResult.exitCode
        };
      }
    }

    // Step 2: Run
    const { cmd, args } = config.run(entry);
    logger.info({ cmd, args, runtime }, "Running code");
    
    // For compiled C/C++, fix the executable path
    let runCmd = cmd;
    if ((runtime === "cpp" || runtime === "c") && os.platform() === "win32") {
      runCmd = path.join(runDir, "a.exe");
      // g++ on Windows produces a.exe, not a.out.exe
      try {
        await fs.access(runCmd);
      } catch {
        runCmd = path.join(runDir, "a.out.exe");
        try {
          await fs.access(runCmd);
        } catch {
          runCmd = path.join(runDir, "a.out");
        }
      }
      return await execWithTimeout(runCmd, args, TIMEOUT_MS, { cwd: runDir });
    }
    
    return await execWithTimeout(runCmd, args, TIMEOUT_MS, { cwd: runDir });
  } catch (err) {
    logger.error({ err, runtime }, "Direct execution failed");
    return { stdout: "", stderr: `Execution Error: ${err.message}`, exitCode: 1 };
  } finally {
    await fs.rm(runDir, { recursive: true, force: true }).catch(() => {});
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
        stderr += "\n⏱ Execution timed out (15s limit).";
        try { child.kill("SIGKILL"); } catch { /* ignore */ }
      }, timeoutMs);

      child.on("error", (err) => {
        clearTimeout(timeout);
        // If compiler/runtime is not found, give a helpful error
        if (err.code === "ENOENT") {
          resolve({
            stdout: "",
            stderr: `Command not found: "${cmd}". The required compiler/runtime is not installed on this server.\n\nTo fix this:\n- C/C++: Install g++ (MinGW on Windows, build-essential on Linux)\n- Java: Install JDK\n- Python: Install Python 3`,
            exitCode: 127
          });
        } else {
          reject(err);
        }
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
