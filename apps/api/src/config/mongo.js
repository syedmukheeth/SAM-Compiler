const { logger } = require("./logger");

async function connectMongo() {
  try {
    mongoose.set("strictQuery", true);
    await mongoose.connect(env.MONGO_URI);
    logger.info("Connected to MongoDB");
  } catch (err) {
    logger.error({ err }, "Failed to connect to MongoDB");
    throw err;
  }
}

module.exports = { connectMongo };

