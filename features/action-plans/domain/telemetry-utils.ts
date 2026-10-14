import type {
  StoredActionPlan,
  TelemetryEvent,
  TelemetryEventName,
} from "@/lib/types";
import type { OverviewMetric } from "../types";
import { isRecord } from "./guards";

export function isTelemetryEventName(
  value: unknown,
): value is TelemetryEventName {
  return (
    value === "demo_cases_loaded" ||
    value === "action_plan_created" ||
    value === "action_plan_generated" ||
    value === "action_plan_saved" ||
    value === "action_plan_approved" ||
    value === "approval_reset" ||
    value === "action_plan_marked_done" ||
    value === "action_plan_deleted" ||
    value === "action_notes_updated" ||
    value === "kpi_progress_updated"
  );
}

export function normalizeTelemetryEvent(
  value: unknown,
): TelemetryEvent | null {
  if (!isRecord(value) || !isTelemetryEventName(value.eventName)) {
    return null;
  }

  if (typeof value.id !== "string" || typeof value.timestamp !== "string") {
    return null;
  }

  return {
    id: value.id,
    eventName: value.eventName,
    planId: typeof value.planId === "string" ? value.planId : undefined,
    department:
      typeof value.department === "string" ? value.department : undefined,
    timestamp: value.timestamp,
  };
}

export function normalizeTelemetryEvents(
  value: unknown,
): TelemetryEvent[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalizedEvents: TelemetryEvent[] = [];

  for (const event of value) {
    const normalizedEvent = normalizeTelemetryEvent(event);

    if (!normalizedEvent) {
      return null;
    }

    normalizedEvents.push(normalizedEvent);
  }

  return normalizedEvents;
}

function countTelemetryEvents(
  telemetryEvents: TelemetryEvent[],
  eventName: TelemetryEventName,
) {
  return telemetryEvents.filter((event) => event.eventName === eventName).length;
}

function getMostActiveDepartments(
  plans: StoredActionPlan[],
  telemetryEvents: TelemetryEvent[],
) {
  const departmentCounts = new Map<string, number>();

  for (const event of telemetryEvents) {
    const department = event.department?.trim();

    if (department) {
      departmentCounts.set(department, (departmentCounts.get(department) ?? 0) + 1);
    }
  }

  if (departmentCounts.size > 0) {
    return Array.from(departmentCounts.entries())
      .sort((first, second) => second[1] - first[1])
      .slice(0, 3)
      .map(([department]) => department);
  }

  return Array.from(
    new Set(
      plans
        .map((plan) => plan.sustainabilityCase.department.trim())
        .filter(Boolean),
    ),
  ).slice(0, 3);
}

export function getAdoptionSignals(
  plans: StoredActionPlan[],
  telemetryEvents: TelemetryEvent[],
) {
  const active = plans.filter(
    (plan) => plan.approved && !plan.completed,
  ).length;
  const done = plans.filter((plan) => plan.completed).length;

  return {
    metrics: [
      {
        label: "Generated",
        value: countTelemetryEvents(telemetryEvents, "action_plan_generated"),
        helperText: "AI outputs created",
      },
      {
        label: "Saved",
        value: countTelemetryEvents(telemetryEvents, "action_plan_saved"),
        helperText: "Plans recorded locally",
      },
      {
        label: "Approved",
        value: countTelemetryEvents(telemetryEvents, "action_plan_approved"),
        helperText: "Human review completed",
      },
      {
        label: "Active",
        value: active,
        helperText: "Currently in progress",
      },
      {
        label: "Done",
        value: done,
        helperText: "Completed plans",
      },
      {
        label: "Notes Updated",
        value: countTelemetryEvents(telemetryEvents, "action_notes_updated"),
        helperText: "Implementation updates saved",
      },
    ] satisfies OverviewMetric[],
    departments: getMostActiveDepartments(plans, telemetryEvents),
  };
}
