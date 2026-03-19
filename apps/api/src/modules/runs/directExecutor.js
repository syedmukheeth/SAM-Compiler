const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { logger } = require("../../config/logger");

const TIMEOUT_MS = 15000;

/**
 * Piston API — free, open-source code execution engine.
 * Supports C++, C, Java, Python, JavaScript and 50+ languages.
 * No API key needed.
 */
const PISTON_URL = "https://emkc.org/api/v2/piston/execute";

const PISTON_LANG_MAP = {
  cpp: { language: "c++", version: "10.2.0" },
  c: { language: "c", version: "10.2.0" },
  java: { language: "java", version: "15.0.2" },
  python: { language: "python", version: "3.10.0" },
  javascript: { language: "javascript", version: "18.15.0" },
  nodejs: { language: "javascript", version: "18.15.0" }
};

/**
 * Execute code via the Piston API (cloud-based).
 * Used when local compilers are not available (e.g., on Vercel).
 */
async function executeViaPiston(run) {
  const { runtime, files } = run;
  const mapping = PISTON_LANG_MAP[runtime];
  
  if (!mapping) {
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

    const response = await fetch(PISTON_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: mapping.language,
        version: mapping.version,
        files: [{ content: code }]
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text().catch(() => "Unknown error");
      return {
        stdout: "",
        stderr: `Execution service error: ${response.status} ${text}`,
        exitCode: 1
      };
    }

    const result = await response.json();
    
    // Piston returns { run: { stdout, stderr, code, signal, output }, compile: { ... } }
    const compilePhase = result.compile || {};
    const runPhase = result.run || {};

    // If compilation failed
    if (compilePhase.code && compilePhase.code !== 0) {
      return {
        stdout: compilePhase.stdout || "",
        stderr: compilePhase.stderr || compilePhase.output || "Compilation failed",
        exitCode: compilePhase.code || 1
      };
    }

    return {
      stdout: runPhase.stdout || "",
      stderr: runPhase.stderr || "",
      exitCode: runPhase.code ?? 0
    };
  } catch (err) {
    if (err.name === "AbortError") {
      return { stdout: "", stderr: "⏱ Execution timed out (15s limit).", exitCode: 1 };
    }
    logger.error({ err, runtime }, "Piston API call failed");
    return { stdout: "", stderr: `Execution service error: ${err.message}`, exitCode: 1 };
  }
}

/**
 * Try local execution first, fall back to Piston API.
 */
async function executeDirectly(run) {
  const { runtime, files, entrypoint } = run;

  // For JS/Node, always try local first (fast and reliable)
  if (runtime === "javascript" || runtime === "nodejs") {
    try {
      return await executeLocally(run);
    } catch (err) {
      logger.warn({ err }, "Local JS execution failed, trying Piston");
      return await executeViaPiston(run);
    }
  }

  // For compiled languages, try local first, fall back to Piston
  try {
    const result = await executeLocally(run);
    // If command was not found, use Piston instead
    if (result.exitCode === 127) {
      logger.info({ runtime }, "Local compiler not found, using Piston API");
      return await executeViaPiston(run);
    }
    return result;
  } catch (err) {
    logger.info({ runtime }, "Local execution unavailable, using Piston API");
    return await executeViaPiston(run);
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

    // Compile if needed
    if (config.compile) {
      const { cmd, args } = config.compile(entry);
      const compileResult = await execWithTimeout(cmd, args, TIMEOUT_MS, { cwd: runDir });
      if (compileResult.exitCode === 127) return compileResult; // Command not found
      if (compileResult.exitCode !== 0) {
        return { stdout: "", stderr: compileResult.stderr || "Compilation failed", exitCode: compileResult.exitCode };
      }
    }

    // Run
    const { cmd, args } = config.run(entry);
    return await execWithTimeout(cmd, args, TIMEOUT_MS, { cwd: runDir });
  } catch (err) {
    throw err;
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
