import { z } from "zod";

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-5-mini"),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(45_000),
  DATABASE_URL: z.string().min(1).optional(),
  GENERATION_LIMIT_PER_HOUR: z.coerce.number().int().min(1).default(10),
  GENERATION_DAILY_CAP: z.coerce.number().int().min(1).default(200),
  RATE_LIMIT_SALT: z.string().min(1).default("sustainops-dev-salt"),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | null = null;

/** Parsed and validated server configuration (read lazily, cached). */
export function getEnv(): ServerEnv {
  if (!cached) {
    cached = envSchema.parse(process.env);
  }

  return cached;
}
