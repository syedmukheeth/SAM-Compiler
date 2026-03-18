const mongoose = require("mongoose");
const { env } = require("./env");
const { logger } = require("./logger");

async function connectMongo() {
  try {
    mongoose.set("strictQuery", true);
    // Non-blocking connection to allow worker to start
    mongoose.connect(env.MONGO_URI).then(() => {
      logger.info("Worker connected to MongoDB");
    }).catch(err => {
      logger.error({ err }, "Worker failed to connect to MongoDB (deferred)");
    });
  } catch (err) {
    logger.error({ err }, "Worker failed to initiate MongoDB connection");
  }
}

module.exports = { connectMongo };

