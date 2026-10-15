import { count, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { demoActionPlans } from "@/lib/demo-plans";
import type { Principal } from "@/features/action-plans/domain/permissions";
import type { Database } from "./db";
import { schema } from "./db";
import type { ServerEnv } from "./env";
import { generateActionPlan, type ModelCaller } from "./generation";
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
  OPENAI_MODEL: "test-model",
  OPENAI_TIMEOUT_MS: 1000,
  DATABASE_URL: undefined,
  DATABASE_POOL_MAX: 5,
  SESSION_SECRET: undefined,
  GENERATION_LIMIT_PER_HOUR: 2,
  GENERATION_DAILY_CAP: 100,
  RATE_LIMIT_SALT: "salt",
};

const validPlan = demoActionPlans[0].actionPlan;
const okModel: ModelCaller = async () => ({
  text: JSON.stringify(validPlan),
  inputTokens: 120,
  outputTokens: 480,
});

let db: Database;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.execute(sql`truncate ai_generations, audit_events cascade`);
});

function run(callModel: ModelCaller, overrides: Partial<ServerEnv> = {}) {
  return generateActionPlan({
    db,
    env: { ...env, ...overrides },
    input: demoActionPlans[0].sustainabilityCase,
    planId: null,
    actor: MAYA,
    clientKey: "client-1",
    requestId: "req-1",
    callModel,
  });
}

describe("generateActionPlan", () => {
  it("returns a validated plan and records the generation", async () => {
    const result = await run(okModel);

    expect(result.actionPlan.humanReviewRequired).toBe(true);
    expect(result.generation).toMatchObject({
      model: "test-model",
      promptVersion: expect.stringMatching(/^action-plan-v/),
    });

    const [row] = await db.select().from(schema.aiGenerations);
    expect(row).toMatchObject({
      status: "succeeded",
      userId: MAYA.id,
      inputTokens: 120,
      outputTokens: 480,
    });
  });

  it("tolerates a markdown-fenced JSON reply", async () => {
    const fenced: ModelCaller = async () => ({
      text: "```json\n" + JSON.stringify(validPlan) + "\n```",
      inputTokens: null,
      outputTokens: null,
    });

    await expect(run(fenced)).resolves.toBeTruthy();
  });

  it("turns malformed output into a safe 502 and marks the attempt failed", async () => {
    const malformed: ModelCaller = async () => ({
      text: JSON.stringify({ ...validPlan, humanReviewRequired: false }),
      inputTokens: null,
      outputTokens: null,
    });

    await expect(run(malformed)).rejects.toMatchObject({
      status: 502,
      code: "ai_invalid_output",
    });

    const [row] = await db.select().from(schema.aiGenerations);
    expect(row).toMatchObject({ status: "failed", errorCode: "ai_invalid_output" });
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

  it("applies the per-user hourly limit", async () => {
    await run(okModel);
    await run(okModel);

    await expect(run(okModel)).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
    });

    const [{ value }] = await db.select({ value: count() }).from(schema.aiGenerations);
    expect(value).toBe(2);
  });

  it("applies the global daily cap", async () => {
    await expect(
      run(okModel, { GENERATION_DAILY_CAP: 1 }).then(() =>
        generateActionPlan({
          db,
          env: { ...env, GENERATION_DAILY_CAP: 1 },
          input: demoActionPlans[0].sustainabilityCase,
          planId: null,
          actor: MAYA,
          clientKey: "different-client",
          requestId: "req-2",
          callModel: okModel,
        }),
      ),
    ).rejects.toMatchObject({ status: 429, code: "daily_cap_reached" });
  });

  it("refuses to run without an API key", async () => {
    await expect(
      run(okModel, { OPENAI_API_KEY: undefined }),
    ).rejects.toMatchObject({ status: 503, code: "ai_not_configured" });
  });
});
