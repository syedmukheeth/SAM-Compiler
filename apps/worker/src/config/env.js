const dotenv = require("dotenv");
const { z } = require("zod");

dotenv.config();

const EnvSchema = z.object({
  MONGO_URI: z.string().min(1),
  REDIS_URL: z.string().min(1),
  RUN_TIMEOUT_MS: z.coerce.number().default(10000),
  RUN_MEMORY: z.string().default("256m"),
  RUN_CPUS: z.string().default("0.5"),
  RUN_PIDS_LIMIT: z.coerce.number().default(128),
  SECURITY_STRICT: z.preprocess((v) => v === "true" || v === true, z.boolean()).default(false),
  // Kept in step with the Judge0 ids in apps/api/src/modules/runs/pistonExecutor.js
  // so a program behaves the same whichever backend picks it up. `openjdk` is
  // deprecated on Docker Hub; `eclipse-temurin` is its successor.
  SANDBOX_NODE_IMAGE: z.string().default("node:22-alpine"),
  SANDBOX_PYTHON_IMAGE: z.string().default("python:3.13-alpine"),
  SANDBOX_GCC_IMAGE: z.string().default("gcc:14"),
  SANDBOX_OPENJDK_IMAGE: z.string().default("eclipse-temurin:17-jdk")
});

const env = EnvSchema.parse(process.env);

module.exports = { env };

