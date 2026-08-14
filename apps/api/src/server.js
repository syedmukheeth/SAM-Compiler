const http = require("http");
const { logger } = require("./config/logger");
const { env, publicBaseUrl } = require("./config/env");
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

  // HEARTBEAT: keep Render/Railway from idling this instance out.
  //
  // The target now comes from config/env (RENDER_EXTERNAL_URL first), not from
  // CALLBACK_URL_BASE. Production had CALLBACK_URL_BASE pointing at
  // `sam-compiler-api.onrender.com` - a hostname that resolves to Render's 404
  // page - so every pulse "succeeded" against a service that was not this one
  // and the instance still went to sleep after 15 idle minutes.
  //
  // A self-ping can only keep a *running* instance awake; nothing inside the
  // process can wake it once the platform has stopped it. The scheduled
  // keep-alive workflow in .github/workflows is what covers that case.
  if (!publicBaseUrl) {
    logger.warn("No public base URL (RENDER_EXTERNAL_URL / PUBLIC_BASE_URL). External heartbeat disabled; the instance will idle out.");
  } else {
    const callbackOrigin = (env.CALLBACK_URL_BASE || "").split("/api/auth")[0];
    if (callbackOrigin && callbackOrigin !== publicBaseUrl) {
      // Same mismatch breaks OAuth: providers redirect back to whatever
      // CALLBACK_URL_BASE says, and that host has to be this service.
      logger.warn(
        { publicBaseUrl, callbackOrigin },
        "CALLBACK_URL_BASE does not point at this instance. OAuth callbacks will land on the wrong host - set it to " +
        `${publicBaseUrl}/api/auth and update the GitHub/Google dashboards to match.`
      );
    }
  }

  // Timeouts added: these were previously unbounded, so a hung heartbeat
  // request leaked a socket every 5 minutes for the life of the process.
  const HEARTBEAT_TIMEOUT_MS = 10000;

  const heartbeat = setInterval(() => {
    // 1. Internal Ping (Localhost)
    const localUrl = `http://localhost:${env.PORT}/api/health`;
    const localReq = http.get(localUrl, (res) => res.resume());
    localReq.setTimeout(HEARTBEAT_TIMEOUT_MS, () => localReq.destroy());
    localReq.on("error", () => {});

    // 2. External Ping (Public URL) - this is the one the platform counts as
    // inbound traffic, which is what resets the idle timer.
    if (publicBaseUrl) {
      const publicUrl = `${publicBaseUrl}/api/health`;
      const client = publicUrl.startsWith('https') ? require('https') : http;

      const req = client.get(publicUrl, (res) => {
        res.resume();
        // A 404 here means the URL is not this service - worth saying out loud
        // rather than logging it as a healthy pulse, which is how the broken
        // hostname went unnoticed.
        if (res.statusCode >= 400) {
          logger.warn({ status: res.statusCode, publicUrl }, "Heartbeat reached a non-OK endpoint; check the public URL");
        } else {
          logger.debug({ status: res.statusCode }, "External heartbeat pulse successful");
        }
      });
      req.setTimeout(HEARTBEAT_TIMEOUT_MS, () => req.destroy());
      req.on("error", (err) => {
        logger.warn({ err: err.message }, "External heartbeat pulse failed (Expected if engine is cold)");
      });
    }
  }, 5 * 60 * 1000); // Pulse every 5 minutes; platforms idle out at 15.

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
