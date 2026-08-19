const mongoose = require("mongoose");
const { RunModel } = require("./runs.model");
const { executeViaPiston } = require("./pistonExecutor");
const { logger } = require("../../config/logger");
// socketHandler is required lazily inside functions to avoid circular dependency issues

const { isVercel } = require("../../config/env");
const { getRunsQueue, getRedisClient, getRedisDiagnostics, WORKER_HEARTBEAT_KEY } = require("./runs.queue");

module.exports = {
  createRun,
  getRun,
  getQueueStatus,
  getUserHistory,
  // Exported for tests: the timeout below is the only thing standing between a
  // dead Redis and a permanently stuck run.
  readWorkerHeartbeat
};

// The Redis client is built with `maxRetriesPerRequest: null` and an offline
// queue (see runs.queue.js), which means a command issued while the connection
// is down is buffered and its promise NEVER settles. `createRun` awaited such a
// GET with no timeout, so on any deployment without a reachable Redis the
// background run task hung forever: the run stayed "running", no output was
// ever written, and no "end" event was emitted. Every heartbeat read now goes
// through here, which refuses to issue the command unless the socket is ready
// and still caps how long it may take.
const WORKER_HEARTBEAT_TIMEOUT_MS = 2000;

async function readWorkerHeartbeat(client) {
  const redis = client === undefined ? getRedisClient() : client;
  if (!redis || redis.status !== "ready") return null;

  let timer;
  try {
    return await Promise.race([
      redis.get(WORKER_HEARTBEAT_KEY),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Redis heartbeat timed out")),
          WORKER_HEARTBEAT_TIMEOUT_MS
        );
      })
    ]);
  } catch (err) {
    logger.warn({ err }, "Worker heartbeat read failed");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** A worker only counts as online if it reported a usable Docker sandbox. */
function parseWorkerStats(heartbeatRaw) {
  if (!heartbeatRaw) return null;
  try {
    return JSON.parse(heartbeatRaw);
  } catch {
    return null;
  }
}


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
      // ANALYSIS: Try to find a descriptive string literal in output statements
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
      // NITRO: Instantiate model and save in background to avoid blocking the execution request
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
      // Direct execution on the API host is forbidden.
      // Delegation flow: worker pool (primary) -> Judge0/Piston API (fallback).
      const stats = parseWorkerStats(await readWorkerHeartbeat());
      // A worker must explicitly report Docker availability to take local jobs.
      const workerOnline = stats?.hasDocker === true;
      if (stats && !workerOnline) {
        logger.warn({ runId: run._id.toString() }, "Worker online but lacks Docker. Forcing cloud fallback.");
      }
      const queue = workerOnline ? getRunsQueue() : null;

      if (queue && workerOnline) {
        const socketHandler = require("./socketHandler");
        if (socketHandler.emitLog) socketHandler.emitLog(run._id.toString(), "stdout", `\x1b[1;33m[SAM] Delegating to hardened worker...\x1b[0m\n\r\n`);


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
        // Fallback to the external sandbox (Judge0/Piston).
        try {
          logger.debug({ runId: run._id.toString() }, "Worker offline. Invoking cloud fallback.");
          const socketHandler = require("./socketHandler");
          const result = await executeViaPiston(runData, socketHandler.emitLog);


          logger.debug({ runId: run._id.toString(), status: result.status }, "Cloud fallback completed");
          run.stdout = result.stdout;
          run.stderr = result.stderr;
          run.exitCode = result.exitCode;
          run.status = result.status;
          run.metrics = result.metrics || {};
        } catch (pistonErr) {
          let errMsg = `\x1b[1;31m[SAM] Error: execution environment unavailable.\x1b[0m\n`;

          if (isVercel) {
            errMsg += `\x1b[1;36m[SAM] Cloud sandbox: fallback execution failed.\x1b[0m\n` +
                      `\x1b[1;36m[SAM] Start your SAM worker locally for high-performance runs.\x1b[0m\n\r\n`;
          } else {
            errMsg += `\x1b[1;36m[SAM] Primary worker is offline and the cloud fallback failed.\x1b[0m\n` +
                      `\x1b[1;36m[SAM] Ensure your SAM worker is running or check your internet connection.\x1b[0m\n\r\n`;
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
  const heartbeat = await readWorkerHeartbeat();
  let workerStats = parseWorkerStats(heartbeat);
  if (!workerStats && heartbeat) workerStats = { timestamp: heartbeat };
  // A worker must explicitly report Docker availability to be considered live
  // for primary execution.
  // Without Redis there is no heartbeat to trust, so the worker is never live
  // (the API node itself is not allowed to execute code).
  const isSandbox = !redis;
  const workerOnline = !isSandbox && workerStats?.hasDocker === true;

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
    // `redisConnected: false` on its own gave no way to tell "not configured"
    // from "configured but refusing connections", which is exactly the question
    // to answer when the worker never shows up.
    redis: getRedisDiagnostics(),
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

