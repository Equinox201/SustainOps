import { knowledgeDraftSchema } from "@/lib/schemas/knowledge";
import { json, parseBody, withApi } from "@/lib/server/api";
import { getDb } from "@/lib/server/db";
import { getEnv } from "@/lib/server/env";
import { listKnowledge, saveDraft } from "@/lib/server/knowledge-admin";
import { requirePrincipal } from "@/lib/server/session";

/** The knowledge base: every document and where it stands. */
export const GET = withApi(async (request) => {
  const db = getDb();
  await requirePrincipal(request, db);

  return json({ documents: await listKnowledge(db) });
});

/** Saves a draft document (managers). Nothing is retrievable until published. */
export const POST = withApi(async (request, { requestId }) => {
  const db = getDb();
  const actor = await requirePrincipal(request, db);
  const input = await parseBody(request, knowledgeDraftSchema);
  const detail = await saveDraft(
    db,
    input,
    { requestId, actor },
    { userDocumentCap: getEnv().KNOWLEDGE_USER_DOC_CAP },
  );

  return json(detail, 201);
});
