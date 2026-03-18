const { connectMongo } = require("./src/config/mongo");
const { createApp } = require("./src/app");
require("dotenv").config();

let app;

module.exports = async (req, res) => {
  if (!app) {
    try {
      await connectMongo();
      app = createApp();
    } catch (err) {
      console.error("Failed to initialize app:", err);
      res.status(500).json({ error: "Failed to initialize application" });
      return;
    }
  }
  return app(req, res);
};
