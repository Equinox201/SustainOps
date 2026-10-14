import type { StoredActionPlan } from "@/lib/types";
import { ActionPlanCard } from "./ActionPlanCard";
import { OperationalOverview } from "./OperationalOverview";

type ActionPlanListProps = {
  plans: StoredActionPlan[];
  onCreate: () => void;
  onLoadDemoCases: () => void;
  onEdit: (plan: StoredActionPlan) => void;
  onDelete: (planId: string) => void;
  onApprove: (planId: string) => void;
  onComplete: (planId: string) => void;
};

export function ActionPlanList({
  plans,
  onCreate,
  onLoadDemoCases,
  onEdit,
  onDelete,
  onApprove,
  onComplete,
}: ActionPlanListProps) {
  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">
          Action Plans
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-normal text-stone-950">
          Current Sustainability Workflow
        </h2>
      </div>
      <OperationalOverview plans={plans} />

      <div className="flex flex-col gap-3 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-600 sm:flex-row sm:items-center sm:justify-between">
        <p>
          All properties, policies and data in this demo are fictional. Plans
          are stored in a PostgreSQL database and every change is recorded in
          an audit log.
        </p>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <button
            className="min-h-10 rounded-lg border border-stone-900 bg-stone-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-stone-800"
            type="button"
            onClick={onLoadDemoCases}
          >
            Load Demo Cases
          </button>
        </div>
      </div>

      {plans.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white px-6 py-14 text-center shadow-sm">
          <h2 className="text-2xl font-semibold text-stone-950">
            No action plans yet.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-stone-600">
            Create your first sustainability action plan or load demo cases to
            explore the workflow.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              className="min-h-12 rounded-lg bg-stone-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800"
              type="button"
              onClick={onCreate}
            >
              Create New Action Plan
            </button>
            <button
              className="min-h-12 rounded-lg border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-800 shadow-sm transition hover:bg-stone-50"
              type="button"
              onClick={onLoadDemoCases}
            >
              Load Demo Cases
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {plans.map((plan) => (
            <ActionPlanCard
              key={plan.id}
              plan={plan}
              onEdit={onEdit}
              onDelete={onDelete}
              onApprove={onApprove}
              onComplete={onComplete}
            />
          ))}
        </div>
      )}
    </section>
  );
}
