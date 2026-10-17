import { json, withApi } from "@/lib/server/api";
import { getGenerationDiagnostics } from "@/lib/server/action-plan-repo";
import { getDb } from "@/lib/server/db";
import { requirePrincipal } from "@/lib/server/session";

type Params = { id: string };

/**
 * Why each section of the knowledge base was or was not given to the model
 * for this plan. Managers and reviewers only.
 */
export const GET = withApi<Params>(async (request, { params }) => {
  const db = getDb();
  const actor = await requirePrincipal(request, db);

  return json(await getGenerationDiagnostics(db, params.id, actor));
});
