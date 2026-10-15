import { and, eq, inArray } from "drizzle-orm";
import { demoActionPlans, demoCitations } from "@/lib/demo-plans";
import type { SourceRef, StoredActionPlan } from "@/lib/types";
import { schema, type Database } from "./db";

const { knowledgeChunks, knowledgeDocuments } = schema;

/**
 * The fictional demo plans, with each action tied to the corpus section that
 * supports it. Sources are looked up in the ingested knowledge base, so a
 * demo plan cites exactly what a generated plan would. If the knowledge base
 * has not been ingested, the plans fall back to ungrounded.
 */
export async function buildGroundedDemoPlans(
  db: Database,
): Promise<StoredActionPlan[]> {
  const slugs = [
    ...new Set(
      Object.values(demoCitations)
        .flat(2)
        .map((citation) => citation.slug),
    ),
  ];

  const rows = slugs.length
    ? await db
        .select({
          chunkId: knowledgeChunks.id,
          documentId: knowledgeDocuments.id,
          slug: knowledgeDocuments.slug,
          documentTitle: knowledgeDocuments.title,
          documentVersion: knowledgeDocuments.version,
          documentType: knowledgeDocuments.documentType,
          department: knowledgeDocuments.department,
          sectionRef: knowledgeChunks.sectionRef,
          heading: knowledgeChunks.heading,
          content: knowledgeChunks.content,
        })
        .from(knowledgeChunks)
        .innerJoin(
          knowledgeDocuments,
          eq(knowledgeDocuments.id, knowledgeChunks.documentId),
        )
        .where(
          and(
            eq(knowledgeDocuments.status, "approved"),
            inArray(knowledgeDocuments.slug, slugs),
          ),
        )
    : [];

  const byKey = new Map(rows.map((row) => [`${row.slug}|${row.sectionRef}`, row]));

  return demoActionPlans.map((plan) => {
    const citations = demoCitations[plan.id];

    if (!plan.actionPlan || !citations) {
      return plan;
    }

    const aliasByKey = new Map<string, SourceRef>();
    const actions = plan.actionPlan.recommendedOperationalActions.map(
      (item, index) => {
        const sourceIds: string[] = [];

        for (const citation of citations[index] ?? []) {
          const key = `${citation.slug}|${citation.sectionRef}`;
          const row = byKey.get(key);

          if (!row) {
            continue;
          }

          let source = aliasByKey.get(key);

          if (!source) {
            source = {
              id: `S${aliasByKey.size + 1}`,
              chunkId: row.chunkId,
              documentId: row.documentId,
              documentTitle: row.documentTitle,
              documentVersion: row.documentVersion,
              documentType: row.documentType,
              department: row.department,
              sectionRef: row.sectionRef,
              heading: row.heading,
              excerpt: row.content.slice(0, 1200),
              score: 1, // curated for the demo rather than retrieved
            };
            aliasByKey.set(key, source);
          }

          sourceIds.push(source.id);
        }

        return { action: item.action, sourceIds };
      },
    );

    const sources = [...aliasByKey.values()];
    const cited = actions.filter((item) => item.sourceIds.length > 0).length;

    return {
      ...plan,
      actionPlan: {
        ...plan.actionPlan,
        recommendedOperationalActions: actions,
        sources,
        grounding: {
          status:
            cited === 0
              ? ("ungrounded" as const)
              : cited === actions.length
                ? ("grounded" as const)
                : ("partial" as const),
          retrievedCount: sources.length,
        },
      },
    };
  });
}
