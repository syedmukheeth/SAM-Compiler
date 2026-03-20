const mongoose = require("mongoose");
const { RunModel } = require("./runs.model");
const { executeDirectly } = require("./directExecutor");
const { logger } = require("../../config/logger");
const { emitLog } = require("./socketHandler");

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
      const result = await executeDirectly(run, emitLog);
      run.stdout = result.stdout;
      run.stderr = result.stderr;
      run.exitCode = result.exitCode;
      run.status = result.exitCode === 0 ? "succeeded" : "failed";
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
  return {
    online: true,
    version: "0.5.2", // Match frontend version
    mode: "direct-execution",
    message: "Code runs directly on the API server.",
    timestamp: new Date().toISOString()
  };
}

module.exports = { createRun, getRun, getQueueStatus };
