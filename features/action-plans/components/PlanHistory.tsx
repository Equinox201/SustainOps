import type { AuditEvent, AuditEventType } from "@/lib/types";
import { ROLE_LABELS, type Role } from "../domain/permissions";
import { formatDate } from "../domain/plan-utils";

const EVENT_LABELS: Record<AuditEventType, string> = {
  demo_cases_loaded: "Demo cases loaded",
  action_plan_created: "Created",
  action_plan_generated: "AI plan generated",
  action_plan_updated: "Edited",
  action_notes_updated: "Implementation notes updated",
  kpi_progress_updated: "KPI progress updated",
  action_plan_approved: "Approved",
  changes_requested: "Changes requested",
  approval_reset: "Approval reset",
  action_plan_completed: "Marked done",
  action_plan_deleted: "Deleted",
};

function describeActor(actor: AuditEvent["actor"]) {
  if (!actor) {
    return "System";
  }

  const role = ROLE_LABELS[actor.role as Role];

  return role ? `${actor.name} · ${role}` : actor.name;
}

export function PlanHistory({
  events,
  error,
}: {
  events: AuditEvent[];
  error: string | null;
}) {
  if (error) {
    return <p className="text-sm text-rose-900">{error}</p>;
  }

  if (events.length === 0) {
    return (
      <p className="text-sm leading-6 text-stone-500">
        Save the plan to start its history.
      </p>
    );
  }

  return (
    <ol className="space-y-4 border-l border-stone-200 pl-5">
      {events.map((event) => (
        <li key={event.id} className="relative">
          <span className="absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full bg-emerald-800" />
          <p className="text-sm font-semibold text-stone-950">
            {EVENT_LABELS[event.eventType] ?? event.eventType}
          </p>
          <p className="text-sm text-stone-600">
            {describeActor(event.actor)} · {formatDate(event.createdAt)}
          </p>
          {event.comment ? (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950">
              “{event.comment}”
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
