import { json, withApi } from "@/lib/server/api";
import { getDb } from "@/lib/server/db";
import { listKnowledgeDocuments } from "@/lib/server/knowledge";
import { requirePrincipal } from "@/lib/server/session";

/** The knowledge base catalogue: which documents ground the plans. */
export const GET = withApi(async (request) => {
  const db = getDb();
  await requirePrincipal(request, db);

  return json({ documents: await listKnowledgeDocuments(db) });
});
