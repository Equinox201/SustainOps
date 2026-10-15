import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";
import { normalizeDatabaseUrl } from "./lib/server/db/url";

// Reads .env.local the same way `next dev` does, so `npm run db:migrate`
// uses the same DATABASE_URL as the app.
loadEnvConfig(process.cwd());

const normalized = normalizeDatabaseUrl(process.env.DATABASE_URL ?? "");

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/server/db/schema.ts",
  out: "./drizzle",
  ...(normalized.ok ? { dbCredentials: { url: normalized.url } } : {}),
});
