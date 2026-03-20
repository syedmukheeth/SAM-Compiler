const mongoose = require("mongoose");
const { RunModel } = require("./runs.model");
const { executeDirectly, isToolAvailable } = require("./directExecutor");
const { logger } = require("../../config/logger");
const { emitLog } = require("./socketHandler");
const { getRunsQueue, getRedisClient, WORKER_HEARTBEAT_KEY } = require("./runs.queue");

/**
 * Creates and executes a run directly on this server.
 * ALL languages are executed inline — no queue/worker dependency.
 */
async function createRun(input) {
  const isConnected = mongoose.connection.readyState >= 1;

  let run;
  let useMongo = false;

  if (isConnected) {
    try {
      run = await RunModel.create({
        projectId: input.projectId,
        runtime: input.runtime,
        status: "running",
        entrypoint: input.entrypoint,
        files: input.files,
        stdout: "",
        stderr: "",
        exitCode: null,
        startedAt: new Date(),
        finishedAt: null
      });
      useMongo = true;
      logger.info({ runId: run._id, runtime: input.runtime }, "Run created in MongoDB");
    } catch (err) {
      logger.error({ err }, "Failed to create run in MongoDB");
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
    // Small delay to allow frontend to subscribe to the socket
    await new Promise(resolve => setTimeout(resolve, 800));
    try {
      const runData = (run && typeof run.toObject === "function") ? run.toObject() : run;
      
      // Determine if we should attempt direct execution or delegate to worker
      const isCompiled = ["cpp", "c", "java", "go", "rust"].includes(runData.runtime);
      const hostTool = runData.runtime === "cpp" ? "g++" : 
                       runData.runtime === "c" ? "gcc" : 
                       runData.runtime === "java" ? "javac" : 
                       runData.runtime === "go" ? "go" :
                       runData.runtime === "rust" ? "rustc" : null;
                       
      // If we are on Render (Cloud), we MUST attempt direct execution
      const isCloud = !!process.env.RENDER;
      let canRunDirectly = isCloud || !hostTool || isToolAvailable(hostTool);
      
      // Safety: Never attempt direct compilation on Vercel even if tool seems present
      if (process.env.VERCEL && hostTool) {
        canRunDirectly = false;
      }

      if (canRunDirectly) {
        if (isCloud && hostTool && !isToolAvailable(hostTool)) {
            logger.warn({ hostTool }, "Attempting direct execution on Cloud even though initial check failed.");
        }
        const result = await executeDirectly(runData, emitLog);
        run.stdout = result.stdout;
        run.stderr = result.stderr;
        run.exitCode = result.exitCode;
        run.status = result.exitCode === 0 ? "succeeded" : "failed";
      } else {
        // Delegate to worker queue
        const queue = getRunsQueue();
        const redis = getRedisClient();
        let workerOnline = false;
        try {
          workerOnline = redis ? !!(await redis.get(WORKER_HEARTBEAT_KEY)) : false;
        } catch (e) {
          logger.warn({ e }, "Failed to fetch worker heartbeat during run creation");
        }

        if (queue) {
          if (workerOnline) {
            if (emitLog) emitLog(run._id.toString(), "stdout", "📡 \x1b[1;33mCompiler not found in Cloud Sandbox.\x1b[0m\n⏳ \x1b[1;34mDelegating to LiquidIDE Worker (Local)...\x1b[0m\n\r\n");
          } else {
            const workerCommand = "cd apps/worker && npm start";
            if (emitLog) {
              emitLog(run._id.toString(), "stderr", 
                "❌ \x1b[1;31mError: Local Execution Environment Offline.\x1b[0m\n" +
                "💡 \x1b[1;36mThis environment (Serverless) doesn't have native compilers.\x1b[0m\n\n" +
                "\x1b[1;33mTo run C++, please start your local worker:\x1b[0m\n" +
                `   \x1b[1;32m${workerCommand}\x1b[0m\n\n` +
                "🔗 \x1b[1;34mCloud Tip:\x1b[0m Deploy via Docker (see DEPLOYMENT.md) for 100% cloud execution.\n\r\n"
              );
            }
          }
          try {
            await queue.add("execute", { runId: run._id.toString() });
          } catch (qErr) {
            logger.error({ qErr }, "Failed to add job to BullMQ queue");
            if (emitLog) emitLog(run._id.toString(), "stderr", `\n❌ Queue Failure: ${qErr.message}\n`);
          }
          run.status = workerOnline ? "queued" : "failed"; // If worker is offline, mark as failed so it doesn't hang
          if (useMongo) {
            await RunModel.findByIdAndUpdate(run._id, { 
              status: run.status,
              stdout: workerOnline ? "📡 Delegating to Worker..." : "❌ Local Worker Offline"
            });
          }
          // CRITICAL: Always signal end so the "EXECUTING" spinner stops
          if (emitLog) emitLog(run._id.toString(), "end", { status: run.status });
          return;
        } else {
          const errMsg = "Cloud Sandbox lacks compilers and Redis Queue is offline.";
          if (emitLog) {
            emitLog(run._id.toString(), "stderr", `❌ ${errMsg}\n`);
            emitLog(run._id.toString(), "end", { status: "failed" });
          }
          throw new Error(errMsg);
        }
      }
      run.finishedAt = new Date();
    } catch (err) {
      logger.error({ err }, "Execution error");
      run.stderr = `Execution error: ${err.message}`;
      run.exitCode = 1;
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
          status: run.status,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt
        });
      } catch (err) {
        logger.warn({ err }, "Failed to persist run result to MongoDB");
      }
    }
    
    // Notify frontend that it's done via socket
    emitLog(run._id.toString(), "end", { status: run.status });
  };

  // Trigger background task
  runTask();

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
  
  if (redis) {
    try {
      const heartbeat = await redis.get(WORKER_HEARTBEAT_KEY);
      workerOnline = !!heartbeat;
    } catch (err) {
      logger.error({ err }, "Failed to get worker heartbeat from Redis");
    }
  }

  const isCloud = !!process.env.RENDER;

  return {
    online: true, // API is online
    workerOnline, // Actual worker status
    version: "0.6.0-STABLE",
    mode: isCloud ? "cloud-native" : "hybrid-distributed",
    message: isCloud 
      ? "Engine is running in Cloud-Native mode (All compilers active)."
      : (workerOnline 
          ? "Worker is online and ready for compiled languages." 
          : "Worker is offline. Compiled languages (C++/Java) will be queued."),
    timestamp: new Date().toISOString()
  };
}

module.exports = { createRun, getRun, getQueueStatus };
