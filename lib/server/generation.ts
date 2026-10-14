import { createHash } from "node:crypto";
import OpenAI from "openai";
import { and, count, eq, gte } from "drizzle-orm";
import type { AIActionPlan, SustainabilityCaseInput } from "@/lib/types";
import { aiActionPlanSchema } from "@/lib/schemas/action-plan";
import { actionPlanJsonSchema } from "@/lib/schemas/openai";
import {
  PROMPT_VERSION,
  SUSTAINABILITY_SYSTEM_PROMPT,
  buildSustainabilityActionPlanPrompt,
} from "@/lib/prompts";
import { ApiError } from "./api";
import { schema, type Database } from "./db";
import type { ServerEnv } from "./env";

const { aiGenerations, auditEvents } = schema;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type ModelCall = {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

export type ModelCaller = (args: {
  apiKey: string;
  model: string;
  timeoutMs: number;
  instructions: string;
  input: string;
}) => Promise<ModelCall>;

/** The real OpenAI call. Swapped for a fake in tests. */
export const callOpenAI: ModelCaller = async ({
  apiKey,
  model,
  timeoutMs,
  instructions,
  input,
}) => {
  const client = new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 1 });

  const response = await client.responses.create({
    model,
    instructions,
    input,
    max_output_tokens: 2400,
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
  };
};

export function getClientKey(request: Request, salt: string) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";

  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

function stripJsonFence(text: string) {
  const match = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : text;
}

function parseModelOutput(text: string): AIActionPlan {
  let raw: unknown;

  try {
    raw = JSON.parse(stripJsonFence(text));
  } catch {
    throw new ApiError(
      502,
      "ai_invalid_output",
      "The AI response could not be read. Please try again.",
    );
  }

  const result = aiActionPlanSchema.safeParse(raw);

  if (!result.success) {
    throw new ApiError(
      502,
      "ai_invalid_output",
      "The AI response did not match the expected format. Please try again.",
    );
  }

  return result.data;
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
  clientKey,
  requestId,
  callModel = callOpenAI,
}: {
  db: Database;
  env: ServerEnv;
  input: SustainabilityCaseInput;
  planId: string | null;
  clientKey: string;
  requestId: string;
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
      model: env.OPENAI_MODEL,
      promptVersion: PROMPT_VERSION,
    })
    .returning();

  const startedAt = Date.now();

  try {
    const modelCall = await callModel({
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL,
      timeoutMs: env.OPENAI_TIMEOUT_MS,
      instructions: SUSTAINABILITY_SYSTEM_PROMPT,
      input: buildSustainabilityActionPlanPrompt(input),
    });
    const actionPlan = parseModelOutput(modelCall.text);
    const latencyMs = Date.now() - startedAt;

    await db
      .update(aiGenerations)
      .set({
        status: "succeeded",
        latencyMs,
        inputTokens: modelCall.inputTokens,
        outputTokens: modelCall.outputTokens,
      })
      .where(eq(aiGenerations.id, record.id));
    await db.insert(auditEvents).values({
      eventType: "action_plan_generated",
      planId,
      department: input.department,
      requestId,
      metadata: {
        generationId: record.id,
        model: env.OPENAI_MODEL,
        promptVersion: PROMPT_VERSION,
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
      },
    };
  } catch (error) {
    const apiError = classifyModelError(error);

    console.warn("action plan generation failed", {
      requestId,
      code: apiError.code,
    });
    await db
      .update(aiGenerations)
      .set({
        status: "failed",
        errorCode: apiError.code,
        latencyMs: Date.now() - startedAt,
      })
      .where(eq(aiGenerations.id, record.id));

    throw apiError;
  }
}
