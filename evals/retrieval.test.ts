import { beforeAll, describe, expect, it } from "vitest";
import { buildEvalWorld, runRetrievalEval, type EvalWorld } from "@/lib/evals/harness";
import { buildReport } from "@/lib/evals/report";
import { defaultMinScore, hashEmbedder } from "@/lib/server/embeddings";
import { evalCases } from "./cases";

/**
 * Regression gate for the retrieval benchmark, run in CI with the offline
 * embedder (no API key needed).
 *
 * It guards the logic that does not depend on embedding quality: metadata
 * eligibility, superseded-document filtering, department isolation, and the
 * similarity floor. Embedding quality itself is measured by
 * `npm run evals -- --embedder openai`, not here.
 */
describe("retrieval benchmark (offline embedder)", () => {
  let world: EvalWorld;

  beforeAll(async () => {
    world = await buildEvalWorld(hashEmbedder);
  });

  async function run() {
    const results = await runRetrievalEval(world, evalCases, {
      topK: 6,
      minScore: defaultMinScore(hashEmbedder),
    });

    return buildReport({
      meta: {
        generatedAt: new Date().toISOString(),
        mode: "retrieval",
        embedder: hashEmbedder.model,
        generationModel: null,
        judgeModel: null,
        promptVersion: null,
        topK: 6,
        minScore: defaultMinScore(hashEmbedder),
        gitSha: null,
        corpus: world.corpus,
      },
      cases: evalCases,
      retrieval: results,
    });
  }

  it("never retrieves a superseded or wrong-department document", async () => {
    const report = await run();
    const leaks = report.cases.filter((c) => c.retrieval.forbiddenHits.length > 0);

    expect(leaks.map((c) => `${c.id}: ${c.retrieval.forbiddenHits}`)).toEqual([]);
  });

  it("retrieves nothing for off-topic cases", async () => {
    const report = await run();

    expect(report.summary.retrieval.abstention).toMatchObject({
      numerator: 2,
      denominator: 2,
    });
  });

  it("finds a gold section for at least 85% of cases (lexical embedder floor)", async () => {
    const report = await run();
    const hit = report.summary.retrieval.goldHitRate;

    // Measured at the time of writing: 19 of 21. The semantic embedder
    // reaches 21 of 21; the gap is the paraphrased cases a lexical matcher
    // cannot be expected to solve.
    expect(hit.rate).toBeGreaterThanOrEqual(0.85);
  });

  it("covers every category the benchmark claims to test", async () => {
    const report = await run();

    expect(report.byCategory.every((entry) => entry.cases > 0)).toBe(true);
    expect(report.summary.cases).toBe(evalCases.length);
  });

  it("keeps every gold section pointing at a real section of the corpus", async () => {
    const { db, slugById } = world;
    const { schema } = await import("@/lib/server/db");
    const rows = await db
      .select({
        documentId: schema.knowledgeChunks.documentId,
        sectionRef: schema.knowledgeChunks.sectionRef,
      })
      .from(schema.knowledgeChunks);
    const existing = new Set(
      rows.map((row) => `${slugById.get(row.documentId)}|${row.sectionRef}`),
    );
    const missing = evalCases
      .flatMap((c) => c.expect.gold)
      .filter((g) => !existing.has(`${g.slug}|${g.sectionRef}`));

    expect(missing).toEqual([]);
  });
});
