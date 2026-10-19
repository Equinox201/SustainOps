import type { StoredActionPlan } from "@/lib/types";
import { formatDate, getVisibleStatus } from "../domain/plan-utils";
import { StatusBadge } from "./StatusBadge";

const actionButtonBaseClassName =
  "inline-flex min-h-10 w-full items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold transition sm:w-32";

function Detail({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <dt className="font-medium text-stone-500">{label}</dt>
      <dd className="mt-1 text-stone-900">{children}</dd>
    </div>
  );
}

export function ActionPlanCard({
  plan,
  canApprove,
  canComplete,
  canDelete,
  onEdit,
  onDelete,
  onApprove,
  onComplete,
}: {
  plan: StoredActionPlan;
  canApprove: boolean;
  canComplete: boolean;
  canDelete: boolean;
  onEdit: (plan: StoredActionPlan) => void;
  onDelete: (planId: string) => void;
  onApprove: (planId: string) => void;
  onComplete: (planId: string) => void;
}) {
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_max-content] lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-xl font-semibold text-stone-950">
              {plan.title}
            </h3>
            <StatusBadge status={getVisibleStatus(plan)} />
            {plan.sourceAlerts.length > 0 ? (
              <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-950">
                Sources changed
              </span>
            ) : null}
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Property">{plan.sustainabilityCase.property}</Detail>
            <Detail label="Department">
              {plan.sustainabilityCase.department}
            </Detail>
            <Detail label="Approval">
              {plan.approved
                ? `Approved${plan.approvedBy ? ` by ${plan.approvedBy.name}` : ""}`
                : plan.reviewStatus === "changes_requested"
                  ? "Changes requested"
                  : "Pending review"}
            </Detail>
            <Detail label="Owner">{plan.owner || "Unassigned"}</Detail>
            <Detail label="Priority">{plan.priority}</Detail>
            <Detail label="Target Date">{plan.targetDate || "Not set"}</Detail>
            <Detail label="Next Review">
              {plan.nextReviewDate || "Not set"}
            </Detail>
            <Detail label="Issue" className="sm:col-span-2 lg:col-span-3">
              <span className="leading-6">{plan.sustainabilityCase.issue}</span>
            </Detail>
            <Detail label="Created">{formatDate(plan.createdAt)}</Detail>
            <Detail label="Updated">{formatDate(plan.updatedAt)}</Detail>
          </dl>
        </div>

        <div className="flex flex-wrap items-start gap-2 lg:justify-end">
          <button
            className={`${actionButtonBaseClassName} border border-stone-300 bg-white text-stone-800 hover:bg-stone-50`}
            type="button"
            onClick={() => onEdit(plan)}
          >
            View / Edit
          </button>
          {canApprove && !plan.approved && !plan.completed ? (
            <button
              className={`${actionButtonBaseClassName} border border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800`}
              type="button"
              onClick={() => onApprove(plan.id)}
            >
              Approve
            </button>
          ) : null}
          {canComplete && plan.approved && !plan.completed ? (
            <button
              className={`${actionButtonBaseClassName} border border-stone-900 bg-stone-900 text-white hover:bg-stone-800`}
              type="button"
              onClick={() => onComplete(plan.id)}
            >
              Mark Done
            </button>
          ) : null}
          {canDelete ? (
            <button
              className={`${actionButtonBaseClassName} border border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100`}
              type="button"
              onClick={() => onDelete(plan.id)}
            >
              Delete
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
