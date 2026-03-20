const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const pino = require("pino-http");
const passport = require("./config/passport");
const { logger } = require("./config/logger");
const { env } = require("./config/env");
const { runsRouter } = require("./modules/runs/runs.routes");
const { githubRouter } = require("./modules/github/github.routes");
const { authRouter } = require("./modules/auth/auth.routes");

function createApp() {
  const app = express();

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

  // Handle /api prefix transparency (Render/Vercel compatibility)
  app.use((req, _res, next) => {
    if (req.url.startsWith("/api/")) {
      req.url = req.url.replace(/^\/api/, "");
      if (req.url === "") req.url = "/";
    }
    next();
  });

  app.get("/", (_req, res) => res.json({ 
    message: "LiquidIDE API - Professional Multi-Language Execution Engine",
    version: "1.0.0",
    status: "ready",
    endpoints: ["/runs", "/auth", "/github", "/health"]
  }));

  app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));
  
  // Standard routes handled at root (prefix stripping done in entry point)
  const routes = express.Router();
  routes.use("/runs", runsRouter);
  routes.use("/github", githubRouter);
  routes.use("/auth", authRouter);
  routes.get("/health", (_req, res) => res.json({ status: "ok", origin: "api-router" }));

  app.use("/", routes);

  // Global Error Handler
  app.use((err, req, res, next) => {
    void next;
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

