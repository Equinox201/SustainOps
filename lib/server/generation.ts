import { createHash } from "node:crypto";
import OpenAI from "openai";
import { and, count, eq, gte } from "drizzle-orm";
import type {
  AIActionPlan,
  ModelActionPlan,
  SourceRef,
  SustainabilityCaseInput,
} from "@/lib/types";
import {
  aiActionPlanSchema,
  modelActionPlanSchema,
} from "@/lib/schemas/action-plan";
import { actionPlanJsonSchema } from "@/lib/schemas/openai";
import {
  PROMPT_VERSION,
  SUSTAINABILITY_SYSTEM_PROMPT,
  buildSustainabilityActionPlanPrompt,
} from "@/lib/prompts";
import type { Principal } from "@/features/action-plans/domain/permissions";
import { ApiError } from "./api";
import { schema, type Database } from "./db";
import { defaultMinScore, type Embedder } from "./embeddings";
import type { ServerEnv } from "./env";
import { retrieveSources } from "./knowledge";

const { aiGenerations, auditEvents } = schema;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type ModelCall = {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Set when the model stopped early, e.g. "max_output_tokens". */
  incompleteReason?: string | null;
};

export type ModelCaller = (args: {
  apiKey: string;
  baseURL?: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
  instructions: string;
  input: string;
}) => Promise<ModelCall>;

/** The real OpenAI call. Swapped for a fake in tests. */
export const callOpenAI: ModelCaller = async ({
  apiKey,
  baseURL,
  model,
  timeoutMs,
  maxOutputTokens,
  reasoningEffort,
  instructions,
  input,
}) => {
  const client = new OpenAI({
    apiKey,
    baseURL,
    timeout: timeoutMs,
    maxRetries: 1,
  });

  const response = await client.responses.create({
    model,
    instructions,
    input,
    // Reasoning models spend this budget on thinking as well as the answer.
    max_output_tokens: maxOutputTokens,
    ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
    store: false,
    text: {
      format: {
        type: "json_schema",
        name: "sustainability_action_plan",
        strict: true,
        schema: actionPlanJsonSchema,
      },
    },
  });

  return {
    text: response.output_text,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
    incompleteReason:
      response.status === "incomplete"
        ? (response.incomplete_details?.reason ?? "incomplete")
        : null,
  };
};

/** Rate limits are per signed-in user; the key is salted and hashed. */
export function getClientKey(actor: Principal, salt: string) {
  return createHash("sha256")
    .update(`${salt}:${actor.id}`)
    .digest("hex")
    .slice(0, 32);
}

function stripJsonFence(text: string) {
  const match = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : text;
}

function parseModelOutput(call: ModelCall): ModelActionPlan {
  const { text } = call;

  if (call.incompleteReason) {
    throw new ApiError(
      502,
      "ai_truncated",
      "The AI response was cut off before it finished. Please try again.",
      undefined,
      undefined,
      {
        incompleteReason: call.incompleteReason,
        outputTokens: call.outputTokens,
      },
    );
  }

  let raw: unknown;

  try {
    raw = JSON.parse(stripJsonFence(text));
  } catch {
    throw new ApiError(
      502,
      "ai_invalid_output",
      "The AI response could not be read. Please try again.",
      undefined,
      undefined,
      { reason: "invalid_json", length: text.length, outputTokens: call.outputTokens },
    );
  }

  const result = modelActionPlanSchema.safeParse(raw);

  if (!result.success) {
    // Field paths and rule names only: enough to debug, never model content.
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      code: issue.code,
      ...("maximum" in issue ? { maximum: issue.maximum } : {}),
      ...("minimum" in issue ? { minimum: issue.minimum } : {}),
    }));

    throw new ApiError(
      502,
      "ai_invalid_output",
      "The AI response did not match the expected format. Please try again.",
      undefined,
      undefined,
      { issues },
    );
  }

  return result.data;
}

const CONFIDENCE_ORDER = ["Low", "Medium", "High"] as const;

/**
 * Turns the model's output into the stored plan.
 *
 * The model's citations are untrusted: any id that was not actually
 * retrieved is dropped, and the plan's grounding and confidence are decided
 * here from what survives, never from what the model claims.
 */
