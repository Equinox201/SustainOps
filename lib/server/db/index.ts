import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { ApiError } from "../api";
import { getEnv } from "../env";
import { normalizeDatabaseUrl } from "./url";
import * as schema from "./schema";

// Any Drizzle Postgres driver (postgres.js in production, PGlite in tests).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = PgDatabase<any, typeof schema>;

let database: Database | null = null;

/** The shared database connection, created on first use. */
export function getDb(): Database {
  if (database) {
    return database;
  }

  const { DATABASE_URL, DATABASE_POOL_MAX } = getEnv();

  if (!DATABASE_URL) {
    throw new ApiError(
      503,
      "database_not_configured",
      "The database is not configured. Set DATABASE_URL.",
    );
  }

  const normalized = normalizeDatabaseUrl(DATABASE_URL);

  if (!normalized.ok) {
    throw new ApiError(
      503,
      "database_misconfigured",
      normalized.reason === "placeholder_password"
        ? "DATABASE_URL still contains the [YOUR-PASSWORD] placeholder. Put your database password in it."
        : "DATABASE_URL is not a valid postgres:// connection string.",
    );
  }

  // prepare:false keeps this compatible with Supabase's transaction pooler.
  const client = postgres(normalized.url, {
    prepare: false,
    max: DATABASE_POOL_MAX,
    connect_timeout: 10,
  });
  database = drizzle(client, { schema });
  return database;
}

/** Test seam: use an in-memory database instead of DATABASE_URL. */
export function setDbForTesting(db: Database | null) {
  database = db;
}

export { schema };
