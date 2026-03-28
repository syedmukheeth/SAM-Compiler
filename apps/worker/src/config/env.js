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
  SANDBOX_NODE_IMAGE: z.string().default("node:20-alpine"),
  SANDBOX_PYTHON_IMAGE: z.string().default("python:3.11-alpine"),
  SANDBOX_GCC_IMAGE: z.string().default("gcc:latest"),
  SANDBOX_OPENJDK_IMAGE: z.string().default("openjdk:17-slim")
});

const env = EnvSchema.parse(process.env);

module.exports = { env };

