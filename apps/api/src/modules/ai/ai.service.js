const { GoogleGenerativeAI } = require("@google/generative-ai");
const OpenAI = require("openai");
const { env } = require("../../config/env");
const { logger } = require("../../config/logger");

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

// Priority models for each provider
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];
const OPENAI_MODELS = ["gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"];

// Log AI health on initialization
const geminiKeysCount = (env.GEMINI_API_KEY || "").split(",").filter(Boolean).length;
const openAIKeysCount = (env.OPENAI_API_KEYS || "").split(",").filter(Boolean).length;
logger.info({ geminiKeys: geminiKeysCount, openAIKeys: openAIKeysCount }, "AI Engine initialized with multi-provider queue");

/**
 * Robust retry wrapper for transient AI failures (503, 429)
 */
async function withRetry(fn, maxRetries = 2) {
  let lastErr;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const statusCode = err.status || (err.response && err.response.status) || (err.error && err.error.status);
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
      await new Promise(r => setTimeout(r, 1000 * (i + 1))); 
    }
  }
  throw lastErr;
}

/**
 * Provider-agnostic stream generator
 */
async function streamChat(context, onChunk) {
  const { code, language, messages } = context;
  
  // Construct the Key Pool
  const geminiKeys = (env.GEMINI_API_KEY || "").split(",").map(k => k.trim()).filter(Boolean);
  const openAIKeys = (env.OPENAI_API_KEYS || "").split(",").map(k => k.trim()).filter(Boolean);

  const providers = [];

  // 1. Primary: OpenAI Keys (User provided 3)
  openAIKeys.forEach(key => {
    OPENAI_MODELS.forEach(model => {
      providers.push({ type: "openai", key, model });
    });
  });

  // 2. Secondary: Gemini Keys
  geminiKeys.forEach(key => {
    GEMINI_MODELS.forEach(model => {
      providers.push({ type: "gemini", key, model });
    });
  });

  // Ensure we have at least one provider
  if (providers.length === 0) {
    logger.error("No AI Provider keys configured (GEMINI_API_KEY or OPENAI_API_KEYS)");
    return triggerOfflineFallback(onChunk, true);
  }

  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    try {
      if (p.type === "gemini") {
        await streamGemini(p, context, onChunk);
      } else {
        await streamOpenAI(p, context, onChunk);
      }
      return; // SUCCESS!
    } catch (err) {
      const isLast = i === providers.length - 1;
      logger.warn({ provider: p.type, model: p.model, error: err.message }, `AI Provider failure (Attempt ${i+1}/${providers.length})`);
      
      if (isLast) {
        return triggerOfflineFallback(onChunk, err.message.includes("404") || err.message.includes("403"));
      }
    }
  }
}

async function streamGemini(p, context, onChunk) {
  const { code, language, messages } = context;
  const genAI = new GoogleGenerativeAI(p.key);
  const model = genAI.getGenerativeModel({ 
    model: p.model,
    systemInstruction: `${SAM_AI_PERSONA}\n\nLanguage: ${language}\nCurrent file content:\n\n${code}`
  });
  
  let chatMessages = messages;
  while (chatMessages.length > 0 && (chatMessages[0].role === "assistant" || chatMessages[0].role === "model")) {
    chatMessages = chatMessages.slice(1);
  }

  const formattedHistory = chatMessages.slice(0, -1).map(m => ({
    role: m.role === "assistant" ? "model" : (m.role || "user"),
    parts: [{ text: m.content || " " }]
  }));

  const chat = model.startChat({ history: formattedHistory });

  const result = await withRetry(async () => {
    const prompt = messages[messages.length - 1]?.content || "Hello!";
    return await chat.sendMessageStream(prompt);
  });

  for await (const chunk of result.stream) {
    const chunkText = chunk.text();
    if (chunkText) onChunk(chunkText);
  }
}

async function streamOpenAI(p, context, onChunk) {
  const { code, language, messages } = context;
  const openai = new OpenAI({ apiKey: p.key });

  const systemMsg = {
    role: "system",
    content: `${SAM_AI_PERSONA}\n\nLanguage: ${language}\nCurrent file content:\n\n${code}`
  };

  const formattedMessages = [systemMsg, ...messages.map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content
  }))];

  const stream = await withRetry(async () => {
    return await openai.chat.completions.create({
      model: p.model,
      messages: formattedMessages,
      stream: true,
    });
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    if (content) onChunk(content);
  }
}

async function triggerOfflineFallback(onChunk, isConfigError) {
  logger.error("All AI Provider keys failed. Activating Offline Sandbox fallback.");
  
  let offlineMsg = "⚠️ **SAM AI is currently in Sandbox Mode (Offline).**\n\n";
  if (isConfigError) {
    offlineMsg += "The AI engine configuration is outdated (e.g. legacy model versions) or all provided API keys have failed. Please check your Render environment variables. In the meantime, you can still compile and run your code natively!";
  } else {
    offlineMsg += "We are experiencing unusually high demand across all AI providers. The engine will reconnect shortly. In the meantime, you can still compile and run your code natively!";
  }
  
  const chunks = offlineMsg.split(" ");
  for (let i = 0; i < chunks.length; i++) {
     onChunk(chunks[i] + " ");
     await new Promise(r => setTimeout(r, 40));
  }
}

module.exports = { streamChat };
