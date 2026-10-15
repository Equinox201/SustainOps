import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./db/schema";
import type { Database } from "./db";

/** A fresh in-memory Postgres with the real migrations applied. */
export async function createTestDb(): Promise<Database> {
  const client = new PGlite({ extensions: { vector } });
  const db = drizzle(client, { schema });

  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });

  // Supabase puts "extensions" on the search path; mirror it so the vector
  // operators resolve the same way here.
  await client.exec("set search_path to public, extensions");

  return db as unknown as Database;
}
