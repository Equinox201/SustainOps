// Verifies DATABASE_URL: connects, then reports migrations and table sizes.
// Prints no credentials. Run with: npm run db:check
//
// Optional overrides, handy when a network blocks the transaction pooler:
//   npm run db:check -- --port=5432
//   npm run db:check -- --host=aws-1-ap-northeast-2.pooler.supabase.com --port=5432
import nextEnv from "@next/env";
import postgres from "postgres";
import { normalizeDatabaseUrl } from "../lib/server/db/url.ts";

nextEnv.loadEnvConfig(process.cwd());

const normalized = normalizeDatabaseUrl(process.env.DATABASE_URL ?? "");

if (!normalized.ok) {
  console.error(
    normalized.reason === "placeholder_password"
      ? "DATABASE_URL still contains the [YOUR-PASSWORD] placeholder."
      : "DATABASE_URL is missing or is not a valid postgres:// URL.",
  );
  process.exit(1);
}

const url = new URL(normalized.url);

for (const arg of process.argv.slice(2)) {
  const [flag, value] = arg.replace(/^--/, "").split("=");

  if (flag === "port" && value) url.port = value;
  if (flag === "host" && value) url.hostname = value;
}

console.log(`Connecting to ${url.hostname}:${url.port} as ${url.username} ...`);

const sql = postgres(url.toString(), {
  prepare: false,
  max: 1,
  connect_timeout: 15,
});

try {
  const [{ version }] = await sql`select version()`;
  console.log("Connected:", version.split(" on ")[0]);

  const migrations = await sql`select count(*)::int as n from drizzle.__drizzle_migrations`;
  console.log("Registered migrations:", migrations[0].n);

  for (const table of ["users", "action_plans", "audit_events", "ai_generations"]) {
    const [{ n }] = await sql.unsafe(`select count(*)::int as n from public.${table}`);
    console.log(`  ${table}: ${n} rows`);
  }

  const users = await sql`select name, role from public.users order by name`;
  console.log("Personas:", users.map((u) => `${u.name} (${u.role})`).join(", "));
  console.log("\nDatabase OK.");
} catch (error) {
  console.error("FAILED:", error.code ?? error.name, "-", String(error.message).slice(0, 200));
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 2 });
}
