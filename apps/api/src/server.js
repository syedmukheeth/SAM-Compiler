const { logger } = require("./config/logger");
const { env } = require("./config/env");
const { connectMongo } = require("./config/mongo");
const { createApp } = require("./app");

async function main() {
  await connectMongo();
  const app = createApp();

  app.listen(env.PORT, () => {
    logger.info(`LiquidIDE API listening on :${env.PORT}`);
  });
}

main().catch((err) => {
  logger.fatal({ err }, "API server crashed");
  process.exit(1);
});

