const dotenv = require("dotenv");
const { z } = require("zod");

dotenv.config();

const EnvSchema = z.object({
  MONGO_URI: z.string().min(1),
  REDIS_URL: z.string().min(1),
  RUN_TIMEOUT_MS: z.coerce.number().default(10000),
  RUN_MEMORY: z.string().default("256m"),
  RUN_CPUS: z.string().default("0.5"),
  RUN_PIDS_LIMIT: z.coerce.number().default(128)
});

const env = EnvSchema.parse(process.env);

module.exports = { env };

