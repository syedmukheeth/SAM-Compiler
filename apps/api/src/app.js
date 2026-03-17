const pino = require("pino-http");
const { logger } = require("./config/logger");

function createApp() {
  const app = express();

  app.use(pino({ logger }));
  app.use(helmet());
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true
    })
  );
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));
  app.use("/runs", runsRouter);

  // Global Error Handler
  app.use((err, req, res, next) => {
    void next;
    req.log.error({ err }, "Unhandled application error");
    res.status(err.status || 500).json({
      message: err.message || "Internal Server Error",
      error: process.env.NODE_ENV === "production" ? {} : err
    });
  });

  return app;
}

module.exports = { createApp };

