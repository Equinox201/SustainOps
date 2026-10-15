import { json, withApi } from "@/lib/server/api";
import { clearSessionCookie } from "@/lib/server/session";

export const POST = withApi(async () =>
  json({ ok: true }, 200, { "set-cookie": clearSessionCookie() }),
);
