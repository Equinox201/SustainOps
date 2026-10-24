import { withdrawRequestSchema } from "@/lib/schemas/knowledge";
import { json, parseBody, withApi } from "@/lib/server/api";
import { getDb } from "@/lib/server/db";
import { withdrawDocument } from "@/lib/server/knowledge-admin";
import { requirePrincipal } from "@/lib/server/session";

type Params = { id: string };

/** Takes an approved document out of use, with a reason (reviewers). */
export const POST = withApi<Params>(async (request, { requestId, params }) => {
  const db = getDb();
  const actor = await requirePrincipal(request, db);
  const { reason } = await parseBody(request, withdrawRequestSchema);

  return json(
    await withdrawDocument(db, params.id, reason, { requestId, actor }),
  );
});
