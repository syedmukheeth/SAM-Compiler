const { GoogleGenerativeAI } = require("@google/generative-ai");
const { env } = require("../../config/env");
const { logger } = require("../../config/logger");

// Initialize Gemini
const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

// SAM AI Configuration - Priority list for fallback resilience (Updated for May 2026)
const MODELS = [
  "gemini-2.5-flash", // High-speed, low-latency default
  "gemini-2.5-pro"    // High-intelligence fallback
];


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
 * Streams the AI response for a better UX.
 */
async function streamChat(context, onChunk) {
  const { code, language, messages } = context;

  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        systemInstruction: `${SAM_AI_PERSONA}\n\nLanguage: ${language}\nCurrent file content:\n\n${code}`
      });
      
      // Map chat messages correctly and ensure history starts with 'user'
      let chatMessages = messages;
      while (chatMessages.length > 0 && (chatMessages[0].role === "assistant" || chatMessages[0].role === "model")) {
        chatMessages = chatMessages.slice(1);
      }

      const formattedHistory = chatMessages.slice(0, -1).map(m => ({
        role: m.role === "assistant" ? "model" : (m.role || "user"),
        parts: [{ text: m.content || " " }]
      }));

      const chat = model.startChat({
        history: formattedHistory,
      });



      // INITIAL CONNECTION RETRY
      const result = await withRetry(async () => {
        const prompt = messages[messages.length - 1]?.content || "Hello!";
        return await chat.sendMessageStream(prompt);
      });

      // STREAM CONSUMPTION
      try {
        for await (const chunk of result.stream) {
          try {
            const chunkText = chunk.text();
            if (chunkText) onChunk(chunkText);
          } catch (e) {
            // Ignore empty chunks
          }
        }
        return; // Success! 
      } catch (streamErr) {
        logger.error({ err: streamErr.message }, "Gemini AI streaming interrupted");
        throw new Error("AI Stream interrupted due to connection issues. Please try again.");
      }
    } catch (err) {
      logger.warn({ model: modelName, error: err.message }, "AI model fallback triggered in streamChat");
      if (modelName === MODELS[MODELS.length - 1]) {
        logger.error({ error: err.message }, "All Gemini models failed. Activating Offline Sandbox fallback.");
        const isConfig = err.message.includes("404") || err.message.includes("403");
        
        let offlineMsg = "⚠️ **SAM AI is currently in Sandbox Mode (Offline).**\n\n";
        if (isConfig) {
          offlineMsg += "The AI engine configuration is outdated (e.g. legacy model versions) or the API key is missing permissions. Please check the `GEMINI_MODEL` environment variable. In the meantime, you can still compile and run your code natively!";
        } else {
          offlineMsg += "We are experiencing unusually high demand or connection timeouts. The AI engine will reconnect shortly. In the meantime, you can still compile and run your code natively!";
        }
        
        // Stream the graceful degradation message smoothly to avoid UI breakage
        const chunks = offlineMsg.split(" ");
        for (let i = 0; i < chunks.length; i++) {
           onChunk(chunks[i] + " ");
           await new Promise(r => setTimeout(r, 40));
        }
        return; // Resolve successfully without throwing
      }
    }
  }
}

module.exports = { streamChat };
