"use client";

import { useState } from "react";
import { lifecycleErrorMessages } from "../domain/lifecycle";
import { useActionPlanEditor } from "../hooks/useActionPlanEditor";
import { useActionPlans } from "../hooks/useActionPlans";
import { useTelemetry } from "../hooks/useTelemetry";
import type { MainView } from "../types";
import { ActionPlanEditor } from "./ActionPlanEditor";
import { ActionPlanList } from "./ActionPlanList";
import { AppHeader } from "./AppHeader";
import { InsightsView } from "./InsightsView";

export default function ActionPlansApp() {
  const [currentMainView, setCurrentMainView] =
    useState<MainView>("actionPlans");
  const { telemetryEvents, recordTelemetry, resetTelemetry } = useTelemetry();
  const {
    plans,
    newDemoPlanCount,
    savePlan,
    transition,
    deletePlan,
    loadDemoPlans,
    resetPlans,
  } = useActionPlans({ recordTelemetry });
  const editor = useActionPlanEditor({
    savePlan,
    transition,
    recordTelemetry,
  });

  function handleDelete(planId: string) {
    if (window.confirm("Delete this sustainability action plan?")) {
      deletePlan(planId);
    }
  }

  function handleClearLocalData() {
    if (
      window.confirm(
        "Clear all locally saved sustainability action plans for this browser?",
      )
    ) {
      resetPlans();
      resetTelemetry();
    }
  }

  function handleLoadDemoCases() {
    if (newDemoPlanCount === 0) {
      window.alert("Demo action plans are already loaded.");
      return;
    }

    if (
      plans.length > 0 &&
      !window.confirm(
        "This will add demo action plans to your local list. Continue?",
      )
    ) {
      return;
    }

    loadDemoPlans();
  }

  function handleApprove(planId: string) {
    const plan = plans.find((currentPlan) => currentPlan.id === planId);

    if (!plan) {
      return;
    }

    const result = transition(plan, "approve");

    if (!result.ok) {
      window.alert(lifecycleErrorMessages[result.error]);
    }
  }

  function handleComplete(planId: string) {
    const plan = plans.find((currentPlan) => currentPlan.id === planId);

    if (
      !plan ||
      !plan.approved ||
      plan.completed ||
      !window.confirm("Mark this sustainability action plan as done?")
    ) {
      return;
    }

    transition(plan, "complete");
  }

  return (
    <main className="min-h-screen bg-[#f7f3ec] text-stone-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
        {editor.draft ? (
          <ActionPlanEditor
            draft={editor.draft}
            activePanel={editor.activePanel}
            errorMessage={editor.errorMessage}
            successMessage={editor.successMessage}
            isGenerating={editor.isGenerating}
            onBack={editor.close}
            onDraftChange={editor.updateDraft}
            onPanelChange={editor.setActivePanel}
            onGenerate={editor.generate}
            onSave={editor.save}
            onApprove={editor.approve}
            onComplete={editor.complete}
            onResetApproval={editor.resetApproval}
          />
        ) : (
          <>
            <AppHeader
              currentMainView={currentMainView}
              onViewChange={setCurrentMainView}
              onCreate={editor.openNew}
            />
            {currentMainView === "actionPlans" ? (
              <ActionPlanList
                plans={plans}
                onCreate={editor.openNew}
                onLoadDemoCases={handleLoadDemoCases}
                onEdit={editor.openExisting}
                onDelete={handleDelete}
                onApprove={handleApprove}
                onComplete={handleComplete}
                onClearLocalData={handleClearLocalData}
              />
            ) : (
              <InsightsView plans={plans} telemetryEvents={telemetryEvents} />
            )}
          </>
        )}
      </div>
    </main>
  );
}
