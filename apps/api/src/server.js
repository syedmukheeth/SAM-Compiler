const { logger } = require("./config/logger");
const { env } = require("./config/env");
const { connectMongo } = require("./config/mongo");
const { createApp } = require("./app");

async function main() {
  await connectMongo();
  const app = createApp();

  app.listen(env.PORT, () => {
    logger.info(`LiquidIDE API listening on port ${env.PORT}`);
    console.log(`🚀 API Server ready on http://localhost:${env.PORT}`);
    console.log(`📡 Environment: ${process.env.NODE_ENV || "development"}`);
  });
}

main().catch((err) => {
  logger.fatal({ err }, "API server crashed");
  process.exit(1);
});

