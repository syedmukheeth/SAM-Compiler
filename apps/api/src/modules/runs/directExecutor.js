const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { logger } = require("../../config/logger");

const TIMEOUT_MS = 15000;

/**
 * Wandbox API — free, open-source online compiler. No API key needed.
 * Supports C++, C, Java, Python, JavaScript, and 50+ languages.
 */
const WANDBOX_URL = "https://wandbox.org/api/compile.json";

const WANDBOX_COMPILER_MAP = {
  cpp: "gcc-13.2.0",
  c: "gcc-13.2.0-c",
  java: "openjdk-jdk-22+36",
  python: "cpython-3.12.7",
  javascript: "nodejs-20.17.0",
  nodejs: "nodejs-20.17.0"
};

/**
 * Execute code via the Wandbox API (cloud-based).
 * Used when local compilers are not available (e.g., on Vercel).
 */
async function executeViaWandbox(run) {
  const { runtime, files } = run;
  const compiler = WANDBOX_COMPILER_MAP[runtime];

  if (!compiler) {
    return {
      stdout: "",
      stderr: `Unsupported language: ${runtime}`,
      exitCode: 1
    };
  }

  const code = files && files.length > 0 ? files[0].content : "";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(WANDBOX_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        compiler: compiler,
        code: code,
        options: "",
        "compiler-option-raw": "",
        "runtime-option-raw": "",
        save: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text().catch(() => "Unknown error");
      logger.error({ status: response.status, text }, "Wandbox API error");
      return {
        stdout: "",
        stderr: `Compilation service error (${response.status}): ${text}`,
        exitCode: 1
      };
    }

    const result = await response.json();

    // Wandbox returns: { program_message, compiler_error, compiler_message, status }
    const stdout = result.program_message || "";
    const stderr = result.compiler_error || result.compiler_message || "";
    const exitCode = parseInt(result.status, 10);

    return {
      stdout,
      stderr,
      exitCode: isNaN(exitCode) ? (stdout ? 0 : 1) : exitCode
    };
  } catch (err) {
    if (err.name === "AbortError") {
      return { stdout: "", stderr: "⏱ Execution timed out (15s limit).", exitCode: 1 };
    }
    logger.error({ err, runtime }, "Wandbox API call failed");
    return { stdout: "", stderr: `Execution service error: ${err.message}`, exitCode: 1 };
  }
}

/**
 * Try local execution first, fall back to Wandbox API.
 */
async function executeDirectly(run) {
  const { runtime } = run;

  // For JS/Node, always try local first (fast and reliable)
  if (runtime === "javascript" || runtime === "nodejs") {
    try {
      return await executeLocally(run);
    } catch (err) {
      logger.warn({ err }, "Local JS execution failed, trying Wandbox");
      return await executeViaWandbox(run);
    }
  }

  // For compiled languages, try local first, fall back to Wandbox
  try {
    const result = await executeLocally(run);
    // If command was not found, use Wandbox instead
    if (result.exitCode === 127) {
      logger.info({ runtime }, "Local compiler not found, using Wandbox API");
      return await executeViaWandbox(run);
    }
    return result;
  } catch (err) {
    logger.info({ runtime }, "Local execution unavailable, using Wandbox API");
    return await executeViaWandbox(run);
  }
}

/**
 * Local execution — works when compilers are installed.
 */
const LOCAL_LANG_CONFIG = {
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
      const exe = os.platform() === "win32" ? ".\\a.exe" : "./a.out";
      return { cmd: exe, args: [] };
    }
  },
  c: {
    compile: (entry) => ({ cmd: "gcc", args: ["-o", "a.out", entry] }),
    run: () => {
      const exe = os.platform() === "win32" ? ".\\a.exe" : "./a.out";
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

async function executeLocally(run) {
  const { runtime, files, entrypoint } = run;
  const config = LOCAL_LANG_CONFIG[runtime];

  if (!config) {
    return { stdout: "", stderr: `Unsupported language: ${runtime}`, exitCode: 1 };
  }

  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "liquidide-"));
  try {
    await materializeFiles(runDir, files);
    const entry = sanitizeRelPath(entrypoint);

    if (config.compile) {
      const { cmd, args } = config.compile(entry);
      const compileResult = await execWithTimeout(cmd, args, TIMEOUT_MS, { cwd: runDir });
      if (compileResult.exitCode === 127) return compileResult;
      if (compileResult.exitCode !== 0) {
        return { stdout: "", stderr: compileResult.stderr || "Compilation failed", exitCode: compileResult.exitCode };
      }
    }

    const { cmd, args } = config.run(entry);
    return await execWithTimeout(cmd, args, TIMEOUT_MS, { cwd: runDir });
  } finally {
    await fs.rm(runDir, { recursive: true, force: true }).catch(() => {});
  }
}

// --- Utility functions ---

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
        if (err.code === "ENOENT") {
          resolve({ stdout: "", stderr: `Command not found: "${cmd}"`, exitCode: 127 });
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
