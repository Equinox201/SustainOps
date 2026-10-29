import { knowledgeDraftSchema } from "@/lib/schemas/knowledge";
import { json, parseBody, withApi } from "@/lib/server/api";
import { getDb } from "@/lib/server/db";
import { previewDraft } from "@/lib/server/knowledge-admin";
import { requirePrincipal } from "@/lib/server/session";

/** How a draft would be split into citeable sections. Stores nothing. */
export const POST = withApi(async (request) => {
  const db = getDb();
  const actor = await requirePrincipal(request, db);
  const input = await parseBody(request, knowledgeDraftSchema);

  return json(await previewDraft(db, input, actor));
});
