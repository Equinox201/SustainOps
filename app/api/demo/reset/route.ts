import { can } from "@/features/action-plans/domain/permissions";
import { ApiError, json, withApi } from "@/lib/server/api";
import { getDb } from "@/lib/server/db";
import { resetDemoData } from "@/lib/server/demo-reset";
import { requirePrincipal } from "@/lib/server/session";

/** Manager-triggered reset of the public demo to its fictional starting data. */
export const POST = withApi(async (request, { requestId }) => {
  const db = getDb();
  const actor = await requirePrincipal(request, db);

  if (!can(actor, "demo:reset")) {
    throw new ApiError(
      403,
      "forbidden",
      "Your role is not allowed to reset the demo.",
      { permission: "demo:reset" },
    );
  }

  const result = await resetDemoData(db, {
    requestId,
    actorUserId: actor.id,
    trigger: "manual",
  });

  return json(result);
});
