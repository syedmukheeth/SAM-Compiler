const { connectMongo } = require("./src/config/mongo");
const { createApp } = require("./src/app");

async function debug() {
  try {
    console.log("Starting debug run...");
    await connectMongo();
    console.log("Mongo connected");
    createApp();
    console.log("App created");
  } catch (err) {
    console.error("FATAL ERROR CAUGHT:");
    console.error(err);
    process.exit(1);
  }
}

debug();
