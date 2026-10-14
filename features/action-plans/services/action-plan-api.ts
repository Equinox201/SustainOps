import type { AIActionPlan, SustainabilityCaseInput } from "@/lib/types";
import { isAIActionPlan, isRecord } from "../domain/guards";

export type GenerateActionPlanResult =
  | { ok: true; actionPlan: AIActionPlan }
  | { ok: false; error: string };

function getErrorMessage(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  return typeof value.error === "string" ? value.error : null;
}

export async function generateActionPlan(
  input: SustainabilityCaseInput,
): Promise<GenerateActionPlanResult> {
  try {
    const response = await fetch("/api/action-plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
    const data: unknown = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        error:
          getErrorMessage(data) ??
          "The action plan could not be generated. Please review the case details and try again.",
      };
    }

    const actionPlan = isRecord(data) ? data.actionPlan : null;

    if (!isAIActionPlan(actionPlan)) {
      return {
        ok: false,
        error: "The action plan response was not in the expected format.",
      };
    }

    return { ok: true, actionPlan };
  } catch {
    return {
      ok: false,
      error:
        "The request failed. Check your connection and try generating the action plan again.",
    };
  }
}
