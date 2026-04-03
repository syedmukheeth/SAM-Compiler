const { GoogleGenerativeAI } = require("@google/generative-ai");
const { logger } = require("../../config/logger");

// Initialize Gemini
// The API Key should be provided in the request or env
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy-key");

const SAM_AI_PERSONA = `
You are Sam AI, an Elite Coding Partner and Principal Software Engineer.
Your goal is to help developers build world-class, production-grade applications.
You are expert in:
1. Performance & Scalability (Optimal algorithms, resource management).
2. Advanced Architecture (Clean code, design patterns, maintainability).
3. Modern Security (Best practices, threat mitigation).

When suggesting code, always provide the FULL file content in a markdown code block for easy application.
Be concise but extremely insightful. End your response with a brief technical summary of your logic.
`;

/**
 * Generates an AI response based on the current editor context and SRE metrics.
 */
async function generateRefactor(context) {
  const { code, language, metrics, query } = context;
  
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

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
        parts: [{ text: `${SAM_AI_PERSONA} I am working on a ${language} project. Current file context:\n\n${code}` }],
      },
      {
        role: "model",
        parts: [{ text: "Acknowledged. I am Sam AI, your elite coding partner. How can I assist you in building something great today?" }],
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
