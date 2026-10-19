import { json, withApi } from "@/lib/server/api";
import { getDb } from "@/lib/server/db";
import { getEmbedder } from "@/lib/server/embeddings";
import { getEnv } from "@/lib/server/env";
import { publishDocument } from "@/lib/server/knowledge-admin";
import { requirePrincipal } from "@/lib/server/session";

type Params = { id: string };

// Embedding a document's sections takes a few seconds.
export const maxDuration = 60;

/** Embeds a draft's sections and makes it the approved version (reviewers). */
export const POST = withApi<Params>(async (request, { requestId, params }) => {
  const db = getDb();
  const actor = await requirePrincipal(request, db);
  const env = getEnv();

  return json(
    await publishDocument(
      db,
      params.id,
      { requestId, actor },
      {
        embedder: getEmbedder(env),
        dailyCap: env.KNOWLEDGE_PUBLISH_DAILY_CAP,
      },
    ),
  );
});
