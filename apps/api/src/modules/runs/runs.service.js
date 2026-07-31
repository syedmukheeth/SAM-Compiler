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
 * ALL languages are executed inline - no queue/worker dependency.
 */
async function createRun(input) {
  const { userId } = input;
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
      
      // Must be awaited. When this was fire-and-forget, a fast run could reach
      // findByIdAndUpdate (below) before the insert landed; the update then
      // matched nothing, returned null, and nobody checked - leaving the run
      // stuck in "running" with empty output forever.
      await run.save();
      useMongo = true;
      logger.debug({ runId: run._id, runtime: input.runtime }, "Run record persisted");
    } catch (err) {
      logger.error({ err }, "Failed to initialize run record");
      run = null;
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
              logger.warn({ runId: run._id.toString() }, "Worker online but lacks Docker. Forcing cloud fallback.");
            }
          } catch {
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


        // Retry/backoff/retention come from DEFAULT_JOB_OPTIONS on the Queue.
        // jobId dedupes against a double-submit for the same run.
        await queue.add("execute", { runId: run._id.toString() }, { jobId: run._id.toString() });
        run.status = "queued";
        if (useMongo) {
          await RunModel.findByIdAndUpdate(run._id, { 
            status: run.status,
            stderr: run.stderr
          });
        }
        // Worker owns the "end" event for queued jobs - don't double-emit
        return;
      } else {
        // 🚀 Fallback to external sandbox (Judge0/Piston)
        try {
          logger.debug({ runId: run._id.toString() }, "Worker offline. Invoking cloud fallback.");
          const socketHandler = require("./socketHandler");
          const result = await executeViaPiston(runData, socketHandler.emitLog);


          logger.debug({ runId: run._id.toString(), status: result.status }, "Cloud fallback completed");
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

  // Trigger background task - .catch() guarantees "end" reaches client even on unhandled rejection
  runTask().catch((err) => {
    logger.error({ err }, "runTask unhandled rejection - emitting fallback end");
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
 * Engine health - now always "online" since we execute directly.
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
        } catch {
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

  // The Judge0/Piston cloud fallback is always reachable, so execution is
  // available whether or not a Docker worker has checked in. (This was
  // `workerOnline || true`, which is unconditionally true and read as a bug.)
  const canExecute = true;

  const mongoConnected = mongoose.connection.readyState === 1;
  const redisConnected = Boolean(redis) && redis.status === "ready";

  return {
    status: "healthy",
    uptime: process.uptime(),
    workerOnline,
    canExecute,
    mongoConnected,
    redisConnected,
    mode: workerOnline ? "primary-worker" : "cloud-sandbox",
    workerStats: workerStats || { status: isSandbox ? "cloud-sandbox" : "idle", activeJobs: 0 },
    version: require("../../../package.json").version,
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

