/**
 * Connection-string handling.
 *
 * Supabase's "Connect" dialog offers a Prisma tab whose URL carries
 * Prisma-only query parameters (`pgbouncer=true`, `connection_limit`, ...).
 * The Postgres driver would forward those to the server as runtime settings
 * and be rejected, so they are stripped here. A password that is still the
 * dashboard's `[YOUR-PASSWORD]` placeholder is reported clearly instead of
 * surfacing as an opaque connection timeout.
 */

const PRISMA_ONLY_PARAMS = [
  "pgbouncer",
  "connection_limit",
  "pool_timeout",
  "socket_timeout",
  "statement_cache_size",
  "schema",
];

const PLACEHOLDER_PASSWORD = /^\[?your[-_ ]?password\]?$/i;

export type DatabaseUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: "invalid_url" | "placeholder_password" };

export function normalizeDatabaseUrl(raw: string): DatabaseUrlResult {
  let url: URL;

  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (!/^postgres(ql)?:$/.test(url.protocol)) {
    return { ok: false, reason: "invalid_url" };
  }

  let password = url.password;

  try {
    password = decodeURIComponent(password);
  } catch {
    // Keep the raw value; it is only used for the placeholder check.
  }

  if (PLACEHOLDER_PASSWORD.test(password)) {
    return { ok: false, reason: "placeholder_password" };
  }

  for (const param of PRISMA_ONLY_PARAMS) {
    url.searchParams.delete(param);
  }

  return { ok: true, url: url.toString() };
}