export function finalizePlan(
  model: ModelActionPlan,
  sources: SourceRef[],
): { plan: AIActionPlan; citationsDropped: number } {
  const known = new Set(sources.map((source) => source.id));
  let citationsDropped = 0;

  const actions = model.recommendedOperationalActions.map((item) => {
    const valid = [...new Set(item.sourceIds)].filter((id) => known.has(id));
    citationsDropped += item.sourceIds.length - valid.length;

    return { action: item.action, sourceIds: valid };
  });

  const cited = actions.filter((item) => item.sourceIds.length > 0).length;
  const status =
    sources.length === 0 || cited === 0
      ? "ungrounded"
      : cited === actions.length
        ? "grounded"
        : "partial";

  const ceiling =
    status === "ungrounded" ? "Low" : status === "partial" ? "Medium" : "High";
  const confidenceLevel =
    CONFIDENCE_ORDER[
      Math.min(
        CONFIDENCE_ORDER.indexOf(model.confidenceLevel),
        CONFIDENCE_ORDER.indexOf(ceiling),
      )
    ];

  return {
    plan: aiActionPlanSchema.parse({
      ...model,
      recommendedOperationalActions: actions,
      confidenceLevel,
      sources,
      grounding: { status, retrievedCount: sources.length },
    }),
    citationsDropped,
  };
}

function classifyModelError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  const name = error instanceof Error ? error.constructor.name : "";

  if (name === "APIConnectionTimeoutError") {
    return new ApiError(
      504,
      "ai_timeout",
      "The AI service took too long to respond. Please try again.",
    );
  }

  return new ApiError(
    502,
    "ai_unavailable",
    "The AI service is unavailable right now. Please try again.",
  );
}

async function enforceLimits(
  db: Database,
  env: ServerEnv,
  clientKey: string,
) {
  const now = Date.now();

  const [perClient] = await db
    .select({ value: count() })
    .from(aiGenerations)
    .where(
      and(
        eq(aiGenerations.clientKey, clientKey),
        gte(aiGenerations.createdAt, new Date(now - HOUR_MS)),
      ),
    );

  if (perClient.value >= env.GENERATION_LIMIT_PER_HOUR) {
    throw new ApiError(
      429,
      "rate_limited",
      "Generation limit reached. Please try again later.",
      undefined,
      { "retry-after": "3600" },
    );
  }

  const [global] = await db
    .select({ value: count() })
    .from(aiGenerations)
    .where(gte(aiGenerations.createdAt, new Date(now - DAY_MS)));

  if (global.value >= env.GENERATION_DAILY_CAP) {
    throw new ApiError(
      429,
      "daily_cap_reached",
      "The demo's daily generation capacity has been reached. Please try again tomorrow.",
      undefined,
      { "retry-after": "86400" },
    );
  }
}

export type GenerationResult = {
  actionPlan: AIActionPlan;
  generation: {
    id: string;
    model: string;
    promptVersion: string;
    generatedAt: string;
    latencyMs: number;
    /** Model calls made: 2 means the first reply was unreadable. */
    attempts: number;
    /** Citations the model produced that were not in the retrieved set. */
    citationsDropped: number;
    inputTokens: number | null;
    outputTokens: number | null;
  };
};

/**
 * Generates an action plan: enforces rate limits, records the attempt,
 * calls the model with a timeout, validates the output, and stores metadata.
 */
