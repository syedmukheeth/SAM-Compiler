const http = require("node:http");
const { Worker } = require("bullmq");
const { logger } = require("./config/logger");
const { env } = require("./config/env");
const { connectMongo } = require("./config/mongo");
const { RunModel } = require("./db/run.model");
const { RUNS_QUEUE_NAME } = require("./queue/constants");
const { executeRun } = require("./sandbox/multiSandbox");

async function startHeartbeat(redisClient) {
  const HEARTBEAT_KEY = "liquidide:worker:heartbeat";
  const interval = 10000; // 10 seconds

  const update = async () => {
    try {
      await redisClient.setex(HEARTBEAT_KEY, 30, Date.now());
      logger.debug("Worker heartbeat sent");
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
  await startHeartbeat(redisClient);
  await connectMongo();

  logger.info("LiquidIDE worker connected. Waiting for jobs...");

  const worker = new Worker(
    RUNS_QUEUE_NAME,
    async (job) => {
      const run = await RunModel.findById(job.data.runId);
      if (!run) {
        logger.warn({ runId: job.data.runId }, "Run not found");
        return;
      }

      logger.info({ runId: run._id, runtime: run.runtime }, "Starting job");
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
        const { stdout, stderr, exitCode } = await executeRun({
          language: run.runtime,
          files: run.files,
          entrypoint: run.entrypoint
        }, publishLog);

        run.stdout = stdout;
        run.stderr = stderr;
        run.exitCode = exitCode;
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
        publishLog("end", { status: run.status });
        logger.info({ runId: run._id, status: run.status }, "Job finished");
      }
    },
    { connection: redisConnectionFromUrl(env.REDIS_URL), concurrency: 10 }
  );

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
