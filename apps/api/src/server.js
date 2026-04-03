const http = require("http");
const { logger } = require("./config/logger");
const { env } = require("./config/env");
const { connectMongo } = require("./config/mongo");
const { createApp } = require("./app");
const { initSocket } = require("./modules/runs/socketHandler");

async function main() {
  await connectMongo();
  const app = createApp();
  const server = http.createServer(app);
  
  initSocket(server);

  server.listen(env.PORT, () => {
    logger.info(`SAM Compiler API listening on port ${env.PORT}`);
    console.log(`🚀 API Server ready on http://localhost:${env.PORT}`);
    console.log(`📡 Environment: ${process.env.NODE_ENV || "development"}`);
  });
}

main().catch((err) => {
  logger.fatal({ err }, "API server crashed");
  process.exit(1);
});