export async function generateActionPlan({
  db,
  env,
  input,
  planId,
  actor,
  clientKey,
  requestId,
  getEmbedder,
  callModel = callOpenAI,
}: {
  db: Database;
  env: ServerEnv;
  input: SustainabilityCaseInput;
  planId: string | null;
  actor: Principal;
  clientKey: string;
  requestId: string;
  /** Created lazily, so a retrieval misconfiguration degrades gracefully. */
  getEmbedder: () => Embedder;
  callModel?: ModelCaller;
}): Promise<GenerationResult> {
  if (!env.OPENAI_API_KEY) {
    throw new ApiError(
      503,
      "ai_not_configured",
      "AI generation is not configured. Set OPENAI_API_KEY.",
    );
  }

  await enforceLimits(db, env, clientKey);

  const [record] = await db
    .insert(aiGenerations)
    .values({
      requestId,
      clientKey,
      planId,
      userId: actor.id,
      model: env.OPENAI_MODEL,
      promptVersion: PROMPT_VERSION,
    })
    .returning();

  const startedAt = Date.now();
  // Hoisted so token usage is recorded for failed attempts too.
  let usage: Pick<ModelCall, "inputTokens" | "outputTokens"> | null = null;

  try {
    // Retrieval failure degrades to an ungrounded plan (clearly labelled)
    // rather than blocking generation outright.
    let sources: SourceRef[] = [];

    try {
      const embedder = getEmbedder();
      const retrieved = await retrieveSources(db, input, {
        embedder,
        topK: env.RETRIEVAL_TOP_K,
        minScore: env.RETRIEVAL_MIN_SCORE ?? defaultMinScore(embedder),
      });
      sources = retrieved.sources;
    } catch (error) {
      console.warn("retrieval failed; continuing ungrounded", {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const prompt = buildSustainabilityActionPlanPrompt(input, sources);
    let attempt = 0;
    let result: { plan: AIActionPlan; citationsDropped: number } | null = null;

    // Model output is non-deterministic. One retry on unreadable output
    // (bad JSON, truncation, schema mismatch) removes most one-off failures;
    // provider errors and timeouts are not retried here.
    while (!result) {
      attempt += 1;

      const modelCall = await callModel({
        apiKey: env.OPENAI_API_KEY,
        baseURL: env.OPENAI_BASE_URL,
        model: env.OPENAI_MODEL,
        timeoutMs: env.OPENAI_TIMEOUT_MS,
        maxOutputTokens: env.OPENAI_MAX_OUTPUT_TOKENS,
        reasoningEffort: env.OPENAI_REASONING_EFFORT,
        instructions: SUSTAINABILITY_SYSTEM_PROMPT,
        input: prompt,
      });
      usage = {
        inputTokens: modelCall.inputTokens,
        outputTokens: modelCall.outputTokens,
      };

      try {
        result = finalizePlan(parseModelOutput(modelCall), sources);
      } catch (error) {
        const retryable =
          error instanceof ApiError &&
          (error.code === "ai_invalid_output" || error.code === "ai_truncated");

        if (!retryable || attempt >= 2) {
          throw error;
        }

        console.warn("unreadable model output; retrying once", {
          requestId,
          code: (error as ApiError).code,
          diagnostics: (error as ApiError).diagnostics,
        });
      }
    }

    const { plan: actionPlan, citationsDropped } = result;
    const modelCall = usage;
    const latencyMs = Date.now() - startedAt;

    await db
      .update(aiGenerations)
      .set({
        status: "succeeded",
        latencyMs,
        inputTokens: modelCall?.inputTokens ?? null,
        outputTokens: modelCall?.outputTokens ?? null,
        sources,
        groundingStatus: actionPlan.grounding.status,
        citationsDropped,
      })
      .where(eq(aiGenerations.id, record.id));
    await db.insert(auditEvents).values({
      eventType: "action_plan_generated",
      planId,
      department: input.department,
      actorUserId: actor.id,
      actorRole: actor.role,
      requestId,
      metadata: {
        generationId: record.id,
        model: env.OPENAI_MODEL,
        promptVersion: PROMPT_VERSION,
        grounding: actionPlan.grounding.status,
        sourceCount: sources.length,
        citationsDropped,
      },
    });

    return {
      actionPlan,
      generation: {
        id: record.id,
        model: record.model,
        promptVersion: record.promptVersion,
        generatedAt: record.createdAt.toISOString(),
        latencyMs,
        attempts: attempt,
        citationsDropped,
        inputTokens: modelCall?.inputTokens ?? null,
        outputTokens: modelCall?.outputTokens ?? null,
      },
    };
  } catch (error) {
    const apiError = classifyModelError(error);

    console.warn("action plan generation failed", {
      requestId,
      code: apiError.code,
      ...(apiError.diagnostics ? { diagnostics: apiError.diagnostics } : {}),
    });
    await db
      .update(aiGenerations)
      .set({
        status: "failed",
        errorCode: apiError.code,
        latencyMs: Date.now() - startedAt,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
      })
      .where(eq(aiGenerations.id, record.id));

    throw apiError;
  }
}
