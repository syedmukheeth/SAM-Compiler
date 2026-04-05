const dotenv = require("dotenv");
const { z } = require("zod");

dotenv.config();

const EnvSchema = z.object({
  PORT: z.coerce.number().default(8080),
  MONGO_URI: z.string().trim().optional(),
  REDIS_URL: z.string().trim().optional(),
  WEB_ORIGIN: z.string().trim().min(1).default("https://sam-compiler-web.vercel.app"),
  JWT_SECRET: z.string().trim().min(12).default("sam_compiler_super_secret_key_2026"),
  JWT_EXPIRES_IN: z.string().trim().default("7d"),
  
  // OAuth (Optional placeholders)
  GITHUB_CLIENT_ID: z.string().trim().optional(),
  GITHUB_CLIENT_SECRET: z.string().trim().optional(),
  GOOGLE_CLIENT_ID: z.string().trim().optional(),
  GOOGLE_CLIENT_SECRET: z.string().trim().optional(),
  CALLBACK_URL_BASE: z.string().trim().default("https://sam-compiler.onrender.com/api/auth")
});


let env;
const result = EnvSchema.safeParse(process.env);

if (!result.success) {
  console.error("⚠️ Environment validation failed:", JSON.stringify(result.error.format(), null, 2));
  // Provide bare minimums for startup if on Vercel
  if (process.env.VERCEL) {
    env = {
      PORT: process.env.PORT || 8080,
      MONGO_URI: process.env.MONGO_URI,
      REDIS_URL: process.env.REDIS_URL,
      WEB_ORIGIN: process.env.WEB_ORIGIN || "https://sam-compiler-web.vercel.app",
      JWT_SECRET: process.env.JWT_SECRET || "sam-compiler-super-secret-key-2026",
      JWT_EXPIRES_IN: "7d",
      CALLBACK_URL_BASE: process.env.CALLBACK_URL_BASE || "https://sam-compiler.onrender.com/api/auth",

      GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET
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

module.exports = { env, isVercel, isProduction };

