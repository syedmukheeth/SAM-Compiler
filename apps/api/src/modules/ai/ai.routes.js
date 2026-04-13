const { Router } = require("express");
const { generateRefactor, streamChat } = require("./ai.service");
const { logger } = require("../../config/logger");

const aiRouter = Router();

/**
 * Handle AI Refactoring requests.
 */
aiRouter.post("/refactor", async (req, res, next) => {
  try {
    const { code, language, metrics, query } = req.body;
    const refactor = await generateRefactor({ code, language, metrics, query });
    res.json({ refactor });
  } catch (err) {
    logger.error({ err }, "Refactor route failed");
    next(err);
  }
});

/**
 * Handle AI Chat with SSE streaming.
 */
aiRouter.post("/chat", async (req, res) => {
  const { code, language, messages } = req.body;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    await streamChat({ code, language, messages }, (chunk) => {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    });
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    logger.error({ err }, "Chat stream route failed");
    res.write(`data: ${JSON.stringify({ error: err.message, terminal: true })}\n\n`);
    res.end();
  }

});

module.exports = { aiRouter };
