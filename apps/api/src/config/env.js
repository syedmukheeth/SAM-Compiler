const dotenv = require("dotenv");
const { z } = require("zod");

dotenv.config();

const EnvSchema = z.object({
  PORT: z.coerce.number().default(8080),
  MONGO_URI: z.string().min(1),
  REDIS_URL: z.string().min(1),
  WEB_ORIGIN: z.string().min(1).default("http://localhost:5173")
});

const env = EnvSchema.parse(process.env);

module.exports = { env };

