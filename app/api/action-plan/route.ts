import OpenAI from "openai";
import type { Response as OpenAIResponse } from "openai/resources/responses/responses";
import {
  SUSTAINABILITY_SYSTEM_PROMPT,
  buildSustainabilityActionPlanPrompt,
} from "@/lib/prompts";
import type { AIActionPlan, SustainabilityCaseInput } from "@/lib/types";

const ACTION_PLAN_MODEL = "gpt-5-mini";

const REQUIRED_FIELDS = [
  "property",
  "department",
  "issue",
  "currentMetric",
  "targetMetric",
  "operationalContext",
] as const satisfies readonly (keyof SustainabilityCaseInput)[];

const actionPlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "situationSummary",
    "likelyRootCauses",
    "recommendedOperationalActions",
    "staffMicroTrainingMessage",
    "managerChecklist",
    "kpisToMonitor",
    "governancePrivacyNotes",
    "followUpRecommendations",
    "confidenceLevel",
    "humanReviewRequired",
  ],
  properties: {
    situationSummary: { type: "string" },
    likelyRootCauses: {
      type: "array",
      items: { type: "string" },
    },
    recommendedOperationalActions: {
      type: "array",
      items: { type: "string" },
    },
    staffMicroTrainingMessage: { type: "string" },
    managerChecklist: {
      type: "array",
      items: { type: "string" },
    },
    kpisToMonitor: {
      type: "array",
      items: { type: "string" },
    },
    governancePrivacyNotes: {
      type: "array",
      items: { type: "string" },
    },
    followUpRecommendations: {
      type: "array",
      items: { type: "string" },
    },
    confidenceLevel: {
      type: "string",
      enum: ["Low", "Medium", "High"],
    },
    humanReviewRequired: {
      type: "boolean",
      enum: [true],
    },
  },
} as const;

type ParseResult =
  | {
      status: "ok";
      actionPlan: AIActionPlan;
    }
  | {
      status: "parse_failed" | "validation_failed";
      responseText?: string;
    };

function jsonResponse(body: unknown, status: number) {
  return Response.json(body, { status });
}

function validateSustainabilityCaseInput(
  value: unknown,
): SustainabilityCaseInput | { error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Request body must be a JSON object." };
  }

  const candidate = value as Record<string, unknown>;
  const unexpectedField = Object.keys(candidate).find(
    (field) =>
      !REQUIRED_FIELDS.includes(field as keyof SustainabilityCaseInput),
  );

  if (unexpectedField) {
    return {
      error: `Unexpected field: ${unexpectedField}. Only sustainability case fields are accepted.`,
    };
  }

  const invalidField = REQUIRED_FIELDS.find(
    (field) =>
      typeof candidate[field] !== "string" ||
      candidate[field].trim().length === 0,
  );

  if (invalidField) {
    return {
      error: `Missing or invalid required field: ${invalidField}.`,
    };
  }

  const property = candidate.property;
  const department = candidate.department;
  const issue = candidate.issue;
  const currentMetric = candidate.currentMetric;
  const targetMetric = candidate.targetMetric;
  const operationalContext = candidate.operationalContext;

  if (
    typeof property !== "string" ||
    typeof department !== "string" ||
    typeof issue !== "string" ||
    typeof currentMetric !== "string" ||
    typeof targetMetric !== "string" ||
    typeof operationalContext !== "string"
  ) {
    return {
      error: "Request body must include all required sustainability case fields.",
    };
  }

  return {
    property: property.trim(),
    department: department.trim(),
    issue: issue.trim(),
    currentMetric: currentMetric.trim(),
    targetMetric: targetMetric.trim(),
    operationalContext: operationalContext.trim(),
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => isNonEmptyString(item))
  );
}

function isAIActionPlan(value: unknown): value is AIActionPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    isNonEmptyString(candidate.situationSummary) &&
    isNonEmptyStringArray(candidate.likelyRootCauses) &&
    isNonEmptyStringArray(candidate.recommendedOperationalActions) &&
    isNonEmptyString(candidate.staffMicroTrainingMessage) &&
    isNonEmptyStringArray(candidate.managerChecklist) &&
    isNonEmptyStringArray(candidate.kpisToMonitor) &&
    isNonEmptyStringArray(candidate.governancePrivacyNotes) &&
    isNonEmptyStringArray(candidate.followUpRecommendations) &&
    (candidate.confidenceLevel === "Low" ||
      candidate.confidenceLevel === "Medium" ||
      candidate.confidenceLevel === "High") &&
    candidate.humanReviewRequired === true
  );
}

function extractResponseText(response: OpenAIResponse): string {
  if (response.output_text.trim().length > 0) {
    return response.output_text;
  }

  return response.output
    .flatMap((item) => {
      if (item.type !== "message") {
        return [];
      }

      return item.content.flatMap((content) =>
        content.type === "output_text" ? [content.text] : [],
      );
    })
    .join("");
}

function stripMarkdownJsonFence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function tryParseJson(responseText: string): unknown | null {
  try {
    return JSON.parse(responseText);
  } catch {
    const fallbackText = stripMarkdownJsonFence(responseText);

    if (fallbackText === responseText.trim()) {
      return null;
    }

    try {
      return JSON.parse(fallbackText);
    } catch {
      return null;
    }
  }
}

function parseAIActionPlan(responseText: string): ParseResult {
  if (responseText.trim().length === 0) {
    return { status: "parse_failed", responseText };
  }

  const parsed = tryParseJson(responseText);

  if (!parsed) {
    return { status: "parse_failed", responseText };
  }

  if (!isAIActionPlan(parsed)) {
    return { status: "validation_failed", responseText };
  }

  return {
    status: "ok",
    actionPlan: parsed,
  };
}

function getSafeResponseSnippet(responseText?: string): string | undefined {
  if (!responseText) {
    return undefined;
  }

  return responseText.replace(/\s+/g, " ").slice(0, 120);
}

function logAIResponseIssue(
  category: "parse_failed" | "validation_failed" | "generation_failed",
  responseText?: string,
) {
  const responseStart = getSafeResponseSnippet(responseText);

  console.warn(
    "action-plan response issue",
    responseStart ? { category, responseStart } : { category },
  );
}

export async function POST(request: Request) {
  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  const input = validateSustainabilityCaseInput(requestBody);

  if ("error" in input) {
    return jsonResponse({ error: input.error }, 400);
  }

  if (!process.env.OPENAI_API_KEY) {
    return jsonResponse({ error: "Missing OPENAI_API_KEY." }, 500);
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    const response = await openai.responses.create({
      model: ACTION_PLAN_MODEL,
      instructions: SUSTAINABILITY_SYSTEM_PROMPT,
      input: buildSustainabilityActionPlanPrompt(input),
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

    const responseText = extractResponseText(response);
    const parseResult = parseAIActionPlan(responseText);

    if (parseResult.status === "parse_failed") {
      logAIResponseIssue("parse_failed", parseResult.responseText);
      return jsonResponse({ error: "Failed to parse AI action plan." }, 500);
    }

    if (parseResult.status === "validation_failed") {
      logAIResponseIssue("validation_failed", parseResult.responseText);
      return jsonResponse(
        {
          error: "AI action plan response did not match the expected format.",
        },
        500,
      );
    }

    if (parseResult.status === "ok") {
      return jsonResponse({ actionPlan: parseResult.actionPlan }, 200);
    }

    return jsonResponse(
      {
        error: "AI action plan response did not match the expected format.",
      },
      500,
    );
  } catch {
    logAIResponseIssue("generation_failed");
    return jsonResponse({ error: "Failed to generate AI action plan" }, 500);
  }
}
