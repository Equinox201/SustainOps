import { and, eq, inArray } from "drizzle-orm";
import { demoActionPlans, demoCitations, demoClaims } from "@/lib/demo-plans";
import { checkQuote, type DowngradeReason } from "@/lib/provenance";
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

  const byKey = new Map(
    rows.map((row) => [`${row.slug}|${row.sectionRef}`, row]),
  );

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

        const claim = demoClaims[plan.id]?.[index] ?? null;
        const first = sourceIds[0]
          ? [...aliasByKey.values()].find((s) => s.id === sourceIds[0])
          : undefined;
        let claimType: "policy_requirement" | "proposal" | "assumption" =
          claim?.claim === "assumption" ? "assumption" : "proposal";
        let evidence: { sourceId: string; quote: string } | null = null;
        let downgradeReason: DowngradeReason | null = null;

        if (claim?.claim === "policy_requirement") {
          // The same check a real generation goes through.
          const check =
            first && claim.quote
              ? checkQuote(claim.quote, first.excerpt)
              : ({ ok: false, reason: "no_quote" } as const);

          if (check.ok && first) {
            claimType = "policy_requirement";
            evidence = {
              sourceId: first.id,
              quote: first.excerpt.slice(check.start, check.end),
            };
          } else if (!check.ok) {
            downgradeReason = check.reason;
          }
        }

        return { ...item, sourceIds, claimType, evidence, downgradeReason };
      },
    );

    const sources = [...aliasByKey.values()];
    const cited = actions.filter((item) => item.sourceIds.length > 0).length;

    const actionPlan = {
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
    };

    return { ...plan, actionPlan, originalAiOutput: actionPlan };
  });
}
