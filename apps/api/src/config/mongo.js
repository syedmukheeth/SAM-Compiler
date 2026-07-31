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

    cachedConn = mongoose.connect(env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 50, // Reduced from 100 to support safe horizontal scale (e.g. 10 pods * 50 = 500 conns)
      minPoolSize: 5,  // Maintain a baseline of 5 connections to avoid cold-start stalls
      autoIndex: false // Indexes are built explicitly below, not on every model touch
    });

    await cachedConn;
    logger.info("Connected to MongoDB");

    // There were no connection lifecycle listeners at all, so a mid-life
    // disconnect was completely invisible in the logs.
    mongoose.connection.on("error", (err) => logger.error({ err }, "MongoDB connection error"));
    mongoose.connection.on("disconnected", () => logger.warn("MongoDB disconnected"));
    mongoose.connection.on("reconnected", () => logger.info("MongoDB reconnected"));

    // autoIndex is off and nothing ever called syncIndexes(), so every index
    // declared across the models was declaration-only — including the unique
    // index on User.email, whose absence allows duplicate accounts. Building
    // them in the background keeps startup non-blocking.
    syncIndexes().catch((err) => logger.error({ err }, "Index sync failed"));

    return cachedConn;
  } catch (err) {
    cachedConn = null;
    logger.warn({ err }, "Initial MongoDB connection failed. Retrying in background.");
    // Do NOT throw. Let the server start and Mongoose will retry.
    return null;
  }
}

async function syncIndexes() {
  if (process.env.SKIP_INDEX_SYNC === "true") return;
  const results = await Promise.allSettled(
    Object.values(mongoose.models).map((m) => m.syncIndexes())
  );
  results.forEach((r, i) => {
    const name = Object.keys(mongoose.models)[i];
    if (r.status === "rejected") logger.error({ err: r.reason, model: name }, "Index sync failed for model");
  });
  logger.info({ models: Object.keys(mongoose.models) }, "Index sync complete");
}

module.exports = { connectMongo, syncIndexes };

