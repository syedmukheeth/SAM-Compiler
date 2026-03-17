const { Queue } = require("bullmq");
const { env } = require("../../config/env");

const RUNS_QUEUE_NAME = "liquidide-runs";

const runsQueue = new Queue(RUNS_QUEUE_NAME, {
  connection: redisConnectionFromUrl(env.REDIS_URL)
});

function redisConnectionFromUrl(redisUrl) {
  const u = new URL(redisUrl);
  const port = u.port ? Number(u.port) : 6379;
  const password = u.password ? decodeURIComponent(u.password) : undefined;
  return { host: u.hostname, port, password };
}

module.exports = { RUNS_QUEUE_NAME, runsQueue };

