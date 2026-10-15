import { z } from "zod";

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-5-mini"),
  EMBEDDINGS_PROVIDER: z.enum(["openai", "hash"]).default("openai"),
  EMBEDDINGS_MODEL: z.string().min(1).default("text-embedding-3-small"),
  RETRIEVAL_TOP_K: z.coerce.number().int().min(1).max(12).default(6),
  RETRIEVAL_MIN_SCORE: z.coerce.number().min(0).max(1).optional(),
  OPENAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(500).max(32000).default(8000),
  OPENAI_REASONING_EFFORT: z.enum(["minimal", "low", "medium", "high"]).optional(),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(45_000),
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  SESSION_SECRET: z.string().min(32).optional(),
  GENERATION_LIMIT_PER_HOUR: z.coerce.number().int().min(1).default(10),
  GENERATION_DAILY_CAP: z.coerce.number().int().min(1).default(200),
  RATE_LIMIT_SALT: z.string().min(1).default("sustainops-dev-salt"),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | null = null;

/** Parsed and validated server configuration (read lazily, cached). */
export function getEnv(): ServerEnv {
  if (!cached) {
    // An empty value (KEY=) means "not set", as it does in most tooling.
    const present = Object.fromEntries(
      Object.entries(process.env).filter(([, value]) => value !== ""),
    );

    cached = envSchema.parse(present);
  }

  return cached;
}
