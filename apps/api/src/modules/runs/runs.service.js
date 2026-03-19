const mongoose = require("mongoose");
const { RunModel } = require("./runs.model");
const { getRunsQueue } = require("./runs.queue");
const { executeDirectly } = require("./directExecutor");
const { logger } = require("../../config/logger");

// Languages that execute inline on this serverless function (no compiler needed)
const INLINE_LANGUAGES = new Set(["javascript", "nodejs"]);

async function createRun(input) {
  const isConnected = mongoose.connection.readyState === 1;
  const useInline = INLINE_LANGUAGES.has(input.runtime);

  let run;
  let useMongo = false;

  if (isConnected) {
    try {
      run = await RunModel.create({
        projectId: input.projectId,
        runtime: input.runtime,
        status: useInline ? "running" : "queued",
        entrypoint: input.entrypoint,
        files: input.files,
        stdout: "",
        stderr: "",
        exitCode: null,
        startedAt: useInline ? new Date() : null,
        finishedAt: null
      });
      useMongo = true;
    } catch (err) {
      logger.error({ err }, "Failed to create run in MongoDB");
    }
  }

  if (!run) {
    const runId = new mongoose.Types.ObjectId().toString();
    run = {
      _id: runId,
      ...input,
      status: useInline ? "running" : "queued",
      stdout: "",
      stderr: "",
      exitCode: null,
      startedAt: useInline ? new Date() : null,
      finishedAt: null,
    };
  }

  if (useInline) {
    // Execute JavaScript directly — instant, no queue needed
    try {
      const result = await executeDirectly(run);
      run.stdout = result.stdout;
      run.stderr = result.stderr;
      run.exitCode = result.exitCode;
      run.status = result.exitCode === 0 ? "succeeded" : "failed";
      run.finishedAt = new Date();
    } catch (err) {
      logger.error({ err }, "Inline execution error");
      run.stderr = `Execution error: ${err.message}`;
      run.exitCode = 1;
      run.status = "failed";
      run.finishedAt = new Date();
    }

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
        logger.warn({ err }, "Failed to persist inline run result to MongoDB");
      }
    }
  } else {
    // Compiled languages: push to BullMQ queue for the Worker to process
    if (!useMongo) {
      // Cannot queue without MongoDB (no runId to track)
      run.stderr = "Code execution service temporarily unavailable. Please try again.";
      run.status = "failed";
      run.exitCode = 1;
      run.finishedAt = new Date();
      return run;
    }

    try {
      const queue = getRunsQueue();
      if (!queue) throw new Error("Queue unavailable");

      const queuePromise = queue.add(
        "execute",
        { runId: run._id.toString() },
        {
          removeOnComplete: { age: 3600, count: 1000 },
          removeOnFail: { age: 24 * 3600, count: 1000 }
        }
      );

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Redis Timeout")), 3000)
      );

      await Promise.race([queuePromise, timeoutPromise]);
      logger.info({ runId: run._id, runtime: run.runtime }, "Job queued for Worker");
    } catch (err) {
      logger.error({ err }, "Failed to enqueue job");
      // Mark as failed so frontend shows an error instead of hanging
      run.status = "failed";
      run.stderr = `Failed to queue job: ${err.message}`;
      run.exitCode = 1;
      run.finishedAt = new Date();
      if (useMongo) {
        await RunModel.findByIdAndUpdate(run._id, {
          status: run.status,
          stderr: run.stderr,
          exitCode: run.exitCode,
          finishedAt: run.finishedAt
        }).catch(() => {});
      }
    }
  }

  return run;
}

async function getRun(runId) {
  if (mongoose.connection.readyState === 1) {
    try {
      const run = await RunModel.findById(runId).lean();
      if (run) return run;
    } catch (err) {
      logger.warn({ err, runId }, "Failed to find run in MongoDB");
    }
  }
  return null;
}

async function getQueueStatus() {
  try {
    const queue = getRunsQueue();
    if (!queue) return { online: false, message: "Queue disconnected" };
    
    // Check for active workers
    const workers = await queue.getWorkers();
    const count = workers.length;
    
    return {
      online: count > 0,
      workerCount: count,
      queueName: queue.name,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    logger.error({ err }, "Failed to get queue status");
    return { online: false, error: err.message };
  }
}

module.exports = { createRun, getRun, getQueueStatus };
