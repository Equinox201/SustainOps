import { knowledgeDraftSchema } from "@/lib/schemas/knowledge";
import { json, parseBody, withApi } from "@/lib/server/api";
import { getDb } from "@/lib/server/db";
import {
  deleteDraft,
  getKnowledgeDocument,
  updateDraft,
} from "@/lib/server/knowledge-admin";
import { requirePrincipal } from "@/lib/server/session";

type Params = { id: string };

export const GET = withApi<Params>(async (request, { params }) => {
  const db = getDb();
  await requirePrincipal(request, db);

  return json(await getKnowledgeDocument(db, params.id));
});

export const PUT = withApi<Params>(async (request, { requestId, params }) => {
  const db = getDb();
  const actor = await requirePrincipal(request, db);
  const input = await parseBody(request, knowledgeDraftSchema);

  return json(await updateDraft(db, params.id, input, { requestId, actor }));
});

export const DELETE = withApi<Params>(async (request, { requestId, params }) => {
  const db = getDb();
  const actor = await requirePrincipal(request, db);

  await deleteDraft(db, params.id, { requestId, actor });

  return json({ ok: true });
});
