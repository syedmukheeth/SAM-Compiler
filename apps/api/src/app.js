const compression = require("compression");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const pino = require("pino-http");
const passport = require("./config/passport");
const { logger } = require("./config/logger");
const { runsRouter } = require("./modules/runs/runs.routes");
const { githubRouter } = require("./modules/github/github.routes");
const { authRouter } = require("./modules/auth/auth.routes");
const { aiRouter } = require("./modules/ai/ai.routes");
const { userRateLimiter } = require("./middleware/rateLimiter.middleware");
const path = require("path");


function createApp() {
  const app = express();

  // Enable trust proxy for correct IP detection behind Vercel/Render
  app.set("trust proxy", 1);

  // 🛡️ ABSOLUTE PRIORITY: Manual CORS Middleware (Bypass middleware ordering issues)
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = ["https://sam-compiler-web.vercel.app", "http://localhost:5173", "http://localhost:3000"];
    
    if (allowedOrigins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Sam-Api");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("X-Sam-Api", "v3.0-stable");

    // Immediately respond to preflight
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }
    next();
  });



  // Rate Limiting - Global & Run Specific
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Limit each IP to 500 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests from this IP, please try again later." }
  });

  const runLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // Increased limit to 100 runs per minute as requested
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many code executions. Please wait a minute." }
  });

  // Rate Limiting - Global & Run Specific

  app.use(compression()); // Compress all responses
  app.use(globalLimiter);

  app.use(pino({ logger }));
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false
  }));

  app.use(express.json({ limit: "2mb" }));
  app.use(passport.initialize());


  // Health check - moved from root to avoid conflict with frontend
  app.get("/api/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString(), env: process.env.NODE_ENV }));

  
  app.get("/api/ping", (req, res) => res.json({ status: "alive" }));
  app.get("/api/health-check", (req, res) => res.json({ 
    status: "healthy", 
    uptime: process.uptime()
  }));


  // Prevent favicon 404 noise in logs
  app.get(["/favicon.ico", "/favicon.png"], (req, res) => res.status(204).end());

  
  // Standard API routes
  const routes = express.Router();
  
  // Match health/queue path specifically
  routes.get("/runs/health/queue", async (req, res, next) => {
    try {
      const { getQueueStatus } = require("./modules/runs/runs.service");
      const status = await getQueueStatus();
      res.json(status);
    } catch (err) {
      next(err);
    }
  });
  
  // Direct Mounting Fix: Absolute paths catch redirects regardless of proxy interference
  app.get(["/api/ping", "/ping"], (req, res) => res.json({ status: "alive" }));
  app.get(["/api/health-check", "/health-check"], (req, res) => res.json({ 
    status: "healthy", 
    uptime: process.uptime()
  }));

  // Standardized API mounting for production-grade proxying
  app.use("/api/runs", userRateLimiter, runLimiter, runsRouter);
  app.use("/api/github", githubRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/ai", aiRouter);


  // Remaining generic routes
  app.use("/api", routes);
  app.use("/", routes);






  // Serve Static Frontend Assets (Monolith Mode)
  // __dirname is apps/api/src, so we need to go up 3 levels to reach apps/
  const distPath = path.resolve(__dirname, "../../..", "apps/web/dist");
  app.use(express.static(distPath));

  // Catch-all: Route anything else to index.html for React Router support (SPA)
  app.get("*", (req, res) => {
    // Skip if it's an API request that 404'd
    if (req.url.startsWith("/api/")) return res.status(404).json({ message: "API endpoint not found" });
    const indexPath = path.join(distPath, "index.html");
    res.sendFile(indexPath);
  });


  // Global Error Handler
  app.use((err, _req, res, _next) => { // eslint-disable-line no-unused-vars
    const errorLogger = _req.log || logger;
    errorLogger.error({ err }, "Unhandled application error");
    res.status(err.status || 500).json({
      message: err.message || "Internal Server Error",
      error: process.env.NODE_ENV === "production" ? {} : err
    });
  });

  return app;
}

const app = createApp();

module.exports = app;
module.exports.createApp = createApp;