import { planContentSchema } from "@/lib/schemas/action-plan";
import { parseBody, json, withApi } from "@/lib/server/api";
import {
  deletePlan,
  getPlan,
  updatePlan,
} from "@/lib/server/action-plan-repo";
import { getDb } from "@/lib/server/db";
import { requirePrincipal } from "@/lib/server/session";

type Params = { id: string };

export const GET = withApi<Params>(async (request, { params }) => {
  const db = getDb();
  const actor = await requirePrincipal(request, db);

  return json({ plan: await getPlan(db, params.id, actor) });
});

export const PUT = withApi<Params>(async (request, { requestId, params }) => {
  const db = getDb();
  const actor = await requirePrincipal(request, db);
  const content = await parseBody(request, planContentSchema);
  const plan = await updatePlan(db, params.id, content, { requestId, actor });

  return json({ plan });
});

export const DELETE = withApi<Params>(
  async (request, { requestId, params }) => {
    const db = getDb();
    const actor = await requirePrincipal(request, db);

    await deletePlan(db, params.id, { requestId, actor });
    return json({ ok: true });
  },
);
