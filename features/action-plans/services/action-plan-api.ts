import { z } from "zod";
import {
  auditEventSchema,
  noteRequestSchema,
  generationResponseSchema,
  storedActionPlanSchema,
  type ChangeResponse,
  type PlanContent,
  type SustainabilityCaseInput,
} from "@/lib/schemas/action-plan";
import type {
  AuditEvent,
  AuditEventType,
  PlanNote,
  PlanRevision,
  PlanRevisionSummary,
  StoredActionPlan,
} from "@/lib/types";
import type { LifecycleEvent } from "../domain/lifecycle";
import { apiRequest, type ApiResult } from "./api-client";

const planResponse = z.object({ plan: storedActionPlanSchema });
const plansResponse = z.object({ plans: z.array(storedActionPlanSchema) });
const demoResponse = z.object({
  added: z.number(),
  plans: z.array(storedActionPlanSchema),
});
const eventsResponse = z.object({ events: z.array(auditEventSchema) });
const okResponse = z.object({ ok: z.literal(true) });
const knowledgeResponse = z.object({
  documents: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      title: z.string(),
      department: z.string(),
      documentType: z.string(),
      region: z.string(),
      version: z.number(),
      status: z.string(),
      chunkCount: z.number(),
    }),
  ),
});

export type GenerationOutcome = z.infer<typeof generationResponseSchema>;

function pickPlan(result: ApiResult<{ plan: StoredActionPlan }>) {
  return result.ok ? { ok: true as const, data: result.data.plan } : result;
}

export async function fetchPlans() {
  const result = await apiRequest("/api/action-plans", {
    schema: plansResponse,
  });

  return result.ok ? { ok: true as const, data: result.data.plans } : result;
}

export async function createPlan(content: PlanContent) {
  return pickPlan(
    await apiRequest("/api/action-plans", {
      method: "POST",
      body: content,
      schema: planResponse,
    }),
  );
}

export async function updatePlan(
  id: string,
  content: PlanContent,
  expectedVersion: number,
) {
  return pickPlan(
    await apiRequest(`/api/action-plans/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: { ...content, expectedVersion },
      schema: planResponse,
    }),
  );
}

export async function fetchPlan(id: string) {
  return pickPlan(
    await apiRequest(`/api/action-plans/${encodeURIComponent(id)}`, {
      schema: planResponse,
    }),
  );
}

export async function transitionPlan(
  id: string,
  event: LifecycleEvent,
  options: {
    expectedVersion: number;
    content?: PlanContent;
    comment?: string;
    responses?: ChangeResponse[];
  },
) {
  return pickPlan(
    await apiRequest(`/api/action-plans/${encodeURIComponent(id)}/transition`, {
      method: "POST",
      body: {
        event,
        expectedVersion: options.expectedVersion,
        content: options.content,
        comment: options.comment,
        responses: options.responses,
      },
      schema: planResponse,
    }),
  );
}

export async function deletePlan(id: string) {
  return apiRequest(`/api/action-plans/${encodeURIComponent(id)}`, {
    method: "DELETE",
    schema: okResponse,
  });
}

export async function loadDemoPlans() {
  return apiRequest("/api/action-plans/demo", {
    method: "POST",
    schema: demoResponse,
  });
}

export async function generateActionPlan(
  sustainabilityCase: SustainabilityCaseInput,
  planId: string | null,
) {
  return apiRequest("/api/action-plans/generate", {
    method: "POST",
    body: { sustainabilityCase, planId },
    schema: generationResponseSchema,
  });
}

export async function fetchPlanHistory(id: string) {
  const result = await apiRequest(
    `/api/action-plans/${encodeURIComponent(id)}/history`,
    { schema: eventsResponse },
  );

  return result.ok
    ? { ok: true as const, data: result.data.events.map(toAuditEvent) }
    : result;
}

function toAuditEvent(event: z.infer<typeof auditEventSchema>): AuditEvent {
  return { ...event, eventType: event.eventType as AuditEventType };
}

export async function fetchAuditEvents() {
  const result = await apiRequest("/api/audit-events", {
    schema: eventsResponse,
  });

  return result.ok
    ? { ok: true as const, data: result.data.events.map(toAuditEvent) }
    : result;
}

export async function fetchKnowledgeDocuments() {
  const result = await apiRequest("/api/knowledge", {
    schema: knowledgeResponse,
  });

  return result.ok
    ? { ok: true as const, data: result.data.documents }
    : result;
}

const resetResponse = z.object({ removed: z.number(), restored: z.number() });

export function resetDemo() {
  return apiRequest("/api/demo/reset", {
    method: "POST",
    schema: resetResponse,
  });
}

// ---- notes and revisions -----------------------------------------------

const notesResponse = z.object({
  notes: z.array(
    z.object({
      id: z.string(),
      body: z.string(),
      author: z
        .object({ id: z.string(), name: z.string(), role: z.string() })
        .nullable(),
      createdAt: z.string(),
    }),
  ),
});
const noteResponse = z.object({
  note: notesResponse.shape.notes.element,
});
const actorShape = z
  .object({ id: z.string(), name: z.string(), role: z.string() })
  .nullable();
const revisionsResponse = z.object({
  revisions: z.array(
    z.object({
      version: z.number(),
      eventType: z.string(),
      actor: actorShape,
      reason: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});
const revisionResponse = z.object({
  revision: z.object({
    version: z.number(),
    eventType: z.string(),
    actor: actorShape,
    reason: z.string().nullable(),
    createdAt: z.string(),
    // Validated server-side; the client treats it as the stored snapshot.
    snapshot: z.custom<PlanRevision["snapshot"]>(
      (value) => typeof value === "object" && value !== null,
    ),
  }),
});

export async function fetchPlanNotes(id: string) {
  const result = await apiRequest(
    `/api/action-plans/${encodeURIComponent(id)}/notes`,
    { schema: notesResponse },
  );

  return result.ok
    ? { ok: true as const, data: result.data.notes satisfies PlanNote[] }
    : result;
}

export async function addPlanNote(id: string, body: string) {
  const result = await apiRequest(
    `/api/action-plans/${encodeURIComponent(id)}/notes`,
    {
      method: "POST",
      body: noteRequestSchema.parse({ body }),
      schema: noteResponse,
    },
  );

  return result.ok ? { ok: true as const, data: result.data.note } : result;
}

export async function fetchRevisions(id: string) {
  const result = await apiRequest(
    `/api/action-plans/${encodeURIComponent(id)}/revisions`,
    { schema: revisionsResponse },
  );

  return result.ok
    ? {
        ok: true as const,
        data: result.data.revisions satisfies PlanRevisionSummary[],
      }
    : result;
}

export async function fetchRevision(id: string, version: number) {
  const result = await apiRequest(
    `/api/action-plans/${encodeURIComponent(id)}/revisions/${version}`,
    { schema: revisionResponse },
  );

  return result.ok
    ? { ok: true as const, data: result.data.revision as PlanRevision }
    : result;
}
