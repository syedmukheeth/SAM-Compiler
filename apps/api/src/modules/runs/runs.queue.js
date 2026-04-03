const { env } = require("../../config/env");
const { logger } = require("../../config/logger");

const RUNS_QUEUE_NAME = "sam-runs";
const WORKER_HEARTBEAT_KEY = "sam:worker:heartbeat";

let _runsQueue = null;
let _redisClient = null;

function getRunsQueue() {
  if (!_runsQueue) {
    try {
      const { Queue } = require("bullmq");
      _runsQueue = new Queue(RUNS_QUEUE_NAME, {
        connection: redisConnectionFromUrl(env.REDIS_URL)
      });
      _runsQueue.on("error", (err) => {
        logger.error({ err }, "Redis connection error in runsQueue");
        _runsQueue = null; // Reset so it can be retried
      });
    } catch (err) {
      logger.error({ err }, "Failed to initialize runsQueue");
      return null;
    }
  }
  return _runsQueue;
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
      tls: u.protocol === "rediss:" ? {} : undefined,
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
      connectTimeout: 10000 
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

module.exports = { RUNS_QUEUE_NAME, WORKER_HEARTBEAT_KEY, getRunsQueue, getRedisClient };

