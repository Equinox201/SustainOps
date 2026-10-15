import type { SessionUser } from "@/lib/schemas/action-plan";
import { ROLE_LABELS } from "../domain/permissions";
import type { MainView } from "../types";
import { MainNavigation } from "./MainNavigation";

export function AppHeader({
  user,
  currentMainView,
  canCreate,
  canViewInsights,
  onViewChange,
  onCreate,
  onSignOut,
}: {
  user: SessionUser;
  currentMainView: MainView;
  canCreate: boolean;
  canViewInsights: boolean;
  onViewChange: (view: MainView) => void;
  onCreate: () => void;
  onSignOut: () => void;
}) {
  return (
    <header className="rounded-lg border border-stone-200 bg-white px-6 py-7 shadow-sm sm:px-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-5 inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-900">
            AI-assisted sustainability operations
          </div>
          <h1 className="max-w-5xl text-3xl font-semibold tracking-normal text-stone-950 sm:text-4xl lg:text-5xl">
            SustainOps
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-stone-600 sm:text-lg">
            Turn sustainability issues into reviewed, trackable action plans
            across hotel operations.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-end">
          <div className="flex items-center gap-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
            <span>
              <span className="block font-semibold text-stone-950">
                {user.name}
              </span>
              <span className="block text-xs text-stone-600">
                {ROLE_LABELS[user.role]}
                {user.department ? ` · ${user.department}` : ""}
              </span>
            </span>
            <button
              className="rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-100"
              type="button"
              onClick={onSignOut}
            >
              Switch user
            </button>
          </div>
          {canViewInsights ? (
            <MainNavigation
              currentMainView={currentMainView}
              onViewChange={onViewChange}
            />
          ) : null}
          {canCreate && currentMainView === "actionPlans" ? (
            <button
              className="min-h-12 rounded-lg bg-stone-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800"
              type="button"
              onClick={onCreate}
            >
              Create New Action Plan
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
