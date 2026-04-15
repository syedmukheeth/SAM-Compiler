const { GoogleGenerativeAI } = require("@google/generative-ai");
const { logger } = require("../../config/logger");

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy-key");

// SAM AI Configuration
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash"; 

const SAM_AI_PERSONA = `
You are Sam AI, a World-Class Code Helper and Compiler Assistant.
Your goal is to help developers understand, debug, and optimize code quickly and effectively.
You are expert in:
1. Instant Debugging (Finding syntax and logic errors).
2. Code Explanation (Breaking down complex logic into simple terms).
3. Performance Tuning (Making code faster and more efficient).

When suggesting code, always provide the FULL file content in a markdown code block for easy application.
Be helpful, concise, and focused on helping the user learn and build.
`;

/**
 * Basic retry wrapper for transient AI failures (503, 429)
 * CRITICAL: This should only be used for the INITIAL API call.
 */
async function withRetry(fn, maxRetries = 2) {
  let lastErr;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const statusCode = err.status || (err.response && err.response.status);
      const isRetryable = statusCode === 503 || statusCode === 429 || err.message.includes("high demand");
      
      if (!isRetryable) throw err;
      
      logger.warn({ attempt: i + 1, err: err.message }, "Transient AI failure, retrying...");
      await new Promise(r => setTimeout(r, 1000 * (i + 1))); 
    }
  }
  throw lastErr;
}

/**
 * Generates an AI response based on the current editor context and SRE metrics.
 */
async function generateRefactor(context) {
  const { code, language, metrics, query } = context;
  const model = genAI.getGenerativeModel({ model: DEFAULT_MODEL });

  const prompt = `
${SAM_AI_PERSONA}

CONTEXT:
Language: ${language}
Current Metrics: ${JSON.stringify(metrics || {})}
Query: ${query || "Refactor this code for production-grade excellence."}

STRICT INSTRUCTIONS:
Predict the performance impact of your changes.
If the current metrics show high latency (e.g. > 100ms), prioritize algorithmic optimization.

FILE CONTENT:
\`\`\`${language}
${code}
\`\`\`
  `;

  return withRetry(async () => {
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (err) {
      logger.error({ err }, "Gemini AI generation failed");
      throw new Error(`AI Assistant is currently facing high demand (${err.message}). Please try again in a moment.`);
    }
  });
}

/**
 * Streams the AI response for a better UX.
 */
async function streamChat(context, onChunk) {
  const { code, language, messages } = context;
  const model = genAI.getGenerativeModel({ model: DEFAULT_MODEL });

  const formattedHistory = [
    {
      role: "user",
      parts: [{ text: `SYSTEM CONTEXT:\n${SAM_AI_PERSONA}\n\nLanguage: ${language}\nCurrent file content:\n\n${code}` }],
    },
    {
      role: "model",
      parts: [{ text: "Acknowledged. I am Sam AI, your elite coding partner. I am ready." }],
    },
    ...messages.slice(0, -1).map(m => ({
      role: m.role,
      parts: [{ text: m.content ? m.content : " " }] // Prevent empty text part crashing the SDK
    }))
  ];

  const chat = model.startChat({
    history: formattedHistory,
  });

  // INITIAL CONNECTION RETRY
  const result = await withRetry(async () => {
    try {
      const prompt = messages[messages.length - 1].content || " ";
      return await chat.sendMessageStream(prompt);
    } catch (err) {
      logger.error({ err }, "Gemini AI stream initialization failed");
      throw err;
    }
  });

  // STREAM CONSUMPTION (No retry here to avoid corrupting active stream)
  try {
    for await (const chunk of result.stream) {
      try {
        const chunkText = chunk.text();
        if (chunkText) onChunk(chunkText);
      } catch (e) {
        logger.warn("Empty chunk received or failed to parse chunk text");
      }
    }
  } catch (err) {
    logger.error({ err }, "Gemini AI streaming interrupted");
    throw new Error("AI Stream interrupted due to connection issues. Please try again.");
  }
}

module.exports = { generateRefactor, streamChat };
