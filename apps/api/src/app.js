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
const { originChecker } = require("./config/cors");
const path = require("path");


function createApp() {
  const app = express();

  // Enable trust proxy for correct IP detection behind Vercel/Render
  app.set("trust proxy", 1);

  // 🛡️ SECURITY: Exact-match CORS policy (see config/cors.js for rationale).
  app.use(cors({
    origin: originChecker,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  }));

  // Handle preflight requests across all routes
  // Express 5 / path-to-regexp v8: a bare "*" is no longer a valid pattern.
  app.options("/{*splat}", cors());

  app.use((req, res, next) => {
    res.setHeader("X-Sam-Api", "v3.0-stable");
    // Removed: an unconditional logger.info of every URL containing "/auth".
    // That included the OAuth callbacks, whose query string carries the
    // provider `code` — writing exchangeable credentials into the logs.
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


  // Health check - moved from root to avoid conflict with frontend.
  // No longer reports NODE_ENV: an unauthenticated endpoint should not disclose
  // deployment configuration.
  app.get("/api/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

  // Both prefixes are served so the endpoints survive proxy path rewriting.
  // These were previously registered twice each — once for /api only, then
  // again for both — leaving a dead duplicate handler per route.
  app.get(["/api/ping", "/ping"], (req, res) => res.json({ status: "alive" }));
  app.get(["/api/health-check", "/health-check"], (req, res) => res.json({
    status: "healthy",
    uptime: process.uptime()
  }));

  // Prevent favicon 404 noise in logs
  app.get(["/favicon.ico", "/favicon.png"], (req, res) => res.status(204).end());

  // Standard API routes
  const routes = express.Router();

  // Queue status. Note this router is mounted at both "/api" and "/", but the
  // "/api" copy is shadowed by app.use("/api/runs", ...) below and never runs;
  // the reachable path is /runs/health/queue plus runsRouter's own
  // /api/runs/health/queue.
  routes.get("/runs/health/queue", async (req, res, next) => {
    try {
      const { getQueueStatus } = require("./modules/runs/runs.service");
      const status = await getQueueStatus();
      res.json(status);
    } catch (err) {
      next(err);
    }
  });

  // Standardized API mounting for production-grade proxying.
  // NOTE: userRateLimiter is applied *inside* runsRouter, after the auth
  // middleware populates req.user. Mounting it here meant req.user was always
  // undefined, so the per-user limit silently bypassed for every request.
  app.use("/api/runs", runLimiter, runsRouter);
  app.use("/api/github", githubRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/ai", aiRouter);


  // Remaining generic routes
  app.use("/api", routes);
  app.use("/", routes);






  // Serve Static Frontend Assets (Monolith Mode)
  // __dirname is apps/api/src, so we need to go up 3 levels to reach apps/
  const distPath = path.resolve(__dirname, "../../..", "apps/web/dist");
  app.use(express.static(distPath, {
    etag: true,
    // `immutable` previously applied to the whole dist directory, including
    // index.html — so a stale SPA shell could be pinned in browser caches for
    // 7 days after a deploy. Only the content-hashed /assets/* files are
    // genuinely immutable.
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "no-cache");
      }
    }
  }));

  // Catch-all: Route anything else to index.html for React Router support (SPA)
  app.get("/{*splat}", (req, res) => {
    // Skip if it's an API request that 404'd
    if (req.url.startsWith("/api/")) return res.status(404).json({ message: "API endpoint not found" });
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(distPath, "index.html"));
  });


  // Global Error Handler
  app.use((err, _req, res, _next) => { // eslint-disable-line no-unused-vars
    const errorLogger = _req.log || logger;
    errorLogger.error({ err }, "Unhandled application error");
    const status = err.status || 500;
    // Never serialise the error object to the client. The previous version
    // returned the full `err` (including its stack) whenever NODE_ENV was not
    // exactly "production" — and docker-compose never set NODE_ENV at all.
    res.status(status).json({
      message: status < 500 && err.message ? err.message : "Internal Server Error"
    });
  });

  return app;
}

const app = createApp();

module.exports = app;
module.exports.createApp = createApp;