const mongoose = require("mongoose");
const { env } = require("./env");

async function connectMongo() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.MONGO_URI);
}

module.exports = { connectMongo };

