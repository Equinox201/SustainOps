import type { MainView } from "../types";

const views: Array<{ view: MainView; label: string }> = [
  { view: "actionPlans", label: "Action Plans" },
  { view: "insights", label: "Insights & Knowledge" },
];

export function MainNavigation({
  currentMainView,
  onViewChange,
}: {
  currentMainView: MainView;
  onViewChange: (view: MainView) => void;
}) {
  return (
    <nav
      className="inline-flex rounded-lg border border-stone-200 bg-stone-50 p-1"
      aria-label="Main sections"
    >
      {views.map(({ view, label }) => (
        <button
          key={view}
          className={`min-h-10 rounded-lg px-4 py-2 text-sm font-semibold transition ${
            currentMainView === view
              ? "bg-white text-stone-950 shadow-sm"
              : "text-stone-600 hover:bg-white/70 hover:text-stone-950"
          }`}
          type="button"
          onClick={() => onViewChange(view)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
