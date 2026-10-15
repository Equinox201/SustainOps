import fs from "node:fs";
import path from "node:path";
import { count, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { demoActionPlans } from "@/lib/demo-plans";
import { parseKnowledgeDocument } from "@/lib/knowledge/parse";
import type { Principal } from "@/features/action-plans/domain/permissions";
import type { Database } from "./db";
import { schema } from "./db";
import { hashEmbedder } from "./embeddings";
import type { ServerEnv } from "./env";
import { generateActionPlan, type ModelCaller } from "./generation";
import { ingestDocuments } from "./knowledge";
import { createTestDb } from "./test-db";

const MAYA: Principal = {
  id: "usr_maya_chen",
  name: "Maya Chen",
  role: "sustainability_manager",
  department: null,
};

const env: ServerEnv = {
  OPENAI_API_KEY: "test-key",
  OPENAI_BASE_URL: undefined,
  EMBEDDINGS_PROVIDER: "hash",
  EMBEDDINGS_MODEL: "text-embedding-3-small",
  RETRIEVAL_TOP_K: 6,
  RETRIEVAL_MIN_SCORE: undefined,
  OPENAI_MODEL: "test-model",
  OPENAI_MAX_OUTPUT_TOKENS: 8000,
  OPENAI_REASONING_EFFORT: undefined,
  OPENAI_TIMEOUT_MS: 1000,
  DATABASE_URL: undefined,
  DATABASE_POOL_MAX: 5,
  SESSION_SECRET: undefined,
  GENERATION_LIMIT_PER_HOUR: 2,
  GENERATION_IP_LIMIT_PER_HOUR: 5,
  CRON_SECRET: undefined,
  GENERATION_DAILY_CAP: 100,
  RATE_LIMIT_SALT: "salt",
};

// The fixture plan as a model would return it (no sources/grounding).
const {
  sources: _sources,
  grounding: _grounding,
  ...basePlan
} = demoActionPlans[0].actionPlan!;
void _sources;
void _grounding;

function modelOutput(sourceIdsPerAction: string[][], confidence = "High") {
  return JSON.stringify({
    ...basePlan,
    confidenceLevel: confidence,
    recommendedOperationalActions: sourceIdsPerAction.map((sourceIds, index) => ({
      action: `Action ${index + 1}`,
      sourceIds,
    })),
  });
}

const reply =
  (text: string): ModelCaller =>
  async () => ({ text, inputTokens: 120, outputTokens: 480 });

// A case the energy SOP covers (department Engineering).
const energyCase = demoActionPlans[0].sustainabilityCase;

let db: Database;

beforeAll(async () => {
  db = await createTestDb();
  const directory = path.join(process.cwd(), "knowledge");
  const documents = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".md") && file !== "README.md")
    .map((file) =>
      parseKnowledgeDocument(fs.readFileSync(path.join(directory, file), "utf8"), file),
    );
  await ingestDocuments(db, documents, hashEmbedder);
});

beforeEach(async () => {
  await db.execute(sql`truncate ai_generations, audit_events cascade`);
});

function run(
  callModel: ModelCaller,
  overrides: Partial<ServerEnv> = {},
  input = energyCase,
  clientKey = "client-1",
) {
  return generateActionPlan({
    db,
    env: { ...env, ...overrides },
    input,
    planId: null,
    actor: MAYA,
    clientKey,
    requestId: "req-1",
    getEmbedder: () => hashEmbedder,
    callModel,
  });
}

