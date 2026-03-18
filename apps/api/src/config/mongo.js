const mongoose = require("mongoose");
const { env } = require("./env");
const { logger } = require("./logger");

async function connectMongo() {
  try {
    mongoose.set("strictQuery", true);
    console.log("DEBUG: Connecting to MongoDB...");
    // We don't await here or we catch and don't rethrow to allow server startup
    mongoose.connect(env.MONGO_URI).then(() => {
      logger.info("Connected to MongoDB");
      console.log("🟢 [DB] Connected to MongoDB");
    }).catch(err => {
      console.error("🔴 [DB] Failed to connect to MongoDB:", err.message);
      logger.error({ err }, "Failed to connect to MongoDB");
    });
  } catch (err) {
    console.error("❌ Failed to initiate MongoDB connection:", err.message);
    logger.error({ err }, "Failed to initiate MongoDB connection");
  }
}

module.exports = { connectMongo };

