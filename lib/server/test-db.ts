import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./db/schema";
import type { Database } from "./db";

/** A fresh in-memory Postgres with the real migrations applied. */
export async function createTestDb(): Promise<Database> {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });

  return db as unknown as Database;
}
