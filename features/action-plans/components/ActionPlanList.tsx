import type { SessionUser } from "@/lib/schemas/action-plan";
import type { StoredActionPlan } from "@/lib/types";
import {
  filterPlans,
  hasActiveFilters,
  type PlanFilters,
} from "../domain/filters";
import { can } from "../domain/permissions";
import { PlanFiltersBar } from "./PlanFilters";
import { ActionPlanCard } from "./ActionPlanCard";
import { OperationalOverview } from "./OperationalOverview";

type ActionPlanListProps = {
  user: SessionUser;
  plans: StoredActionPlan[];
  onCreate: () => void;
  onLoadDemoCases: () => void;
  onEdit: (plan: StoredActionPlan) => void;
  onDelete: (planId: string) => void;
  onApprove: (planId: string) => void;
  onComplete: (planId: string) => void;
  onResetDemo: () => void;
  filters: PlanFilters;
  onFiltersChange: (filters: PlanFilters) => void;
};

export function ActionPlanList({
  user,
  plans,
  onCreate,
  onLoadDemoCases,
  onEdit,
  onDelete,
  onApprove,
  onComplete,
  onResetDemo,
  filters,
  onFiltersChange,
}: ActionPlanListProps) {
  const canCreate = can(user, "plan:create");
  const visiblePlans = filterPlans(plans, filters);

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
          are stored in a PostgreSQL database and every change is recorded in an
          audit log.
        </p>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          {canCreate ? (
            <button
              className="min-h-10 rounded-lg border border-stone-900 bg-stone-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-stone-800"
              type="button"
              onClick={onLoadDemoCases}
            >
              Load Demo Cases
            </button>
          ) : null}
          {can(user, "demo:reset") ? (
            <button
              className="min-h-10 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 transition hover:bg-stone-100"
              type="button"
              onClick={onResetDemo}
            >
              Reset demo data
            </button>
          ) : null}
        </div>
      </div>

      {plans.length > 0 ? (
        <PlanFiltersBar
          plans={plans}
          filters={filters}
          shown={visiblePlans.length}
          onChange={onFiltersChange}
        />
      ) : null}

      {plans.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white px-6 py-14 text-center shadow-sm">
          <h2 className="text-2xl font-semibold text-stone-950">
            No action plans yet.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-stone-600">
            {canCreate
              ? "Create your first sustainability action plan or load demo cases to explore the workflow."
              : "Plans appear here once a Sustainability Manager creates them."}
          </p>
          {canCreate ? (
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
          ) : null}
        </div>
      ) : visiblePlans.length === 0 && hasActiveFilters(filters) ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white px-6 py-10 text-center text-sm text-stone-600">
          No plans match these filters.
        </div>
      ) : (
        <div className="grid gap-4">
          {visiblePlans.map((plan) => (
            <ActionPlanCard
              key={plan.id}
              plan={plan}
              canApprove={can(user, "plan:approve", plan)}
              canComplete={can(user, "plan:complete", plan)}
              canDelete={can(user, "plan:delete", plan)}
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
