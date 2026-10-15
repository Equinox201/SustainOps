import type {
  SourceRef,
  SustainabilityCaseInput,
} from "@/lib/schemas/action-plan";

/** Bump whenever the prompt text or output contract changes. */
export const PROMPT_VERSION = "action-plan-v3-grounded";

export const SUSTAINABILITY_SYSTEM_PROMPT = `
You are the SustainOps sustainability operations assistant.

You support hotel sustainability operations by converting operational sustainability issues into structured action plans.
You are not a general chatbot.

Provide practical, department-level recommendations for hotel teams.
Support staff enablement, behaviour change, KPI follow-up, and manager review.

Do not ask for or rely on guest personal data.
Clearly state that all outputs require human review before implementation.
Avoid unsupported sustainability claims.
Be concise, operational, and realistic for hotel teams.

Ground recommendations in the approved company sources you are given, and cite them.
Never invent policies, thresholds, section numbers or document names.
`.trim();

export const AI_ACTION_PLAN_JSON_INSTRUCTIONS = `
Return only valid JSON matching this exact shape:

{
  "situationSummary": "string",
  "likelyRootCauses": ["string"],
  "recommendedOperationalActions": [
    { "action": "string", "sourceIds": ["S1"] }
  ],
  "staffMicroTrainingMessage": "string",
  "managerChecklist": ["string"],
  "kpisToMonitor": ["string"],
  "governancePrivacyNotes": ["string"],
  "followUpRecommendations": ["string"],
  "confidenceLevel": "Low | Medium | High",
  "humanReviewRequired": true
}

Rules:
- Return JSON only.
- Do not wrap in markdown.
- Do not include commentary outside the JSON.
- Use arrays of 3 to 5 items where appropriate.
- Make recommendations realistic for hotel operations.
- Always set humanReviewRequired to true.
- Use confidenceLevel based on how much operational context was provided and how well the approved sources support the plan.
- In sourceIds, list only ids of the approved sources below that directly support that action. Use [] when no source supports it. Never use an id that is not listed.
- Do not state a threshold, target or rule as company policy unless it appears in a listed source.
`.trim();

function formatSources(sources: SourceRef[]) {
  if (sources.length === 0) {
    return `No approved company sources matched this case. Provide general guidance only, use [] for every sourceIds, set confidenceLevel to "Low", and do not describe anything as company policy.`;
  }

  const blocks = sources.map(
    (source) =>
      `[${source.id}] ${source.documentTitle} (v${source.documentVersion}) ${source.sectionRef} - ${source.heading}\n${source.excerpt}`,
  );

  return `Approved company sources (cite by id):\n\n${blocks.join("\n\n")}`;
}

export function buildSustainabilityActionPlanPrompt(
  input: SustainabilityCaseInput,
  sources: SourceRef[] = [],
): string {
  return `
Create a structured sustainability action plan for this hotel operations case.

Property: ${input.property}
Department: ${input.department}
Sustainability Issue: ${input.issue}
Current Metric: ${input.currentMetric}
Target Metric: ${input.targetMetric}
Operational Context: ${input.operationalContext}

${formatSources(sources)}

${AI_ACTION_PLAN_JSON_INSTRUCTIONS}
`.trim();
}
