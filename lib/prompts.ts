import type {
  SourceRef,
  SustainabilityCaseInput,
} from "@/lib/schemas/action-plan";

/** Bump whenever the prompt text or output contract changes. */
export const PROMPT_VERSION = "action-plan-v4-claims";

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
    {
      "action": "string",
      "sourceIds": ["S1"],
      "claimType": "policy_requirement | proposal | assumption",
      "evidence": { "sourceId": "S1", "quote": "string" } or null
    }
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
- For every action set claimType:
  - "policy_requirement": the action carries out a rule, threshold or requirement that a listed source states. Then evidence is required: sourceId is a source you cite for this action, and quote is one passage copied exactly, word for word, from that source's text (at least one full clause, never a paraphrase or a summary). Quotations are checked against the source; one that does not match is rejected.
  - "proposal": a sensible suggestion that sources may support but do not require, or general good practice. evidence is null.
  - "assumption": the action relies on something about this hotel's operations that the case and sources do not state. evidence is null.
  When unsure, choose "proposal".
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
