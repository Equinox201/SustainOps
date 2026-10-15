import { count, eq } from "drizzle-orm";
import { PROMPT_VERSION } from "@/lib/prompts";
import { json, withApi } from "@/lib/server/api";
import { getDb, schema } from "@/lib/server/db";

/**
 * Liveness plus a cheap dependency check. Reveals no configuration values and
 * no data beyond counts, so it is safe to leave public.
 */
export const GET = withApi(async () => {
  try {
    const db = getDb();
    const [documents] = await db
      .select({ value: count() })
      .from(schema.knowledgeDocuments)
      .where(eq(schema.knowledgeDocuments.status, "approved"));
    const [sections] = await db
      .select({ value: count() })
      .from(schema.knowledgeChunks);

    return json({
      status: "ok",
      database: "ok",
      knowledge: {
        approvedDocuments: documents.value,
        sections: sections.value,
      },
      promptVersion: PROMPT_VERSION,
    });
  } catch {
    return json({ status: "degraded", database: "unavailable" }, 503);
  }
});