describe("grounded generation", () => {
  it("retrieves approved sources and shows them to the model", async () => {
    let prompt = "";
    const capture: ModelCaller = async (args) => {
      prompt = args.input;
      return { text: modelOutput([["S1"], ["S1"], ["S1"]]), inputTokens: 1, outputTokens: 1 };
    };

    await run(capture);

    expect(prompt).toContain("Approved company sources");
    expect(prompt).toContain("[S1] Energy and HVAC Operations SOP");
    expect(prompt).toMatch(/occupancy is below 45 percent/);
    expect(prompt).not.toMatch(/Food Waste Measurement/);
  });

  it("stores cited sources and marks a fully cited plan grounded", async () => {
    const result = await run(reply(modelOutput([["S1"], ["S1"], ["S1"]])));
    const plan = result.actionPlan;

    expect(plan.grounding.status).toBe("grounded");
    expect(plan.grounding.retrievedCount).toBeGreaterThan(0);
    expect(plan.sources[0]).toMatchObject({
      id: "S1",
      documentTitle: "Energy and HVAC Operations SOP",
    });
    expect(plan.confidenceLevel).toBe("High");

    const [row] = await db.select().from(schema.aiGenerations);
    expect(row).toMatchObject({
      status: "succeeded",
      groundingStatus: "grounded",
      citationsDropped: 0,
      userId: MAYA.id,
    });
    expect((row.sources as unknown[]).length).toBe(plan.sources.length);
  });

  it("drops citations to sources it was never given", async () => {
    const result = await run(reply(modelOutput([["S1", "S99"], ["S42"], ["S1"]])));

    expect(result.actionPlan.recommendedOperationalActions).toEqual([
      { action: "Action 1", sourceIds: ["S1"] },
      { action: "Action 2", sourceIds: [] },
      { action: "Action 3", sourceIds: ["S1"] },
    ]);
    expect(result.actionPlan.grounding.status).toBe("partial");

    const [row] = await db.select().from(schema.aiGenerations);
    expect(row.citationsDropped).toBe(2);
  });

  it("caps confidence at Medium when only some actions are grounded", async () => {
    const result = await run(reply(modelOutput([["S1"], [], []], "High")));

    expect(result.actionPlan.grounding.status).toBe("partial");
    expect(result.actionPlan.confidenceLevel).toBe("Medium");
  });

  it("forces Low confidence when the model claims High without valid evidence", async () => {
    const result = await run(reply(modelOutput([["S77"], ["S88"], []], "High")));

    expect(result.actionPlan.grounding.status).toBe("ungrounded");
    expect(result.actionPlan.confidenceLevel).toBe("Low");
  });

  it("generates an ungrounded plan, and says so, when nothing matches", async () => {
    let prompt = "";
    const capture: ModelCaller = async (args) => {
      prompt = args.input;
      return { text: modelOutput([[], []], "High"), inputTokens: 1, outputTokens: 1 };
    };

    const result = await run(capture, {}, {
      property: "Harbour House Singapore",
      department: "Sales & Marketing",
      issue: "Quantum chess tournament scheduling",
      currentMetric: "Seventeen grandmasters",
      targetMetric: "Zero overlapping rounds",
      operationalContext: "Venue acoustics and trophy engraving.",
    });

    expect(prompt).toContain("No approved company sources matched this case");
    expect(result.actionPlan.sources).toEqual([]);
    expect(result.actionPlan.grounding).toEqual({
      status: "ungrounded",
      retrievedCount: 0,
    });
    expect(result.actionPlan.confidenceLevel).toBe("Low");
  });

  it("degrades to an ungrounded plan when retrieval cannot run", async () => {
    const result = await generateActionPlan({
      db,
      env,
      input: energyCase,
      planId: null,
      actor: MAYA,
      clientKey: "client-1",
      requestId: "req-1",
      getEmbedder: () => {
        throw new Error("embeddings unavailable");
      },
      callModel: reply(modelOutput([["S1"], ["S1"]], "High")),
    });

    expect(result.actionPlan.grounding.status).toBe("ungrounded");
    expect(result.actionPlan.sources).toEqual([]);
    expect(result.actionPlan.confidenceLevel).toBe("Low");
  });

  it("records the prompt version and model for provenance", async () => {
    const result = await run(reply(modelOutput([["S1"], ["S1"], ["S1"]])));

    expect(result.generation).toMatchObject({
      model: "test-model",
      promptVersion: "action-plan-v3-grounded",
    });
  });
});

