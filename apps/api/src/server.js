const http = require("http");
const { logger } = require("./config/logger");
const { env } = require("./config/env");
const { connectMongo } = require("./config/mongo");
const { createApp } = require("./app");
const { initSocket } = require("./modules/runs/socketHandler");

// Neither app had these. On Node >= 15 an unhandled rejection terminates the
// process with no context at all, and several async socket handlers can reject.
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception - exiting");
  process.exit(1);
});

async function main() {
  // Fire and forget connection to MongoDB - Mongoose handles the queue/retry
  connectMongo().catch(err => {
    logger.error({ err }, "Initial background connect fail (Retrying...)");
  });

  const app = createApp();
  const server = http.createServer(app);

  const io = initSocket(server);

  // 💓 HEARTBEAT: Prevent Render/Railway from sleeping (Self-Warming)
  const publicBaseUrl = env.CALLBACK_URL_BASE ? env.CALLBACK_URL_BASE.split('/api/auth')[0] : null;

  // Timeouts added: these were previously unbounded, so a hung heartbeat
  // request leaked a socket every 5 minutes for the life of the process.
  const HEARTBEAT_TIMEOUT_MS = 10000;

  const heartbeat = setInterval(() => {
    // 1. Internal Ping (Localhost)
    const localUrl = `http://localhost:${env.PORT}/api/health`;
    const localReq = http.get(localUrl, (res) => res.resume());
    localReq.setTimeout(HEARTBEAT_TIMEOUT_MS, () => localReq.destroy());
    localReq.on("error", () => {});

    // 2. External Ping (Public URL) - CRITICAL for Render/Railway load balancer activity
    if (publicBaseUrl && publicBaseUrl.startsWith('http')) {
      const publicUrl = `${publicBaseUrl}/api/health`;
      const client = publicUrl.startsWith('https') ? require('https') : http;

      const req = client.get(publicUrl, (res) => {
        res.resume();
        logger.info({ status: res.statusCode }, "External heartbeat pulse successful");
      });
      req.setTimeout(HEARTBEAT_TIMEOUT_MS, () => req.destroy());
      req.on("error", (err) => {
        logger.warn({ err: err.message }, "External heartbeat pulse failed (Expected if engine is cold)");
      });
    }
  }, 5 * 60 * 1000); // Pulse every 5 minutes for aggressive warming

  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: process.env.NODE_ENV || "development" }, "SAM Compiler API listening");
  });

  // GRACEFUL SHUTDOWN: Ensure we don't drop active runs or Yjs updates on redeploy.
  //
  // The previous version closed only the HTTP server and Mongo. Open websockets
  // keep server.close() from ever completing, so the 10s force-exit was the
  // normal path and "graceful" shutdown always exited non-zero. Socket.io,
  // Redis, the BullMQ queue and the heartbeat interval are all closed here.
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down gracefully");

    const forceExit = setTimeout(() => {
      logger.error("Could not close connections in time, forceful shutdown");
      process.exit(1);
    }, 15000);
    forceExit.unref();

    try {
      clearInterval(heartbeat);

      // Disconnect websocket clients first so server.close() can settle.
      if (io) {
        await new Promise((resolve) => io.close(resolve));
        logger.info("Socket.io closed.");
      }

      await new Promise((resolve) => server.close(resolve));
      logger.info("HTTP server closed.");

      const { closeQueue } = require("./modules/runs/runs.queue");
      if (typeof closeQueue === "function") {
        await closeQueue();
        logger.info("Queue and Redis connections closed.");
      }

      const mongoose = require("mongoose");
      await mongoose.connection.close(false);
      logger.info("MongoDB connection closed.");

      clearTimeout(forceExit);
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "Error during graceful shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.fatal({ err }, "API server crashed");
  process.exit(1);
});
