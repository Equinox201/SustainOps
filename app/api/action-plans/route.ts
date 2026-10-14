import { planContentSchema } from "@/lib/schemas/action-plan";
import { parseBody, json, withApi } from "@/lib/server/api";
import { createPlan, listPlans } from "@/lib/server/action-plan-repo";
import { getDb } from "@/lib/server/db";

export const GET = withApi(async () => {
  const plans = await listPlans(getDb());
  return json({ plans });
});

export const POST = withApi(async (request, { requestId }) => {
  const content = await parseBody(request, planContentSchema);
  const plan = await createPlan(getDb(), content, { requestId });
  return json({ plan }, 201);
});
