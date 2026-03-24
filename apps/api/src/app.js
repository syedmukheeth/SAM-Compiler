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

function createApp() {
  const app = express();

  // Rate Limiting - Global & Run Specific
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests from this IP, please try again later." }
  });

  const runLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // Limit each IP to 10 runs per minute
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

  app.get("/", (_req, res) => res.json({ 
    message: "LiquidIDE API - Professional Multi-Language Execution Engine",
    version: "1.0.0",
    status: "ready",
    endpoints: ["/runs", "/auth", "/github", "/health"]
  }));

  // Prevent favicon 404 noise in logs
  app.get(["/favicon.ico", "/favicon.png"], (req, res) => res.status(204).end());

  app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));
  
  // Standard routes handled at root (prefix stripping done in entry point)
  const routes = express.Router();
  routes.use("/runs", runLimiter, runsRouter);
  routes.use("/github", githubRouter);
  routes.use("/auth", authRouter);
  routes.get("/health", (_req, res) => res.json({ status: "ok", origin: "api-router" }));

  app.use("/", routes);

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

