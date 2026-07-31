const pino = require("pino");

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  // Without redaction, pino-http serialises full request headers, so bearer
  // tokens and OAuth `code` query params end up in the log stream.
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "req.query.token",
      "req.query.code",
      "*.password",
      "*.token",
      "*.accessToken",
      "*.githubToken",
      "*.resetPasswordToken",
      "*.JWT_SECRET",
      "*.GEMINI_API_KEY",
      "*.OPENAI_API_KEYS"
    ],
    censor: "[redacted]"
  }
});

module.exports = { logger };
