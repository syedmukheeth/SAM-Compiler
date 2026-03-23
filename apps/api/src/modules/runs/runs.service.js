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
  if (!input.runtime) throw new Error("Runtime/Language is required");
  if (!input.code && (!input.files || input.files.length === 0)) {
    throw new Error("No code or files provided for execution");
  }
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
      const hostTool = runData.runtime === "cpp" ? "g++" : 
                       runData.runtime === "c" ? "gcc" : 
                       runData.runtime === "java" ? "javac" : null;
                       
      const isCloud = !!process.env.RENDER;
      let canRunDirectly = !hostTool || isToolAvailable(hostTool);
      
      if (process.env.VERCEL && hostTool) canRunDirectly = false;

      if (canRunDirectly) {
        const result = await executeDirectly(runData, emitLog);
        run.stdout = result.stdout;
        run.stderr = result.stderr;
        run.exitCode = result.exitCode;
        run.status = result.exitCode === 0 ? "succeeded" : "failed";
      } else {
        const queue = getRunsQueue();
        const redis = getRedisClient();
        let workerOnline = false;
        try {
          workerOnline = redis ? !!(await redis.get(WORKER_HEARTBEAT_KEY)) : false;
        } catch (e) {
          logger.warn({ e }, "Worker heartbeat check failed");
        }

        if (queue && workerOnline) {
          if (emitLog) emitLog(run._id.toString(), "stdout", `📡 \x1b[1;33m${hostTool} delegating to Worker...\x1b[0m\n\r\n`);
          await queue.add("execute", { runId: run._id.toString() });
          run.status = "queued";
        } else {
          const isVercel = !!process.env.VERCEL;
          const toolName = hostTool === 'javac' ? 'JDK' : hostTool === 'g++' ? 'G++' : hostTool === 'gcc' ? 'GCC' : 'Compiler';
          
          let errMsg = `❌ \x1b[1;31mError: ${hostTool || "Compiler"} not found.\x1b[0m\n`;
          
          if (isVercel) {
            errMsg += `💡 \x1b[1;36mLiquidIDE Vercel requires an external worker for compiled languages (${hostTool}).\x1b[0m\n` +
                      `💡 \x1b[1;36mPlease start your LiquidIDE worker locally to process this run.\x1b[0m\n\r\n`;
          } else {
            errMsg += `💡 \x1b[1;36mIf running locally, ensure ${toolName} is installed and in your PATH.\x1b[0m\n` +
                      `💡 \x1b[1;36mOtherwise, start your LiquidIDE worker to handle compiled languages.\x1b[0m\n\r\n`;
          }

          if (emitLog) emitLog(run._id.toString(), "stderr", errMsg);
          run.status = "failed";
          run.stderr = isVercel ? "Worker offline (Required for Vercel)" : "Compiler not found";
        }

        if (useMongo) {
          await RunModel.findByIdAndUpdate(run._id, { 
            status: run.status,
            stderr: run.stderr
          });
        }
        
        return;
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
