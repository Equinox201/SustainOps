import { timingSafeEqual } from "node:crypto";
import { ApiError, json, withApi } from "@/lib/server/api";
import { getDb } from "@/lib/server/db";
import { resetDemoData } from "@/lib/server/demo-reset";
import { getEnv } from "@/lib/server/env";

function sameSecret(supplied: string, expected: string) {
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Nightly reset, called by Vercel Cron. Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; with no secret configured the endpoint
 * refuses every request rather than being open.
 */
export const GET = withApi(async (request, { requestId }) => {
  const { CRON_SECRET } = getEnv();

  if (!CRON_SECRET) {
    throw new ApiError(
      503,
      "cron_not_configured",
      "Scheduled reset is not configured. Set CRON_SECRET.",
    );
  }

  const supplied = request.headers.get("authorization") ?? "";

  if (!sameSecret(supplied, `Bearer ${CRON_SECRET}`)) {
    throw new ApiError(401, "unauthenticated", "Invalid cron credentials.");
  }

  const db = getDb();
  const result = await resetDemoData(db, {
    requestId,
    actorUserId: null,
    trigger: "scheduled",
  });

  return json(result);
});
