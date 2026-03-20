const { connectMongo } = require("../src/config/mongo");
const { createApp } = require("../src/app");

// Note: Vercel environment variables are automatically loaded by the platform
let app;

module.exports = async (req, res) => {
  // Simple health check first to avoid MongoDB latency
  if (req.url === "/health") {
    return res.status(200).json({ status: "ok", env: "vercel" });
  }

  if (!app) {
    try {
      console.log("☁️ Initializing LiquidIDE API on Vercel...");
      
      // Initialize MongoDB
      await connectMongo().catch(err => {
        console.warn("⚠️ MongoDB connection deferred or failed:", err.message);
      });

      // Create Express App
      app = createApp();
      
      console.log("✅ App initialized successfully");
    } catch (err) {
      console.error("❌ CRITICAL: Failed to initialize or handle request:", err);
      return res.status(500).json({ 
        error: "Initialization Failure", 
        message: err.message,
        stack: process.env.NODE_ENV === "production" ? undefined : err.stack
      });
    }
  }

  // Handle the request
  try {
    return app(req, res);
  } catch (err) {
    console.error("❌ Request Error:", err);
    return res.status(500).json({ error: "Request Execution Failure", message: err.message });
  }
};
