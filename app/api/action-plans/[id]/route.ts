import { planContentSchema } from "@/lib/schemas/action-plan";
import { parseBody, json, withApi } from "@/lib/server/api";
import {
  deletePlan,
  getPlan,
  updatePlan,
} from "@/lib/server/action-plan-repo";
import { getDb } from "@/lib/server/db";

type Params = { id: string };

export const GET = withApi<Params>(async (_request, { params }) => {
  const plan = await getPlan(getDb(), params.id);
  return json({ plan });
});

export const PUT = withApi<Params>(async (request, { requestId, params }) => {
  const content = await parseBody(request, planContentSchema);
  const plan = await updatePlan(getDb(), params.id, content, { requestId });
  return json({ plan });
});

export const DELETE = withApi<Params>(
  async (_request, { requestId, params }) => {
    await deletePlan(getDb(), params.id, { requestId });
    return json({ ok: true });
  },
);
