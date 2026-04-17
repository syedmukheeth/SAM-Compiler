const http = require("node:http");
const os = require("node:os");
const { Worker } = require("bullmq");
const { logger } = require("./config/logger");
const { env } = require("./config/env");
const { connectMongo } = require("./config/mongo");
const { RunModel } = require("./db/run.model");
const { RUNS_QUEUE_NAME } = require("./queue/constants");
const { executeRun } = require("./sandbox/multiSandbox");

async function startHeartbeat(redisClient, getWorkerStats) {
  const HEARTBEAT_KEY = "sam:worker:heartbeat";
  const interval = 5000; // 5 seconds for more "real-time" feel

  const update = async () => {
    try {
      const stats = {
        timestamp: Date.now(),
        cpuLoad: os.loadavg()[0],
        memFree: os.freemem(),
        memTotal: os.totalmem(),
        platform: os.platform(),
        cpus: os.cpus().length,
        ...(getWorkerStats ? getWorkerStats() : {})
      };
      await redisClient.setex(HEARTBEAT_KEY, 15, JSON.stringify(stats));
      logger.debug({ stats }, "Worker heartbeat sent");
    } catch (err) {
      logger.warn({ err }, "Failed to send worker heartbeat");
    }
  };

  await update();
  setInterval(update, interval);
}

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
  const redisClient = new Redis(redisConnectionFromUrl(env.REDIS_URL));
  
  startHealthServer();
  await connectMongo();

  logger.info("SAM Compiler worker connected. Waiting for jobs...");

  let activeJobs = 0;

  const worker = new Worker(
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

        try {
          const { stdout, stderr, exitCode, metrics } = await executeRun({
            language: run.runtime,
            files: run.files,
            entrypoint: run.entrypoint
          }, publishLog);

          run.stdout = stdout;
          run.stderr = stderr;
          run.exitCode = exitCode;
          run.metrics = metrics || {};
          run.status = exitCode === 0 ? "succeeded" : "failed";
        } catch (err) {
          run.status = "failed";
          logger.error({ err, runId: run._id }, "Job execution failed");
          const msg = err instanceof Error ? err.stack || err.message : String(err);
          run.stderr = (run.stderr ?? "") + "\n" + msg;
          run.exitCode = run.exitCode ?? 1;
          publishLog("stderr", msg);
        } finally {
          run.finishedAt = new Date();
          await run.save();
          logger.info({ runId: run._id }, "📡 [SAM-AUDIT] [WORKER] Job execution completed. Publishing 'end' log to Redis");
          publishLog("end", { status: run.status, metrics: run.metrics });
          logger.info({ runId: run._id, status: run.status }, "Job finished");
        }
      } catch (err) {
         logger.error({ err, jobId: job.id }, "Fatal job processing error");
      } finally {
        activeJobs = Math.max(0, activeJobs - 1);
      }
    },
    { connection: redisConnectionFromUrl(env.REDIS_URL), concurrency: parseInt(process.env.WORKER_CONCURRENCY || "3") }
  );
  await startHeartbeat(redisClient, () => ({ activeJobs }));

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
      logger.info("📡 [SAM-AUDIT] [WORKER] Warmup pulse successful (Instance active)");
    } catch (err) {
      logger.warn({ err: err.message }, "Worker warmup pulse failed");
    }
  }, 5 * 60 * 1000); // 5 minutes

  worker.on("failed", (job, err) => {
    logger.error({ job: job?.id, err }, "Job failed permanently");
  });
}

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
