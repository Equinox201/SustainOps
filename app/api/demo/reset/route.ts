import { can } from "@/features/action-plans/domain/permissions";
import { ApiError, json, withApi } from "@/lib/server/api";
import { replaceDemoPlans } from "@/lib/server/action-plan-repo";
import { getDb } from "@/lib/server/db";
import { buildGroundedDemoPlans } from "@/lib/server/demo-seed";
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

  const result = await replaceDemoPlans(db, await buildGroundedDemoPlans(db), {
    requestId,
    actorUserId: actor.id,
    trigger: "manual",
  });

  return json(result);
});
