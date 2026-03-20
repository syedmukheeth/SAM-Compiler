// LiquidIDE Vercel Entry Point
// Professional Serverless Stabilization

// Note: Heavy requires are moved INSIDE the handler to prevent cold-start crashes
// especially on the health-check path.

let app;
let initializationError = null;

module.exports = async (req, res) => {
  // Normalize URL by removing /api prefix if present (consistent with local dev)
  const originalUrl = req.url;
  req.url = req.url.replace(/^\/api/, "");
  if (req.url === "") req.url = "/";

  // 🚀 FAST HEALTH CHECK (Zero dependencies)
  if (req.url === "/health" || req.url === "/api/health") {
    return res.status(200).json({ 
      status: "ok", 
      env: "vercel",
      initStatus: app ? "ready" : initializationError ? "failed" : "pending"
    });
  }

  // 🛡️ INITIALIZATION
  if (!app && !initializationError) {
    try {
      console.log("☁️ Initializing LiquidIDE API on Vercel...");
      
      // Lazy load core modules
      const { connectMongo } = require("../src/config/mongo");
      const { createApp } = require("../src/app");
      
      // Deferred MongoDB connection
      await connectMongo().catch(err => {
        console.warn("⚠️ MongoDB connection failure (will retry on next request):", err.message);
      });

      // Initialize App
      app = createApp();
      console.log("✅ App initialized successfully");
    } catch (err) {
      initializationError = err;
      console.error("❌ CRITICAL: Initialization Failure:", err);
    }
  }

  // 🚨 ERROR HANDLING
  if (initializationError) {
    return res.status(500).json({ 
      error: "Initialization Failure", 
      message: initializationError.message,
      stack: process.env.NODE_ENV === "production" ? undefined : initializationError.stack
    });
  }

  // ⚡ HANDLE REQUEST
  try {
    return app(req, res);
  } catch (err) {
    console.error("❌ Request Error:", err);
    return res.status(500).json({ 
      error: "Request Execution Failure", 
      message: err.message,
      stack: process.env.NODE_ENV === "production" ? undefined : err.stack
    });
  }
};
