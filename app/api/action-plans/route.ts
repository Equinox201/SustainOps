import { planContentSchema } from "@/lib/schemas/action-plan";
import { parseBody, json, withApi } from "@/lib/server/api";
import { createPlan, listPlans } from "@/lib/server/action-plan-repo";
import { getDb } from "@/lib/server/db";
import { requirePrincipal } from "@/lib/server/session";

export const GET = withApi(async (request) => {
  const db = getDb();
  const actor = await requirePrincipal(request, db);

  return json({ plans: await listPlans(db, actor) });
});

export const POST = withApi(async (request, { requestId }) => {
  const db = getDb();
  const actor = await requirePrincipal(request, db);
  const content = await parseBody(request, planContentSchema);
  const plan = await createPlan(db, content, { requestId, actor });

  return json({ plan }, 201);
});
