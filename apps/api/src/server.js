const http = require("http");
const { logger } = require("./config/logger");
const { env, publicBaseUrl, callbackUrlBase, callbackOrigin } = require("./config/env");
const { overrideCallbackBase } = require("./config/oauthCallback");
const { connectMongo } = require("./config/mongo");
const { createApp, INSTANCE_ID } = require("./app");
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

/**
 * Confirms the host OAuth providers will redirect users back to is this
 * service, and says exactly what to change when it is not.
 *
 * Production ran for months with CALLBACK_URL_BASE pointing at
 * `sam-compiler-api.onrender.com`, which is not a deployed service: users who
 * signed in with GitHub authorised successfully and were then handed to a 404.
 * Nothing in the logs said so, because nothing ever checked. A custom domain in
 * front of the service is legitimate, so this probes rather than assumes - a
 * working custom domain answers with this instance's id and stays quiet.
 *
 * Never blocks startup: it runs after listen and only ever logs.
 */
function verifyOAuthCallbackHost() {
  if (!callbackOrigin) {
    logger.error({ callbackUrlBase }, "OAuth callback base is not a valid URL; sign-in will fail");
    return;
  }
  // Local development has no public host to check against.
  if (callbackOrigin.startsWith("http://localhost")) return;

  const client = callbackOrigin.startsWith("https") ? require("https") : http;
  const req = client.get(`${callbackOrigin}/api/health`, (res) => {
    let body = "";
    res.setEncoding("utf8");
    res.on("data", (chunk) => { if (body.length < 2048) body += chunk; });
    res.on("end", () => {
      let payload = null;
      try { payload = JSON.parse(body); } catch { /* not our health payload */ }

      if (res.statusCode === 200 && payload?.instance === INSTANCE_ID) {
        logger.info({ callbackUrlBase }, "OAuth callback host verified");
        return;
      }

      // Behind a load balancer the probe can land on a sibling of this service:
      // a different instance id, but unmistakably the same application. That is
      // a correct configuration, so it must not be reported as a broken one.
      if (res.statusCode === 200 && payload?.status === "ok" && typeof payload.instance === "string") {
        logger.info(
          { callbackUrlBase },
          "OAuth callback host verified (answered by another instance of this service)"
        );
        return;
      }

      logger.error(
        { callbackUrlBase, status: res.statusCode, publicBaseUrl },
        "OAuth callback host is NOT this instance - sign-in would drop users on the wrong host. " +
        `Set CALLBACK_URL_BASE to ${publicBaseUrl || "this service's origin"}/api/auth (or unset it to derive it ` +
        "automatically) and register the matching /api/auth/<provider>/callback URLs in the GitHub and Google dashboards."
      );

      // A definite answer from something that is not this application: the
      // configured host is disproven, so stop handing it to providers.
      if (publicBaseUrl) overrideCallbackBase(`${publicBaseUrl}/api/auth`);
    });
  });
  req.setTimeout(10000, () => req.destroy());
  req.on("error", (err) => {
    // Deliberately no override here: an unreachable host is usually a blip, and
    // silently switching the callback on a transient failure would break a
    // correctly configured custom domain.
    logger.error(
      { err: err.message, callbackUrlBase },
      "OAuth callback host is unreachable - sign-in may fail. Check CALLBACK_URL_BASE."
    );
  });
}

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
    verifyOAuthCallbackHost();
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
