const { GoogleGenerativeAI } = require("@google/generative-ai");
const { logger } = require("../../config/logger");

// Initialize Gemini
// The API Key should be provided in the request or env
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy-key");

const SRE_PERSONA = `
You are a Senior Site Reliability Engineer (SRE) and Principal Software Engineer at Google.
Your goal is to help developers write highly-optimized, secure, and production-ready code.
You focus on:
1. Performance (Big O complexity, memory layout, avoiding allocations in hot paths).
2. Security (Input validation, OWASP standards, preventing injections).
3. Industry Standards (Maintainable, idiomatic, well-documented code).

When suggesting code fixes, return the FULL file content with your improvements in a markdown code block.
Always explain YOUR reasoning concisely at the end of the code in a standard comment block for that language.
`;

/**
 * Generates an AI response based on the current editor context and SRE metrics.
 */
async function generateRefactor(context) {
  const { code, language, metrics, query } = context;
  
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `
${SRE_PERSONA}

CONTEXT:
Language: ${language}
Current Metrics: ${JSON.stringify(metrics || {})}
Query: ${query || "Refactor this code to follow standard SRE best practices."}

STRICT INSTRUCTIONS:
Predict the performance impact of your changes.
If the current metrics show high latency (e.g. > 100ms), focus on algorithmic optimization.

FILE CONTENT:
\`\`\`${language}
${code}
\`\`\`
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (err) {
    logger.error({ err }, "Gemini AI generation failed");
    throw new Error("AI Assistant is currently unavailable. Check your GEMINI_API_KEY.");
  }
}

/**
 * Streams the AI response for a better UX.
 */
async function streamChat(context, onChunk) {
  const { code, language, messages } = context;
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const chat = model.startChat({
    history: [
      {
        role: "user",
        parts: [{ text: `${SRE_PERSONA} I am working on a ${language} project in LiquidIDE. Current file:\n\n${code}` }],
      },
      {
        role: "model",
        parts: [{ text: "Acknowledged. I am your Senior SRE Assistant. How can I optimize your code today?" }],
      },
    ],
  });

  try {
    const result = await chat.sendMessageStream(messages[messages.length - 1].content);
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      onChunk(chunkText);
    }
  } catch (err) {
    logger.error({ err }, "Gemini AI streaming failed");
    throw err;
  }
}

module.exports = { generateRefactor, streamChat };
