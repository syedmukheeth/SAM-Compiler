const dotenv = require("dotenv");
const { z } = require("zod");

dotenv.config();

const EnvSchema = z.object({
  PORT: z.coerce.number().default(8080),
  MONGO_URI: z.string().optional(),
  REDIS_URL: z.string().optional(),
  WEB_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  JWT_SECRET: z.string().min(12).default("liquid_super_secret_standalone_key_2026"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  
  // OAuth (Optional placeholders)
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  CALLBACK_URL_BASE: z.string().default("http://localhost:8080/auth")
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
      WEB_ORIGIN: process.env.WEB_ORIGIN || "http://localhost:5173",
      JWT_SECRET: process.env.JWT_SECRET || "liquid-ide-super-secret-key-2026",
      JWT_EXPIRES_IN: "7d",
      CALLBACK_URL_BASE: process.env.CALLBACK_URL_BASE || "http://localhost:8080/auth",
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