describe("generation safety", () => {
  it("tolerates a markdown-fenced JSON reply", async () => {
    const fenced = "```json\n" + modelOutput([["S1"], ["S1"], ["S1"]]) + "\n```";

    await expect(run(reply(fenced))).resolves.toBeTruthy();
  });

  it("turns malformed output into a safe 502 and marks the attempt failed", async () => {
    const malformed = JSON.stringify({
      ...JSON.parse(modelOutput([["S1"]])),
      humanReviewRequired: false,
    });

    await expect(run(reply(malformed))).rejects.toMatchObject({
      status: 502,
      code: "ai_invalid_output",
    });

    const [row] = await db.select().from(schema.aiGenerations);
    expect(row).toMatchObject({ status: "failed", errorCode: "ai_invalid_output" });
  });

  it("reports a persistently truncated response distinctly, with usage recorded", async () => {
    let calls = 0;
    const truncated: ModelCaller = async () => {
      calls += 1;

      return {
        text: '{"situationSummary": "cut off mid-',
        inputTokens: 100,
        outputTokens: 2400,
        incompleteReason: "max_output_tokens",
      };
    };

    await expect(run(truncated)).rejects.toMatchObject({
      status: 502,
      code: "ai_truncated",
    });

    expect(calls).toBe(2); // one retry, then give up
    const [row] = await db.select().from(schema.aiGenerations);
    expect(row).toMatchObject({
      status: "failed",
      errorCode: "ai_truncated",
      outputTokens: 2400,
    });
  });

  it("recovers when a one-off unreadable response is followed by a good one", async () => {
    let calls = 0;
    const flaky: ModelCaller = async () => {
      calls += 1;

      return calls === 1
        ? { text: "not json at all", inputTokens: 90, outputTokens: 10 }
        : { text: modelOutput([["S1"], ["S1"], ["S1"]]), inputTokens: 100, outputTokens: 500 };
    };

    const result = await run(flaky);

    expect(calls).toBe(2);
    expect(result.actionPlan.grounding.status).toBe("grounded");

    // Still one generation record, and it reflects the successful attempt.
    const rows = await db.select().from(schema.aiGenerations);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "succeeded", outputTokens: 500 });
  });

  it("does not retry provider failures", async () => {
    let calls = 0;
    const down: ModelCaller = async () => {
      calls += 1;
      throw new Error("provider down");
    };

    await expect(run(down)).rejects.toMatchObject({ code: "ai_unavailable" });
    expect(calls).toBe(1);
  });

  it("rejects output that smuggles in server-owned fields", async () => {
    const forged = JSON.stringify({
      ...JSON.parse(modelOutput([["S1"]])),
      grounding: { status: "grounded", retrievedCount: 99 },
      sources: [],
    });

    await expect(run(reply(forged))).rejects.toMatchObject({
      status: 502,
      code: "ai_invalid_output",
    });
  });

  it("does not leak provider errors to the caller", async () => {
    const exploding: ModelCaller = async () => {
      throw new Error("secret upstream detail sk-123");
    };

    await expect(run(exploding)).rejects.toMatchObject({
      status: 502,
      code: "ai_unavailable",
      message: expect.not.stringContaining("sk-123"),
    });
  });

  it("applies the per-persona hourly limit across visitors", async () => {
    const model = reply(modelOutput([["S1"]]));
    // Different addresses, same shared persona: the persona cap still bites.
    await run(model, {}, energyCase, "visitor-a");
    await run(model, {}, energyCase, "visitor-b");

    await expect(
      run(model, {}, energyCase, "visitor-c"),
    ).rejects.toMatchObject({ status: 429, code: "rate_limited" });

    const [{ value }] = await db.select({ value: count() }).from(schema.aiGenerations);
    expect(value).toBe(2);
  });

  it("applies the per-address hourly limit across personas", async () => {
    const model = reply(modelOutput([["S1"]]));
    const other: Principal = { ...MAYA, id: "usr_daniel_ortiz" };
    const asPersona = (actor: Principal) =>
      generateActionPlan({
        db,
        env: { ...env, GENERATION_IP_LIMIT_PER_HOUR: 2, GENERATION_LIMIT_PER_HOUR: 50 },
        input: energyCase,
        planId: null,
        actor,
        clientKey: "same-address",
        requestId: "req-1",
        getEmbedder: () => hashEmbedder,
        callModel: model,
      });

    await asPersona(MAYA);
    await asPersona(other);

    // A third persona from the same address is still refused.
    await expect(
      asPersona({ ...MAYA, id: "usr_priya_nair" }),
    ).rejects.toMatchObject({ status: 429, code: "rate_limited" });
  });

  it("applies the global daily cap", async () => {
    const model = reply(modelOutput([["S1"]]));
    await run(model, { GENERATION_DAILY_CAP: 1 });

    await expect(
      run(model, { GENERATION_DAILY_CAP: 1 }, energyCase, "different-client"),
    ).rejects.toMatchObject({ status: 429, code: "daily_cap_reached" });
  });

  it("refuses to run without an API key", async () => {
    await expect(
      run(reply(modelOutput([["S1"]])), { OPENAI_API_KEY: undefined }),
    ).rejects.toMatchObject({ status: 503, code: "ai_not_configured" });
  });
});
