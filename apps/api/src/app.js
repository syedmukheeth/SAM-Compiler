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
const path = require("path");

function createApp() {
  const app = express();

  // Enable trust proxy for correct IP detection behind Vercel/Render
  app.set("trust proxy", 1);

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

  app.use(compression()); // Compress all responses
  app.use(globalLimiter);

  // Handle /api prefix transparency - MUST BE FIRST (after middleware)
  app.use((req, _res, next) => {
    const oldPath = req.url;
    if (req.url.startsWith("/api/")) {
      req.url = req.url.replace(/^\/api/, "");
      if (req.url === "") req.url = "/";
      logger.debug({ oldPath, newPath: req.url }, "Stripped /api prefix for compatibility");
    }
    next();
  });

  app.use(pino({ logger }));
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false
  }));
  app.use(
    cors({
      origin: true, // Reflect origin for reliability on Vercel
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(passport.initialize());

  // Serve Static Frontend Assets (Monolith Mode)
  const distPath = path.join(__dirname, "../../../web/dist");
  app.use(express.static(distPath));
  
  // Health check - moved from root to avoid conflict with frontend
  app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));
  
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
  
  // Rate-limited execution routes
  routes.use("/runs", runLimiter, runsRouter);
  routes.use("/github", githubRouter);
  routes.use("/auth", authRouter);
  routes.use("/ai", aiRouter);

  app.use("/", routes);

  // Catch-all: Route anything else to index.html for React Router support (SPA)
  app.get("*", (req, res) => {
    // Skip if it's an API request that 404'd
    if (req.url.startsWith("/api/")) return res.status(404).json({ message: "API endpoint not found" });
    res.sendFile(path.join(distPath, "index.html"));
  });

  // Global Error Handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const errorLogger = req.log || logger;
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