const dotenv = require("dotenv");
const { z } = require("zod");

dotenv.config();

const EnvSchema = z.object({
  PORT: z.coerce.number().default(8080),
  MONGO_URI: z.string().trim().optional(),
  REDIS_URL: z.string().trim().optional(),
  WEB_ORIGIN: z.string().trim().min(1).default("https://sam-compiler-web.vercel.app"),
  JWT_SECRET: z.string().trim().min(32, "JWT_SECRET must be at least 32 characters long"),
  JWT_EXPIRES_IN: z.string().trim().default("7d"),
  
  // OAuth (Optional placeholders)
  GITHUB_CLIENT_ID: z.string().trim().optional(),
  GITHUB_CLIENT_SECRET: z.string().trim().optional(),
  GOOGLE_CLIENT_ID: z.string().trim().optional(),
  GOOGLE_CLIENT_SECRET: z.string().trim().optional(),
  CALLBACK_URL_BASE: z.string().trim().default("https://sam-compiler.onrender.com/api/auth"),
  GEMINI_API_KEY: z.string().trim().min(1),
  OPENAI_API_KEYS: z.string().trim().optional(), // Comma-separated list for rotation
  GEMINI_MODEL: z.string().trim().default("gemini-2.5-flash")
});


let env;
const result = EnvSchema.safeParse(process.env);

if (!result.success) {
  console.error("Environment validation failed:", JSON.stringify(result.error.format(), null, 2));
  // Provide bare minimums for startup if on Vercel
  if (process.env.VERCEL) {
    env = {
      PORT: process.env.PORT || 8080,
      MONGO_URI: process.env.MONGO_URI,
      REDIS_URL: process.env.REDIS_URL,
      WEB_ORIGIN: process.env.WEB_ORIGIN || "https://sam-compiler-web.vercel.app",
      JWT_SECRET: process.env.JWT_SECRET || (() => { throw new Error("CRITICAL SECURITY ERROR: JWT_SECRET is missing or empty. Server startup halted."); })(),
      JWT_EXPIRES_IN: "7d",
      CALLBACK_URL_BASE: process.env.CALLBACK_URL_BASE || "https://sam-compiler.onrender.com/api/auth",

      GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      OPENAI_API_KEYS: process.env.OPENAI_API_KEYS,
      GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-2.5-flash"
    };
  } else {
    // If local, we still want to throw to let the dev know
    // and provide details on why it failed
    env = EnvSchema.parse(process.env);
  }
} else {
  env = result.data;
}

const isVercel = !!process.env.VERCEL;
const isProduction = process.env.NODE_ENV === "production";

/**
 * The origin this instance is actually reachable at.
 *
 * Render injects RENDER_EXTERNAL_URL with the service's real hostname, so it
 * cannot drift. CALLBACK_URL_BASE is the last resort because it is typed by
 * hand: production had it pointing at `sam-compiler-api.onrender.com`, a host
 * that does not exist, which silently aimed the keep-alive heartbeat (and the
 * OAuth callbacks) at a 404 - so the free instance was never held awake and
 * every visitor paid a cold start.
 */
const publicBaseUrl = (() => {
  const candidate =
    process.env.RENDER_EXTERNAL_URL ||
    process.env.PUBLIC_BASE_URL ||
    (env.CALLBACK_URL_BASE ? env.CALLBACK_URL_BASE.split("/api/auth")[0] : "");
  const trimmed = (candidate || "").trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(trimmed) ? trimmed : null;
})();

module.exports = { env, isVercel, isProduction, publicBaseUrl };

