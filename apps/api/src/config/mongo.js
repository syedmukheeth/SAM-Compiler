const mongoose = require("mongoose");
const { env } = require("./env");
const { logger } = require("./logger");

async function connectMongo() {
  try {
    mongoose.set("strictQuery", true);
    console.log("DEBUG: Connecting to MongoDB...");
    // Return the promise to allow awaiting in serverless environments
    return mongoose.connect(env.MONGO_URI).then(() => {
      logger.info("Connected to MongoDB");
      console.log("🟢 [DB] Connected to MongoDB");
    }).catch(err => {
      console.error("🔴 [DB] Failed to connect to MongoDB:", err.message);
      logger.error({ err }, "Failed to connect to MongoDB");
      throw err; // Rethrow to let the caller handle it
    });
  } catch (err) {
    console.error("❌ Failed to initiate MongoDB connection:", err.message);
    logger.error({ err }, "Failed to initiate MongoDB connection");
    throw err;
  }
}

module.exports = { connectMongo };

