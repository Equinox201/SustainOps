import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { ApiError } from "../api";
import { getEnv } from "../env";
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

  const { DATABASE_URL } = getEnv();

  if (!DATABASE_URL) {
    throw new ApiError(
      503,
      "database_not_configured",
      "The database is not configured. Set DATABASE_URL.",
    );
  }

  // prepare:false keeps this compatible with Supabase's transaction pooler.
  const client = postgres(DATABASE_URL, { prepare: false, max: 5 });
  database = drizzle(client, { schema });
  return database;
}

export { schema };
