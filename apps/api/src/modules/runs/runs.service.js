const mongoose = require("mongoose");
const { RunModel } = require("./runs.model");
const { executeViaPiston } = require("./pistonExecutor");
const { logger } = require("../../config/logger");
// socketHandler is required lazily inside functions to avoid circular dependency issues

const { isVercel } = require("../../config/env");
const { getRunsQueue, getRedisClient, WORKER_HEARTBEAT_KEY } = require("./runs.queue");

module.exports = {
  createRun,
  getRun,
  getQueueStatus,
  getUserHistory
};


/**
 * Extracts a meaningful "title" from the run's code.
 * Skips boilerplate, headers, and comments to find the first functional line.
 */
function generateRunTitle(code, _runtime) { // eslint-disable-line no-unused-vars
  if (!code) return "Empty Run";
  const lines = code.split("\n");
  const skipPatterns = [
    /^\s*#include/, /^\s*import/, /^\s*package/, /^\s*using namespace/,
    /^\s*\/\//, /^\s*\/\*/, /^\s*\*/, /^\s*$/, /^\s*{\s*$/, /^\s*}\s*$/,
    /\*\/\s*$/, 
    /\b(int|void|public static void)\s+main\b/,
    /\b(class|struct|module|namespace)\b/
  ];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && !skipPatterns.some(p => p.test(line))) {
      // 🚀 ANALYSIS: Try to find a descriptive string literal in output statements
      const outputMatch = line.match(/(?:cout\s*<<\s*|print\s*\(|System\.out\.println\s*\(|console\.log\s*\()(?:"|')([^"']+)(?:"|')/i);
      if (outputMatch && outputMatch[1].trim().length > 3) {
        return outputMatch[1].trim().substring(0, 47) + (outputMatch[1].length > 47 ? "..." : "");
      }
      return trimmed.length > 50 ? trimmed.substring(0, 47) + "..." : trimmed;
    }
  }
  
  // Minimal fallback: find first non-empty line
  for (const line of lines) {
     if (line.trim().length > 0) return line.trim().substring(0, 50);
  }

  return "Untitled Run";
}

/**
 * Creates and executes a run directly on this server.
 * ALL languages are executed inline — no queue/worker dependency.
 */
async function createRun(input) {
  const { userId } = input;
  logger.info({ userId, runtime: input.runtime }, "📡 [SAM-AUDIT] [API] createRun called");
  if (!input.runtime) throw new Error("Runtime/Language is required");
  if (!input.code && (!input.files || input.files.length === 0)) {
    throw new Error("No code or files provided for execution");
  }
  const isConnected = mongoose.connection.readyState >= 1;

  // Generate a meaningful title for the history panel
  const mainFile = input.files?.find(f => f.path === input.entrypoint) || input.files?.[0];
  const codeForTitle = mainFile ? mainFile.content : (input.code || "");
  const runTitle = generateRunTitle(codeForTitle, input.runtime);

  let run;
  let useMongo = false;

  if (isConnected) {
    try {
      // 🚀 NITRO: Instantiate model and save in background to avoid blocking the execution request
      run = new RunModel({
        projectId: input.projectId,
        userId: userId,
        runtime: input.runtime,
        title: runTitle,
        status: "running",
        entrypoint: input.entrypoint,
        files: input.files,
        stdin: input.stdin || "",
        stdout: "",
        stderr: "",
        exitCode: null,
        startedAt: new Date(),
        finishedAt: null
      });
      
      run.save().catch(err => logger.error({ err }, "Background run persistence failed"));
      useMongo = true;
      logger.info({ runId: run._id, runtime: input.runtime }, "Run initialized optimistically");
    } catch (err) {
      logger.error({ err }, "Failed to initialize run record");
    }
  } else {
    logger.warn("MongoDB not connected. Running without persistence.");
  }

  if (!run) {
    const runId = new mongoose.Types.ObjectId().toString();
    run = {
      _id: runId,
      ...input,
      status: "running",
      stdout: "",
      stderr: "",
      exitCode: null,
      startedAt: new Date(),
      finishedAt: null,
    };
  }

  // Execute ALL languages directly on this server (in the background)
  const runTask = async () => {
    try {
      const runData = (run && typeof run.toObject === "function") ? run.toObject() : run;
      // 🛡️ SECURITY AUDIT FIX: Direct execution on host is forbidden.
      // Delegation Flow: Worker Pool (Primary) -> Judge0/Piston API (Fallback)
      const queue = getRunsQueue();
      const redis = getRedisClient();
      let workerOnline = false;
      try {
        const heartbeatRaw = redis ? await redis.get(WORKER_HEARTBEAT_KEY) : null;
        if (heartbeatRaw) {
          try {
            const stats = JSON.parse(heartbeatRaw);
            // Worker must explicitly report Docker availability to take local jobs
            workerOnline = stats.hasDocker === true;
            if (!workerOnline) {
              logger.warn({ runId: run._id.toString() }, "📡 [SAM-AUDIT] [API] Worker online but lacks Docker. Forcing Cloud Fallback.");
            }
          } catch (parseErr) {
            // If we can't parse or it's old format, assume NOT capable for safety
            workerOnline = false;
          }
        }
      } catch (e) {
        logger.warn({ e }, "Worker heartbeat check failed");
      }

      if (queue && workerOnline) {
        const socketHandler = require("./socketHandler");
        if (socketHandler.emitLog) socketHandler.emitLog(run._id.toString(), "stdout", `📡 \x1b[1;33mDelegating to Hardened Worker...\x1b[0m\n\r\n`);


        logger.info({ runId: run._id.toString() }, "📡 [SAM-AUDIT] [API] Adding job to BullMQ");
        await queue.add("execute", { runId: run._id.toString() });
        logger.info({ runId: run._id.toString() }, "📡 [SAM-AUDIT] [API] Job added successfully to BullMQ");
        run.status = "queued";
        if (useMongo) {
          await RunModel.findByIdAndUpdate(run._id, { 
            status: run.status,
            stderr: run.stderr
          });
        }
        // Worker owns the "end" event for queued jobs — don't double-emit
        return;
      } else {
        // 🚀 Fallback to external sandbox (Judge0/Piston)
        try {
          logger.info({ runId: run._id.toString() }, "📡 [SAM-AUDIT] [API] Worker Offline. Invoking Cloud Fallback (Piston)");
          const socketHandler = require("./socketHandler");
          const result = await executeViaPiston(runData, socketHandler.emitLog);


          logger.info({ runId: run._id.toString(), status: result.status }, "📡 [SAM-AUDIT] [API] Piston Fallback completed");
          run.stdout = result.stdout;
          run.stderr = result.stderr;
          run.exitCode = result.exitCode;
          run.status = result.status;
        } catch (pistonErr) {
          let errMsg = `❌ \x1b[1;31mError: Execution environment unavailable.\x1b[0m\n`;
          
          if (isVercel) {
            errMsg += `💡 \x1b[1;36mCloud Sandbox: Fallback execution failed.\x1b[0m\n` +
                      `💡 \x1b[1;36mPlease start your SAM worker locally for high-performance runs.\x1b[0m\n\r\n`;
          } else {
            errMsg += `💡 \x1b[1;36mPrimary worker is offline and Cloud Fallback failed.\x1b[0m\n` +
                      `💡 \x1b[1;36mEnsure your SAM worker is running or check your internet connection.\x1b[0m\n\r\n`;
          }

          const socketHandler = require("./socketHandler");
          if (socketHandler.emitLog) socketHandler.emitLog(run._id.toString(), "stderr", errMsg);


          run.status = "failed";
          run.stderr = `Environment Failure: ${pistonErr.message}`;
        }
      }
      run.finishedAt = new Date();
    } catch (err) {
      logger.error({ err }, "Execution error");
      run.stderr = err.message;
      run.status = "failed";
      run.finishedAt = new Date();
    }

    // Persist results if MongoDB is available
    if (useMongo) {
      try {
        await RunModel.findByIdAndUpdate(run._id, {
          stdout: run.stdout,
          stderr: run.stderr,
          exitCode: run.exitCode,
          metrics: run.metrics || {},
          status: run.status,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt
        });
      } catch (err) {
        logger.warn({ err }, "Failed to persist run result to MongoDB");
      }
    }
    
    // Notify frontend that it's done via socket
    const socketHandler = require("./socketHandler");
    socketHandler.emitLog(run._id.toString(), "end", { status: run.status, metrics: run.metrics });


  };

  // Trigger background task — .catch() guarantees "end" reaches client even on unhandled rejection
  runTask().catch((err) => {
    logger.error({ err }, "runTask unhandled rejection — emitting fallback end");
    const socketHandler = require("./socketHandler");
    socketHandler.emitLog(run._id.toString(), "end", { status: "failed" });


  });

  return run;
}

async function getRun(runId) {
  const state = mongoose.connection.readyState;
  if (state >= 1) {
    try {
      const run = await RunModel.findById(runId).lean();
      if (run) return run;
      logger.warn({ runId }, "Run not found in MongoDB");
    } catch (err) {
      logger.error({ err, runId }, "Database error during getRun");
    }
  } else {
    logger.error({ state, runId }, "Cannot getRun: MongoDB not connected");
  }
  return null;
}

/**
 * Engine health — now always "online" since we execute directly.
 */
async function getQueueStatus() {
  const redis = getRedisClient();
  let workerOnline = false;
  let workerStats = null;
  
  if (redis) {
    try {
      // 🛡️ TIMEOUT: Don't let a hanging Redis block the health check
      const heartbeat = await Promise.race([
        redis.get(WORKER_HEARTBEAT_KEY),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Redis Timeout")), 3000))
      ]);

      if (heartbeat) {
        try {
          workerStats = JSON.parse(heartbeat);
          // Worker must explicitly report Docker availability to be considered "Live" for primary execution
          workerOnline = workerStats.hasDocker === true;
        } catch (e) {
          workerOnline = false;
          workerStats = { timestamp: heartbeat };
        }
      }
    } catch (err) {
      logger.error({ err }, "Failed to get worker heartbeat from Redis");
    }
  }

  const isSandbox = !redis;
  if (isSandbox) {
    workerOnline = false; // Forced false as the API node can no longer execute code
  }

  // 🛡️ HARDENING: canExecute is true if worker is online OR if fallback is active
  const canExecute = workerOnline || true; // Fallback is currently siempre disponible

  return {
    status: "healthy",
    uptime: process.uptime(),
    workerOnline,
    canExecute,
    mode: workerOnline ? "primary-worker" : "cloud-sandbox",
    workerStats: workerStats || { status: isSandbox ? "cloud-sandbox" : "idle", activeJobs: 0 },
    version: "3.5.2-stable",
    runtimeMode: isVercel ? "serverless" : "distributed-worker",
    cluster: isVercel ? "cloud-edge" : "local-node",
    message: workerOnline 
      ? "SAM Compiler engine is fully operational." 
      : "Primary worker offline. Falling back to Piston/Judge0 execution.",
    timestamp: new Date().toISOString()
  };
}

async function getUserHistory(userId) {
  const state = mongoose.connection.readyState;
  if (state >= 1) {
    try {
      return await RunModel.find({ userId })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
    } catch (err) {
      logger.error({ err, userId }, "Database error during getUserHistory");
    }
  }
  return [];
}

// Exports moved to top for circular dependency resolution

