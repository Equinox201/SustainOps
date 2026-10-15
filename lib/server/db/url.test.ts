import { describe, expect, it } from "vitest";
import { normalizeDatabaseUrl } from "./url";

const base =
  "postgresql://postgres.abcdefgh:s3cret-pass@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres";

describe("normalizeDatabaseUrl", () => {
  it("accepts a plain pooler URL unchanged", () => {
    const result = normalizeDatabaseUrl(base);

    expect(result).toEqual({ ok: true, url: base });
  });

  it("strips Prisma-only parameters such as pgbouncer=true", () => {
    const result = normalizeDatabaseUrl(
      `${base}?pgbouncer=true&connection_limit=1&sslmode=require`,
    );

    expect(result).toEqual({ ok: true, url: `${base}?sslmode=require` });
  });

  it("flags the dashboard's [YOUR-PASSWORD] placeholder", () => {
    for (const password of ["[YOUR-PASSWORD]", "%5BYOUR-PASSWORD%5D"]) {
      const result = normalizeDatabaseUrl(
        `postgresql://postgres.abcdefgh:${password}@host.supabase.com:6543/postgres?pgbouncer=true`,
      );

      expect(result).toEqual({ ok: false, reason: "placeholder_password" });
    }
  });

  it("rejects values that are not postgres URLs", () => {
    expect(normalizeDatabaseUrl("not a url")).toEqual({
      ok: false,
      reason: "invalid_url",
    });
    expect(normalizeDatabaseUrl("https://example.com")).toEqual({
      ok: false,
      reason: "invalid_url",
    });
  });
});
