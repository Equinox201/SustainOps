import type { MainView } from "../types";
import { MainNavigation } from "./MainNavigation";

export function AppHeader({
  currentMainView,
  onViewChange,
  onCreate,
}: {
  currentMainView: MainView;
  onViewChange: (view: MainView) => void;
  onCreate: () => void;
}) {
  return (
    <header className="rounded-lg border border-stone-200 bg-white px-6 py-7 shadow-sm sm:px-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-5 inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-900">
            AI-assisted sustainability operations
          </div>
          <h1 className="max-w-5xl text-3xl font-semibold tracking-normal text-stone-950 sm:text-4xl lg:text-5xl">
            ImpactFlow
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-stone-600 sm:text-lg">
            Turn sustainability issues into reviewed, trackable action plans
            across hotel operations.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-end">
          <MainNavigation
            currentMainView={currentMainView}
            onViewChange={onViewChange}
          />
          {currentMainView === "actionPlans" ? (
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
