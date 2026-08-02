const { env, isProduction } = require("../../config/env");
const { logger } = require("../../config/logger");

const RUNS_QUEUE_NAME = "sam-runs";
const WORKER_HEARTBEAT_KEY = "sam:worker:heartbeat";

let _runsQueue = null;
let _redisClient = null;
let _lastRedisError = null;
let _configError = null; // why REDIS_URL was rejected, if it was

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
    const connection = redisConnectionFromUrl(env.REDIS_URL);
    if (!connection) return null;
    try {
      const { Queue } = require("bullmq");
      _runsQueue = new Queue(RUNS_QUEUE_NAME, {
        connection,
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
    const connection = redisConnectionFromUrl(env.REDIS_URL);
    if (!connection) return null;
    try {
      const Redis = require("ioredis");
      // The standalone client only serves short reads (the worker heartbeat).
      // Unlike the BullMQ connection it must NOT buffer commands while the
      // socket is down - a buffered command never settles, which is what froze
      // every run when Redis was unreachable.
      _redisClient = new Redis({ ...connection, enableOfflineQueue: false });
      _redisClient.on("error", (err) => {
        _lastRedisError = err.message;
        logger.error({ err, host: connection.host, port: connection.port }, "Redis Client Error");
      });
      _redisClient.on("ready", () => {
        _lastRedisError = null;
        logger.info({ host: connection.host, port: connection.port }, "Redis connected");
      });
    } catch (err) {
      _lastRedisError = err.message;
      logger.error({ err }, "Failed to initialize Redis Client");
      return null;
    }
  }
  return _redisClient;
}

/** Surfaced on the health endpoint so a broken Redis says why, not just false. */
function getRedisDiagnostics() {
  return {
    configured: Boolean(env.REDIS_URL && env.REDIS_URL.trim()),
    // "rejected" means REDIS_URL was set but unusable, which is otherwise
    // indistinguishable from a client that simply has not been created yet.
    status: _redisClient ? _redisClient.status : (_configError ? "rejected" : "not-initialized"),
    configError: _configError,
    lastError: _lastRedisError
  };
}

/**
 * Returns null when Redis is not configured, rather than quietly pointing a
 * production process at localhost:6379. That fallback is why a missing
 * REDIS_URL on Render looked identical to a misconfigured one: the client sat
 * in an endless reconnect loop against a port nothing listens on, and the only
 * symptom anywhere was `redisConnected: false`.
 */
function redisConnectionFromUrl(redisUrl) {
  const reject = (message, details) => {
    _configError = message;
    logger.error(details || {}, message);
    return null;
  };

  const raw = (redisUrl || "").trim();
  if (!raw) {
    if (isProduction) {
      return reject("REDIS_URL is not set. Worker delegation and log streaming are disabled; runs use the cloud sandbox only.");
    }
    logger.warn("REDIS_URL is not set. Falling back to localhost for local development.");
    _configError = null;
    return { host: "127.0.0.1", port: 6379, ...COMMON_REDIS_OPTIONS };
  }

  let u;
  try {
    u = new URL(raw);
  } catch {
    // Never log or return the URL itself - it carries the password.
    return reject("REDIS_URL is not a valid URL. It must look like rediss://default:PASSWORD@host:6379");
  }

  if (u.protocol !== "redis:" && u.protocol !== "rediss:") {
    return reject(`REDIS_URL uses the "${u.protocol}" scheme; it must be redis:// or rediss://`);
  }

  if (!u.hostname) {
    return reject("REDIS_URL has no host");
  }

  _configError = null;

  // Managed providers terminate TLS and reject plaintext, so a `redis://` URL
  // copied from their dashboard would otherwise fail to connect.
  const managedTls = /\.(upstash\.io|redns\.redis-cloud\.com|redislabs\.com)$/i.test(u.hostname);
  const useTls = u.protocol === "rediss:" || managedTls;
  if (managedTls && u.protocol === "redis:") {
    logger.warn({ host: u.hostname }, "Managed Redis host detected; upgrading the connection to TLS. Prefer a rediss:// URL.");
  }

  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    tls: useTls ? { servername: u.hostname } : undefined,
    ...COMMON_REDIS_OPTIONS
  };
}

const COMMON_REDIS_OPTIONS = {
  maxRetriesPerRequest: null,
  enableOfflineQueue: true,
  connectTimeout: 10000,
  family: 0, // Auto IPv4/IPv6 resolution (recommended for Upstash)
  reconnectOnError: (err) =>
    err.message.includes("READONLY") || err.message.includes("ECONNRESET")
};

module.exports = {
  RUNS_QUEUE_NAME,
  WORKER_HEARTBEAT_KEY,
  DEFAULT_JOB_OPTIONS,
  getRunsQueue,
  getRedisClient,
  getRedisDiagnostics,
  redisConnectionFromUrl,
  closeQueue
};

