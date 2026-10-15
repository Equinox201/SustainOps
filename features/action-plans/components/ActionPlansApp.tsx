"use client";

import { useState } from "react";
import type { SessionUser } from "@/lib/schemas/action-plan";
import { can } from "../domain/permissions";
import { useActionPlanEditor } from "../hooks/useActionPlanEditor";
import { useActionPlans } from "../hooks/useActionPlans";
import { useAuditEvents } from "../hooks/useAuditEvents";
import { useSession } from "../hooks/useSession";
import type { MainView } from "../types";
import { ActionPlanEditor } from "./ActionPlanEditor";
import { ActionPlanList } from "./ActionPlanList";
import { AppHeader } from "./AppHeader";
import { InsightsView } from "./InsightsView";
import { SignIn } from "./SignIn";

export default function ActionPlansApp() {
  const { state, signIn, signOut } = useSession();

  if (state.status === "loading") {
    return (
      <main className="min-h-screen bg-[#f7f3ec] px-5 py-10 text-sm text-stone-600">
        Loading…
      </main>
    );
  }

  if (state.status === "signed_out") {
    return <SignIn error={state.error} onSignIn={signIn} />;
  }

  // Keyed by user so switching persona starts from a clean slate.
  return (
    <Workspace key={state.user.id} user={state.user} onSignOut={signOut} />
  );
}

function Workspace({
  user,
  onSignOut,
}: {
  user: SessionUser;
  onSignOut: () => void;
}) {
  const [currentMainView, setCurrentMainView] =
    useState<MainView>("actionPlans");
  const [notice, setNotice] = useState<string | null>(null);
  const {
    plans,
    loadState,
    loadError,
    refresh,
    savePlan,
    transition,
    deletePlan,
    loadDemoPlans,
  } = useActionPlans();
  const editor = useActionPlanEditor({ savePlan, transition });
  const canViewInsights = can(user, "audit:view");
  const { events: auditEvents, error: auditError } = useAuditEvents(
    canViewInsights && currentMainView === "insights" && !editor.draft,
  );

  async function handleDelete(planId: string) {
    if (!window.confirm("Delete this sustainability action plan?")) {
      return;
    }

    const result = await deletePlan(planId);
    setNotice(result.ok ? null : result.message);
  }

  async function handleLoadDemoCases() {
    const result = await loadDemoPlans();

    if (!result.ok) {
      setNotice(result.message);
      return;
    }

    setNotice(
      result.data.added === 0 ? "Demo action plans are already loaded." : null,
    );
  }

  async function handleApprove(planId: string) {
    const result = await transition(planId, "approve");
    setNotice(result.ok ? null : result.message);
  }

  async function handleComplete(planId: string) {
    const plan = plans.find((currentPlan) => currentPlan.id === planId);

    if (
      !plan ||
      !plan.approved ||
      plan.completed ||
      !window.confirm("Mark this sustainability action plan as done?")
    ) {
      return;
    }

    const result = await transition(planId, "complete");
    setNotice(result.ok ? null : result.message);
  }

  return (
    <main className="min-h-screen bg-[#f7f3ec] text-stone-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
        {editor.draft ? (
          <ActionPlanEditor
            user={user}
            draft={editor.draft}
            activePanel={editor.activePanel}
            errorMessage={editor.errorMessage}
            successMessage={editor.successMessage}
            isGenerating={editor.isGenerating}
            isSaving={editor.isSaving}
            onBack={editor.close}
            onDraftChange={editor.updateDraft}
            onPanelChange={editor.setActivePanel}
            onGenerate={editor.generate}
            onSave={editor.save}
            onApprove={editor.approve}
            onComplete={editor.complete}
            onResetApproval={editor.resetApproval}
            onRequestChanges={editor.requestChanges}
          />
        ) : (
          <>
            <AppHeader
              user={user}
              currentMainView={currentMainView}
              canCreate={can(user, "plan:create")}
              canViewInsights={canViewInsights}
              onViewChange={setCurrentMainView}
              onCreate={editor.openNew}
              onSignOut={onSignOut}
            />

            {notice ? (
              <div
                role="alert"
                className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
              >
                {notice}
              </div>
            ) : null}

            {loadState === "loading" ? (
              <p className="text-sm text-stone-600">Loading action plans…</p>
            ) : null}

            {loadState === "error" ? (
              <div
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900"
              >
                <p>Action plans could not be loaded. {loadError}</p>
                <button
                  className="mt-2 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-semibold"
                  type="button"
                  onClick={() => void refresh()}
                >
                  Try again
                </button>
              </div>
            ) : null}

            {loadState === "ready" && currentMainView === "actionPlans" ? (
              <ActionPlanList
                user={user}
                plans={plans}
                onCreate={editor.openNew}
                onLoadDemoCases={handleLoadDemoCases}
                onEdit={editor.openExisting}
                onDelete={handleDelete}
                onApprove={handleApprove}
                onComplete={handleComplete}
              />
            ) : null}

            {loadState === "ready" &&
            currentMainView === "insights" &&
            canViewInsights ? (
              <>
                {auditError ? (
                  <p className="text-sm text-rose-900">{auditError}</p>
                ) : null}
                <InsightsView plans={plans} auditEvents={auditEvents} />
              </>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
