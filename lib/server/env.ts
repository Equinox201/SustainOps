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
  GENERATION_IP_LIMIT_PER_HOUR: z.coerce.number().int().min(1).default(5),
  GENERATION_DAILY_CAP: z.coerce.number().int().min(1).default(200),
  CRON_SECRET: z.string().min(16).optional(),
  RATE_LIMIT_SALT: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof envSchema>;

/**
 * Salt for hashing visitor addresses. A salt that is public in the repository
 * would let anyone brute-force the small IPv4 space, so by default it is
 * derived from SESSION_SECRET, which is already a deployment secret. The
 * development fallback only applies when neither is configured.
 */
export function getRateLimitSalt(env: ServerEnv): string {
  return env.RATE_LIMIT_SALT ?? env.SESSION_SECRET ?? "sustainops-dev-salt";
}

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
