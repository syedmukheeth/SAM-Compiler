const { env } = require("../../config/env");
const { logger } = require("../../config/logger");

const RUNS_QUEUE_NAME = "sam-runs";
const WORKER_HEARTBEAT_KEY = "sam:worker:heartbeat";

let _runsQueue = null;
let _redisClient = null;

/**
 * Retention and retry policy. Previously `queue.add("execute", { runId })` was
 * called with no options and the Queue declared no defaults, so completed and
 * failed jobs accumulated in Redis forever (a slow-motion outage on a small
 * Upstash plan) and a transient worker failure was never retried.
 */
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 24 * 3600, count: 1000 }
};

function getRunsQueue() {
  if (!_runsQueue) {
    try {
      const { Queue } = require("bullmq");
      _runsQueue = new Queue(RUNS_QUEUE_NAME, {
        connection: redisConnectionFromUrl(env.REDIS_URL),
        defaultJobOptions: DEFAULT_JOB_OPTIONS
      });
      _runsQueue.on("error", (err) => {
        // Do NOT null the singleton here. Doing so orphaned the old Queue (and
        // its ioredis sockets) on every Redis blip, leaking a connection each
        // time. ioredis reconnects on its own.
        logger.error({ err }, "Redis connection error in runsQueue");
      });
    } catch (err) {
      logger.error({ err }, "Failed to initialize runsQueue");
      return null;
    }
  }
  return _runsQueue;
}

/** Used by the graceful-shutdown path in server.js. */
async function closeQueue() {
  const tasks = [];
  if (_runsQueue) {
    tasks.push(_runsQueue.close().catch((err) => logger.error({ err }, "Queue close failed")));
    _runsQueue = null;
  }
  if (_redisClient) {
    tasks.push(_redisClient.quit().catch((err) => logger.error({ err }, "Redis quit failed")));
    _redisClient = null;
  }
  await Promise.all(tasks);
}

function getRedisClient() {
  if (!_redisClient) {
    try {
      const Redis = require("ioredis");
      _redisClient = new Redis(redisConnectionFromUrl(env.REDIS_URL));
      _redisClient.on("error", (err) => {
        logger.error({ err }, "Redis Client Error");
      });
    } catch (err) {
      logger.error({ err }, "Failed to initialize Redis Client");
      return null;
    }
  }
  return _redisClient;
}

function redisConnectionFromUrl(redisUrl) {
  try {
    const u = new URL(redisUrl);
    const port = u.port ? Number(u.port) : 6379;
    const password = u.password ? decodeURIComponent(u.password) : undefined;
    return { 
      host: u.hostname, 
      port, 
      password, 
      tls: (u.protocol === "rediss:" || u.hostname.includes("upstash.io")) ? { rejectUnauthorized: false } : undefined,
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
      family: 0, // Auto IPv4/IPv6 resolution (Recommended for Upstash)
      reconnectOnError: (err) => {
        const targetError = "READONLY";
        if (err.message.includes(targetError) || err.message.includes("ECONNRESET")) {
          return true; // Reconnect
        }
        return false;
      }
    };




  } catch (err) {
    logger.error({ err, redisUrl }, "Invalid Redis URL");
    return { 
      host: "localhost", 
      port: 6379, 
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
      connectTimeout: 10000
    };
  }
}

module.exports = {
  RUNS_QUEUE_NAME,
  WORKER_HEARTBEAT_KEY,
  DEFAULT_JOB_OPTIONS,
  getRunsQueue,
  getRedisClient,
  closeQueue
};

