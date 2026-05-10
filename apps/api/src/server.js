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
  setInterval(() => {
    // Ping self to stay warm
    const selfUrl = `http://localhost:${env.PORT}/api/health`; 
    http.get(selfUrl, (res) => {
      logger.info({ status: res.statusCode }, "Heartbeat pulse sent to self to prevent cold start");
    }).on("error", (err) => {
      // Ignored - as long as it triggers some activity
    });
  }, 10 * 60 * 1000); // Pulse every 10 minutes

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

