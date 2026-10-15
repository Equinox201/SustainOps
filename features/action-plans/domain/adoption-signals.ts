import type { AuditEvent, AuditEventType, StoredActionPlan } from "@/lib/types";
import type { OverviewMetric } from "../types";

function countEvents(events: AuditEvent[], ...types: AuditEventType[]) {
  return events.filter((event) => types.includes(event.eventType)).length;
}

function getMostActiveDepartments(
  plans: StoredActionPlan[],
  events: AuditEvent[],
) {
  const counts = new Map<string, number>();

  for (const event of events) {
    const department = event.department?.trim();

    if (department) {
      counts.set(department, (counts.get(department) ?? 0) + 1);
    }
  }

  if (counts.size > 0) {
    return Array.from(counts.entries())
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
  events: AuditEvent[],
) {
  return {
    metrics: [
      {
        label: "Generated",
        value: countEvents(events, "action_plan_generated"),
        helperText: "AI outputs created",
      },
      {
        label: "Saved",
        value: countEvents(
          events,
          "action_plan_created",
          "action_plan_updated",
        ),
        helperText: "Plan saves recorded in the audit log",
      },
      {
        label: "Approved",
        value: countEvents(events, "action_plan_approved"),
        helperText: "Human review completed",
      },
      {
        label: "Active",
        value: plans.filter((plan) => plan.approved && !plan.completed).length,
        helperText: "Currently in progress",
      },
      {
        label: "Done",
        value: plans.filter((plan) => plan.completed).length,
        helperText: "Completed plans",
      },
      {
        label: "Notes Updated",
        value: countEvents(events, "action_notes_updated"),
        helperText: "Implementation updates saved",
      },
    ] satisfies OverviewMetric[],
    departments: getMostActiveDepartments(plans, events),
  };
}
