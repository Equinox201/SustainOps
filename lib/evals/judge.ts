import OpenAI from "openai";
import type { JudgeVerdict } from "./types";

type JudgeInput = {
  apiKey: string;
  baseURL?: string;
  model: string;
  timeoutMs: number;
  /** Only actions that cite at least one source are judged. */
  items: Array<{ action: string; excerpts: string[] }>;
};

const JUDGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdicts"],
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "verdict"],
        properties: {
          index: { type: "integer" },
          verdict: { type: "string", enum: ["supported", "partial", "unsupported"] },
        },
      },
    },
  },
} as const;

const INSTRUCTIONS = `
You audit whether recommendations are supported by the company policy excerpts they cite.
For each numbered recommendation, judge ONLY against the excerpts listed with it:
- "supported": the excerpts directly support what the recommendation asserts or requires.
- "partial": the excerpts are relevant, but the recommendation adds specific facts, figures or requirements that they do not state.
- "unsupported": the excerpts do not support it, or contradict it.
A recommendation may propose sensible operational detail; judge whether any claim it makes about what policy says is backed. Return JSON only.
`.trim();

/**
 * LLM-as-judge for citation faithfulness. Known limitation: when the judge is
 * the same model that wrote the plan it may be lenient toward its own style,
 * so treat this as a screening signal, not ground truth.
 */
export async function judgeFaithfulness(
  input: JudgeInput,
): Promise<JudgeVerdict[]> {
  if (input.items.length === 0) {
    return [];
  }

  const client = new OpenAI({
    apiKey: input.apiKey,
    baseURL: input.baseURL,
    timeout: input.timeoutMs,
    maxRetries: 1,
  });

  const prompt = input.items
    .map(
      (item, index) =>
        `Recommendation ${index}: ${item.action}\nCited excerpts:\n${item.excerpts
          .map((excerpt) => `- ${excerpt}`)
          .join("\n")}`,
    )
    .join("\n\n");

  const response = await client.responses.create({
    model: input.model,
    instructions: INSTRUCTIONS,
    input: prompt,
    max_output_tokens: 4000,
    store: false,
    text: {
      format: {
        type: "json_schema",
        name: "faithfulness_verdicts",
        strict: true,
        schema: JUDGE_SCHEMA,
      },
    },
  });

  const parsed = JSON.parse(response.output_text) as {
    verdicts: Array<{ index: number; verdict: JudgeVerdict }>;
  };
  const byIndex = new Map(parsed.verdicts.map((v) => [v.index, v.verdict]));

  // A missing verdict counts against the plan, not for it.
  return input.items.map((_, index) => byIndex.get(index) ?? "unsupported");
}
