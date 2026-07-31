import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.js"],
    // config/env.js validates at import time and throws without these,
    // so they must exist before any src/ module is loaded.
    env: {
      NODE_ENV: "test",
      JWT_SECRET: "test_jwt_secret_that_is_definitely_over_32_chars",
      GEMINI_API_KEY: "test-gemini-key",
      MONGO_URI: "mongodb://127.0.0.1:27017/sam_test",
      REDIS_URL: "redis://127.0.0.1:6379",
      WEB_ORIGIN: "http://localhost:5174",
      LOG_LEVEL: "silent"
    },
    testTimeout: 30000,
    hookTimeout: 60000
  }
});
