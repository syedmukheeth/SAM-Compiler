const http = require("http");
const { logger } = require("./config/logger");
const { env } = require("./config/env");
const { connectMongo } = require("./config/mongo");
const { createApp } = require("./app");
const { initSocket } = require("./modules/runs/socketHandler");

async function main() {
  // Fire and forget connection to MongoDB - Mongoose handles the queue/retry
  connectMongo().catch(err => {
    logger.error({ err }, "Initial background connect fail (Retrying...)");
  });

  const app = createApp();
  const server = http.createServer(app);
  
  initSocket(server);



  // 💓 HEARTBEAT: Prevent Render/Railway from sleeping (Self-Warming)
  const publicBaseUrl = env.CALLBACK_URL_BASE ? env.CALLBACK_URL_BASE.split('/api/auth')[0] : null;

  setInterval(() => {
    // 1. Internal Ping (Localhost)
    const localUrl = `http://localhost:${env.PORT}/api/health`; 
    http.get(localUrl, (res) => {
      // Activity to keep the local process busy
    }).on("error", () => {});

    // 2. External Ping (Public URL) - CRITICAL for Render/Railway load balancer activity
    if (publicBaseUrl && publicBaseUrl.startsWith('http')) {
      const publicUrl = `${publicBaseUrl}/api/health`;
      const client = publicUrl.startsWith('https') ? require('https') : http;
      
      client.get(publicUrl, (res) => {
        logger.info({ status: res.statusCode, url: publicUrl }, "External heartbeat pulse successful");
      }).on("error", (err) => {
        logger.warn({ err: err.message, url: publicUrl }, "External heartbeat pulse failed (Expected if engine is cold)");
      });
    }
  }, 5 * 60 * 1000); // Pulse every 5 minutes for aggressive warming

  server.listen(env.PORT, () => {
    logger.info(`SAM Compiler API listening on port ${env.PORT}`);
    console.log(`🚀 API Server ready on http://localhost:${env.PORT}`);
    console.log(`📡 Environment: ${process.env.NODE_ENV || "development"}`);
  });

  // GRACEFUL SHUTDOWN: Ensure we don't drop active runs or Yjs updates on redeploy
  const shutdown = async (signal) => {
    logger.info(`${signal} received. Shutting down gracefully...`);
    server.close(() => {
      logger.info("HTTP server closed.");
      const mongoose = require("mongoose");
      mongoose.connection.close(false, () => {
        logger.info("MongoDB connection closed.");
        process.exit(0);
      });
    });

    // Force exit after 10s
    setTimeout(() => {
      logger.error("Could not close connections in time, forceful shutdown");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.fatal({ err }, "API server crashed");
  process.exit(1);
});

