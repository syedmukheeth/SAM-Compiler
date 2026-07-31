const http = require("node:http");
const os = require("node:os");
const { Worker } = require("bullmq");
const { logger } = require("./config/logger");
const crypto = require("node:crypto");
const { env } = require("./config/env");
const { connectMongo } = require("./config/mongo");
const { RunModel } = require("./db/run.model");
const { RUNS_QUEUE_NAME } = require("./queue/constants");
const { executeRun } = require("./sandbox/multiSandbox");

function startHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(3001, () => logger.info("Worker health server listening on :3001"));
}

async function main() {
  const Redis = require("ioredis");
  const { execSync } = require("child_process");
  const redisClient = new Redis(redisConnectionFromUrl(env.REDIS_URL));
  
  let hasDocker = false;
  try {
    execSync("docker --version", { stdio: "ignore" });
    hasDocker = true;
    logger.info("🐳 Docker detected on host. Hardened sandbox enabled.");
  } catch {
    logger.warn("⚠️ Docker NOT detected on host. Worker will report capability to API for intelligent fallback.");
  }

  startHealthServer();
  await connectMongo();

  logger.info("SAM Compiler worker connected. Waiting for jobs...");

  let activeJobs = 0;
  // Hoisted so the shutdown handler below can close it.
  let worker = null;

  if (hasDocker) {
    worker = new Worker(
      RUNS_QUEUE_NAME,
      async (job) => {
        activeJobs++;
        try {
          const run = await RunModel.findById(job.data.runId);
          if (!run) {
            logger.warn({ runId: job.data.runId }, "Run not found");
            return;
          }

          logger.info({ runId: job.data.runId }, "📡 [SAM-AUDIT] [WORKER] Job picked up from queue");
          run.status = "running";
          run.startedAt = new Date();
          await run.save();

          const logChannel = `run:logs:${run._id}`;
          const publishLog = (type, chunk) => {
            redisClient.publish(logChannel, JSON.stringify({ type, chunk })).catch(err => {
              logger.error({ err, runId: run._id }, "Failed to publish log to Redis");
            });
          };

          let executionError = null;
          try {
            const { stdout, stderr, exitCode, status, metrics } = await executeRun({
              language: run.runtime,
              files: run.files,
              entrypoint: run.entrypoint,
              stdin: run.stdin || ""
            }, publishLog);

            run.stdout = stdout;
            run.stderr = stderr;
            run.exitCode = exitCode;
            run.metrics = metrics || {};
            run.status = status || (exitCode === 0 ? "succeeded" : "failed");
          } catch (err) {
            // Only infrastructure failures reach here now - a user program that
            // exits non-zero returns normally with a status. The stack used to
            // be appended to run.stderr and streamed to the user's terminal,
            // exposing worker internals and host paths; it is logged instead.
            run.status = "failed";
            logger.error({ err, runId: run._id }, "Job execution failed");
            const userMessage = "The execution sandbox was unavailable for this run. Please try again.";
            run.stderr = (run.stderr ?? "") + "\n" + userMessage;
            run.exitCode = run.exitCode ?? 1;
            publishLog("stderr", userMessage);
            executionError = err;
          } finally {
            run.finishedAt = new Date();
            await run.save();
            publishLog("end", { status: run.status, metrics: run.metrics });
            logger.info({ runId: run._id, status: run.status }, "Job finished");
          }

          // Surface infrastructure failures to BullMQ so the configured
          // attempts/backoff actually retry them. Swallowing the error marked
          // the job completed and no retry ever happened.
          if (executionError) throw executionError;
        } catch (err) {
           logger.error({ err, jobId: job.id }, "Fatal job processing error");
        } finally {
          activeJobs = Math.max(0, activeJobs - 1);
        }
      },
      { connection: redisConnectionFromUrl(env.REDIS_URL), concurrency: parseInt(process.env.WORKER_CONCURRENCY || "3") }
    );

    worker.on("failed", (job, err) => {
      logger.error({ job: job?.id, err }, "Job failed permanently");
    });
  } else {
    logger.warn("⚠️ Execution Worker NOT started. This instance will only report health status.");
  }

  // Use a unique heartbeat key per worker instance to support distributed scaling
  const workerId = `${os.hostname()}-${crypto.randomBytes(4).toString("hex")}`;
  const HEARTBEAT_KEY = `sam:worker:heartbeat:${workerId}`;
  
  const startHeartbeatLocal = async () => {
    const interval = 5000;
    const update = async () => {
      try {
        const stats = {
          workerId,
          timestamp: Date.now(),
          cpuLoad: os.loadavg()[0],
          memFree: os.freemem(),
          memTotal: os.totalmem(),
          platform: os.platform(),
          cpus: os.cpus().length,
          activeJobs,
          hasDocker
        };
        // Keep individual heartbeat alive for 15s
        await redisClient.setex(HEARTBEAT_KEY, 15, JSON.stringify(stats));
        
        // Also update a global "last capable heartbeat" key for simpler API polling (legacy support)
        if (hasDocker) {
          await redisClient.setex("sam:worker:heartbeat", 15, JSON.stringify(stats));
        }
      } catch (err) {
        logger.warn({ err }, "Failed to send worker heartbeat");
      }
    };
    await update();
    setInterval(update, interval);
  };

  await startHeartbeatLocal();

  // 🔥 INTERVIEW DEMO MODE: Keep-alive self-ping to prevent platform sleep
  setInterval(async () => {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get("http://localhost:3001/health", (res) => {
          if (res.statusCode === 200) resolve();
          else reject(new Error(`Status: ${res.statusCode}`));
        });
        req.on("error", reject);
        req.setTimeout(5000, () => { req.destroy(); reject(new Error("Timeout")); });
      });
      logger.debug("Warmup pulse successful (Instance active)");
    } catch (err) {
      logger.warn({ err: err.message }, "Worker warmup pulse failed");
    }
  }, 5 * 60 * 1000); // 5 minutes

  // The worker had no signal handling at all, so every redeploy killed
  // in-flight sandboxed jobs mid-execution and left their BullMQ locks to
  // expire. worker.close() lets running jobs finish before we exit.
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal, activeJobs }, "Worker shutting down gracefully");

    const forceExit = setTimeout(() => {
      logger.error("Worker shutdown timed out, forcing exit");
      process.exit(1);
    }, 30000);
    forceExit.unref();

    try {
      if (worker) await worker.close();
      await redisClient.quit().catch(() => {});
      const mongoose = require("mongoose");
      await mongoose.connection.close(false);
      clearTimeout(forceExit);
      logger.info("Worker shutdown complete");
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "Error during worker shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception - exiting");
  process.exit(1);
});

function redisConnectionFromUrl(redisUrl) {
  const u = new URL(redisUrl);
  const port = u.port ? Number(u.port) : 6379;
  const password = u.password ? decodeURIComponent(u.password) : undefined;
  return { 
    host: u.hostname, 
    port, 
    password,
    tls: u.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
    enableOfflineQueue: true,
    connectTimeout: 10000
  };
}

main().catch((err) => {
  logger.fatal({ err }, "Worker crashed");
  process.exit(1);
});
