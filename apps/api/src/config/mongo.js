const mongoose = require("mongoose");
const { env } = require("./env");
const { logger } = require("./logger");

let cachedConn = null;

async function connectMongo() {
  if (cachedConn) {
    if (mongoose.connection.readyState >= 1) return cachedConn;
    cachedConn = null; // Reset if broken
  }

  try {
    mongoose.set("strictQuery", true);
    console.log("DEBUG: Connecting to MongoDB...");
    
    cachedConn = mongoose.connect(env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    await cachedConn;
    logger.info("Connected to MongoDB");
    console.log("🟢 [DB] Connected to MongoDB");
    return cachedConn;
  } catch (err) {
    cachedConn = null;
    console.error("🔴 [DB] Failed to connect to MongoDB:", err.message);
    logger.error({ err }, "Failed to connect to MongoDB");
    throw err;
  }
}

module.exports = { connectMongo };

