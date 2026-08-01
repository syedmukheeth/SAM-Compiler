const { GoogleGenerativeAI } = require("@google/generative-ai");
const OpenAI = require("openai");
const { env } = require("../../config/env");
const { logger } = require("../../config/logger");

// Model rotation priority
const OPENAI_MODELS = ["gpt-4o-mini", "gpt-4o"];
const GEMINI_MODELS = [env.GEMINI_MODEL || "gemini-1.5-flash", "gemini-1.5-pro"];

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
 * Token budgets.
 *
 * Nothing bounded what was sent per request: the whole editor buffer went into
 * the system instruction (the route accepts up to 1MB, roughly 250k tokens),
 * and the last 10 messages were replayed in full. Because the persona asks for
 * complete files back, every assistant reply re-entered the history as input on
 * the next turn, so cost grew with conversation length rather than staying flat.
 *
 * Sizes are in characters, roughly 4 chars per token.
 */
const MAX_CODE_CHARS = 48000;      // ~12k tokens of file context
const MAX_HISTORY_MESSAGE_CHARS = 4000;
const MAX_HISTORY_MESSAGES = 6;

/**
 * Keeps the head and tail of a file and elides the middle. Imports and the
 * signatures near the top, plus whatever the user is currently working on near
 * the bottom, matter more than the middle of a long file.
 */
function clampCode(code) {
  const text = typeof code === "string" ? code : "";
  if (text.length <= MAX_CODE_CHARS) return text;

  const head = Math.floor(MAX_CODE_CHARS * 0.6);
  const tail = MAX_CODE_CHARS - head;
  const omitted = text.length - MAX_CODE_CHARS;
  return (
    text.slice(0, head) +
    `\n\n/* ... ${omitted} characters omitted to stay within the context budget ... */\n\n` +
    text.slice(-tail)
  );
}

/**
 * Trims replayed history. Only the most recent turn keeps its full text; older
 * ones are capped, which is where the full-file code blocks accumulate.
 */
function clampHistory(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const recent = list.slice(-MAX_HISTORY_MESSAGES);

  return recent.map((m, i) => {
    const content = typeof m.content === "string" ? m.content : "";
    const isLast = i === recent.length - 1;
    if (isLast || content.length <= MAX_HISTORY_MESSAGE_CHARS) return { ...m, content };
    return { ...m, content: content.slice(0, MAX_HISTORY_MESSAGE_CHARS) + "\n... (truncated)" };
  });
}

/** Shared system prompt, built once per request rather than per provider. */
function buildSystemInstruction(language, code) {
  return `${SAM_AI_PERSONA}\n\nLanguage: ${language}\nCurrent file content:\n\n${clampCode(code)}`;
}

// Client Caches (Singletons to minimize initialization overhead)
const clientCache = {
  gemini: new Map(),
  openai: new Map()
};

/**
 * Robust retry wrapper for transient AI failures (503, 429)
 * Reduced retries for faster failover to the next key in the pool.
 */
async function withRetry(fn, maxRetries = 1) {
  let lastErr;
  for (let i = 0; i <= maxRetries; i++) {
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
      
      if (!isRetryable || i === maxRetries) throw err;
      
      logger.warn({ attempt: i + 1, err: err.message }, "Transient AI failure, retrying once...");
      await new Promise(r => setTimeout(r, 400)); // Ultra-fast retry delay
    }
  }
  throw lastErr;
}

/**
 * Provider-agnostic stream generator with Intelligent Rotation
 */
