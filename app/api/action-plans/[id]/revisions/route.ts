import { json, withApi } from "@/lib/server/api";
import { listRevisions } from "@/lib/server/action-plan-repo";
import { getDb } from "@/lib/server/db";
import { requirePrincipal } from "@/lib/server/session";

type Params = { id: string };

/** Every version a plan has had, oldest first, without their content. */
export const GET = withApi<Params>(async (request, { params }) => {
  const db = getDb();
  const actor = await requirePrincipal(request, db);

  return json({ revisions: await listRevisions(db, params.id, actor) });
});
