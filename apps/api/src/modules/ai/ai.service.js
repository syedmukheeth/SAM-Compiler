const { GoogleGenerativeAI } = require("@google/generative-ai");
const { logger } = require("../../config/logger");

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy-key");

// SAM AI Configuration - Priority list for fallback resilience
const MODELS = [
  process.env.GEMINI_MODEL || "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-flash-preview",
  "gemini-3.1-pro-preview",
  "gemini-2.0-flash"
];

const DEFAULT_MODEL = MODELS[0];

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
      const msg = (err.message || "").toLowerCase();
      
      const isRetryable = 
        statusCode === 503 || 
        statusCode === 429 || 
        statusCode === 504 || 
        statusCode === 500 ||
        msg.includes("high demand") ||
        msg.includes("resource has been exhausted") ||
        msg.includes("deadline exceeded") ||
        msg.includes("internal error");
      
      if (!isRetryable) throw err;
      
      logger.warn({ attempt: i + 1, err: err.message }, "Transient AI failure, retrying...");
      await new Promise(r => setTimeout(r, 1500 * (i + 1))); 
    }
  }
  throw lastErr;
}

/**
 * Generates an AI response based on the current editor context and SRE metrics.
 */
async function generateRefactor(context) {
  const { code, language, metrics, query } = context;

  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
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

      return await withRetry(async () => {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
      });
    } catch (err) {
      logger.warn({ model: modelName, error: err.message }, "AI model fallback triggered in generateRefactor");
      if (modelName === MODELS[MODELS.length - 1]) throw err; // Re-throw if last resort fails
    }
  }
}

/**
 * Streams the AI response for a better UX.
 */
async function streamChat(context, onChunk) {
  const { code, language, messages } = context;

  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
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
        const prompt = messages[messages.length - 1].content || " ";
        return await chat.sendMessageStream(prompt);
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
        return; // Success! Return from function
      } catch (streamErr) {
        // If the stream fails halfway, we can't easily switch models without restarting the whole history
        // So we just log and throw.
        logger.error({ err: streamErr.message }, "Gemini AI streaming interrupted");
        throw new Error("AI Stream interrupted due to connection issues. Please try again.");
      }
    } catch (err) {
      logger.warn({ model: modelName, error: err.message }, "AI model fallback triggered in streamChat");
      if (modelName === MODELS[MODELS.length - 1]) {
        throw new Error(`AI Assistant is currently facing high demand. Please try again in a moment.`);
      }
    }
  }
}

module.exports = { generateRefactor, streamChat };
