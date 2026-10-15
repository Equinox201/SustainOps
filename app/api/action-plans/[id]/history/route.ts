import { json, withApi } from "@/lib/server/api";
import { getPlanHistory } from "@/lib/server/action-plan-repo";
import { getDb } from "@/lib/server/db";
import { requirePrincipal } from "@/lib/server/session";

type Params = { id: string };

export const GET = withApi<Params>(async (request, { params }) => {
  const db = getDb();
  const actor = await requirePrincipal(request, db);

  return json({ events: await getPlanHistory(db, params.id, actor) });
});
