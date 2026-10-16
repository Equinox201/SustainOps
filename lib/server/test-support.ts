import { demoActionPlans } from "@/lib/demo-plans";
import type {
  AIActionPlan,
  RetrievalDiagnostics,
  SustainabilityCaseInput,
} from "@/lib/types";
import { schema, type Database } from "./db";

/**
 * Records a finished AI generation, as the server does after calling the
 * model, and returns its id. A plan can only claim AI provenance from such a
 * record, so tests that want AI-origin plans start here.
 */
export async function recordGeneration(
  db: Database,
  {
    input = demoActionPlans[0].sustainabilityCase,
    output = demoActionPlans[0].actionPlan!,
    userId = null,
    diagnostics = null,
    status = "succeeded",
  }: {
    input?: SustainabilityCaseInput;
    output?: AIActionPlan;
    userId?: string | null;
    diagnostics?: RetrievalDiagnostics | null;
    status?: "succeeded" | "failed";
  } = {},
): Promise<string> {
  const [row] = await db
    .insert(schema.aiGenerations)
    .values({
      requestId: `test-${crypto.randomUUID()}`,
      clientKey: "test",
      userId,
      model: "test-model",
      promptVersion: "test",
      status,
      diagnostics,
      input,
      output,
      sources: output.sources,
      groundingStatus: output.grounding.status,
    })
    .returning({ id: schema.aiGenerations.id });

  return row.id;
}
