import { z } from "zod";
import { aiActionPlanSchema } from "./action-plan";

type JsonSchema = Record<string, unknown>;

// OpenAI strict structured output supports a subset of JSON Schema. Length and
// count bounds stay enforced by our own Zod validation of the response.
const UNSUPPORTED_KEYWORDS = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "pattern",
  "format",
]);

function toStrictSchema(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(toStrictSchema);
  }

  if (node === null || typeof node !== "object") {
    return node;
  }

  const result: JsonSchema = {};

  for (const [key, value] of Object.entries(node as JsonSchema)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) {
      continue;
    }

    if (key === "const") {
      result.enum = [value];
      continue;
    }

    result[key] = toStrictSchema(value);
  }

  return result;
}

export const actionPlanJsonSchema = toStrictSchema(
  z.toJSONSchema(aiActionPlanSchema, { io: "output" }),
) as JsonSchema;