async function streamChat(context, onChunk) {
  // `context` is forwarded whole to streamGemini/streamOpenAI below.
  const geminiKeys = (env.GEMINI_API_KEY || "").split(",").map(k => k.trim()).filter(Boolean);
  const openAIKeys = (env.OPENAI_API_KEYS || "").split(",").map(k => k.trim()).filter(Boolean);

  const providers = [];

  // PHASE 1: Try the fastest models for all keys first (Interleaved)
  openAIKeys.forEach(key => providers.push({ type: "openai", key, model: OPENAI_MODELS[0] }));
  geminiKeys.forEach(key => providers.push({ type: "gemini", key, model: GEMINI_MODELS[0] }));
  
  // PHASE 2: Fallback models
  if (OPENAI_MODELS[1]) {
    openAIKeys.forEach(key => providers.push({ type: "openai", key, model: OPENAI_MODELS[1] }));
  }
  if (GEMINI_MODELS[1]) {
    geminiKeys.forEach(key => providers.push({ type: "gemini", key, model: GEMINI_MODELS[1] }));
  }

  if (providers.length === 0) {
    logger.error("No AI Provider keys configured");
    return triggerOfflineFallback(onChunk, true);
  }

  // LIMIT: Only try up to 4 providers per request to keep latency low
  const maxAttempts = Math.min(providers.length, 4);

  for (let i = 0; i < maxAttempts; i++) {
    const p = providers[i];
    try {
      if (p.type === "gemini") {
        await streamGemini(p, context, onChunk);
      } else {
        await streamOpenAI(p, context, onChunk);
      }
      return; // SUCCESS!
    } catch (err) {
      const isLast = i === maxAttempts - 1;
      const errorMsg = err.message || "Unknown error";
      logger.warn({ provider: p.type, model: p.model, error: errorMsg }, `AI Provider failure (Attempt ${i+1}/${maxAttempts})`);
      
      if (isLast) {
        return triggerOfflineFallback(onChunk, errorMsg.includes("404") || errorMsg.includes("403"));
      }
    }
  }
}

async function streamGemini(p, context, onChunk) {
  const { code, language, messages } = context;
  
  // Get or Create Cached Client
  if (!clientCache.gemini.has(p.key)) {
    clientCache.gemini.set(p.key, new GoogleGenerativeAI(p.key));
  }
  const genAI = clientCache.gemini.get(p.key);
  
  const model = genAI.getGenerativeModel({
    model: p.model,
    systemInstruction: buildSystemInstruction(language, code)
  });

  let chatMessages = clampHistory(messages);
  while (chatMessages.length > 0 && (chatMessages[0].role === "assistant" || chatMessages[0].role === "model")) {
    chatMessages = chatMessages.slice(1);
  }

  const formattedHistory = chatMessages.slice(0, -1).map(m => ({
    role: m.role === "assistant" ? "model" : (m.role || "user"),
    parts: [{ text: m.content || " " }]
  }));

  const chat = model.startChat({ history: formattedHistory });

  const result = await withRetry(async () => {
    const prompt = chatMessages[chatMessages.length - 1]?.content || "Hello!";
    return await chat.sendMessageStream(prompt);
  });

  for await (const chunk of result.stream) {
    const chunkText = chunk.text();
    if (chunkText) onChunk(chunkText);
  }
}

async function streamOpenAI(p, context, onChunk) {
  const { code, language, messages } = context;
  
  // Get or Create Cached Client with Keep-Alive
  if (!clientCache.openai.has(p.key)) {
    clientCache.openai.set(p.key, new OpenAI({ 
      apiKey: p.key,
      maxRetries: 0,
      timeout: 20000 
    }));
  }
  const openai = clientCache.openai.get(p.key);

  const systemMsg = {
    role: "system",
    content: buildSystemInstruction(language, code)
  };

  const formattedMessages = [systemMsg, ...clampHistory(messages).map(m => ({
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
     await new Promise(r => setTimeout(r, 20)); // High-speed fallback
  }
}

module.exports = {
  streamChat,
  // Exported for tests.
  clampCode,
  clampHistory,
  buildSystemInstruction,
  BUDGETS: { MAX_CODE_CHARS, MAX_HISTORY_MESSAGE_CHARS, MAX_HISTORY_MESSAGES }
};
