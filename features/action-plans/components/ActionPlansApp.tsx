"use client";

import { useEffect, useState } from "react";
import type { SessionUser } from "@/lib/schemas/action-plan";
import { can } from "../domain/permissions";
import { NEW_PLAN_SEGMENT, planPath } from "../domain/routes";
import { useActionPlanEditor } from "../hooks/useActionPlanEditor";
import { useActionPlans } from "../hooks/useActionPlans";
import { useAuditEvents } from "../hooks/useAuditEvents";
import { usePlanRoute } from "../hooks/usePlanRoute";
import { useSession } from "../hooks/useSession";
import type { MainView } from "../types";
import { ActionPlanEditor } from "./ActionPlanEditor";
import { ActionPlanList } from "./ActionPlanList";
import { AppHeader } from "./AppHeader";
import { DemoNotice } from "./DemoNotice";
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
    resetDemo,
  } = useActionPlans();
  const editor = useActionPlanEditor({ savePlan, transition });
  const route = usePlanRoute();
  const openId = route.routePlanId;
  const canViewInsights = can(user, "audit:view");

  const editorPlanId = editor.draft?.id ?? null;
  const hasDraft = editor.draft !== null;
  const { isDirty } = editor;

  // URL -> editor: the address decides which plan is open, so deep links,
  // Back/Forward and refreshes all land in the right place.
  useEffect(() => {
    if (loadState !== "ready") {
      return;
    }

    if (openId === null) {
      if (hasDraft) {
        editor.close();
      }

      return;
    }

    if (openId === NEW_PLAN_SEGMENT) {
      if (!hasDraft && can(user, "plan:create")) {
        editor.openNew();
      }

      return;
    }

    if (editorPlanId === openId) {
      return;
    }

    const plan = plans.find((candidate) => candidate.id === openId);

    if (!plan) {
      return;
    }

    if (
      isDirty &&
      !window.confirm(
        "You have unsaved changes. Leave this plan and discard them?",
      )
    ) {
      // Stay put: restore the address of the plan that is still open.
      route.navigate(planPath(editorPlanId));
      return;
    }

    editor.openExisting(plan);
    // The editor and route objects are recreated every render; only the
    // values below should re-run this synchronisation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, loadState, plans, hasDraft, editorPlanId]);

  // A new plan gets its real address as soon as it has an id.
  useEffect(() => {
    if (openId === NEW_PLAN_SEGMENT && editorPlanId) {
      route.navigate(planPath(editorPlanId), "replace");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, editorPlanId]);

  // Browser-level guard for reload / closing the tab with unsaved edits.
  useEffect(() => {
    if (!isDirty) {
      return;
    }

    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  function leaveEditor() {
    if (
      isDirty &&
      !window.confirm("You have unsaved changes. Leave and discard them?")
    ) {
      return;
    }

    route.navigate("/");
  }

  const planMissing =
    loadState === "ready" &&
    openId !== null &&
    openId !== NEW_PLAN_SEGMENT &&
    !hasDraft &&
    !plans.some((plan) => plan.id === openId);
  const {
    events: auditEvents,
    error: auditError,
    isLoading: auditLoading,
  } = useAuditEvents(
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

  async function handleResetDemo() {
    if (
      !window.confirm(
        "Reset the demo? Every plan and its history will be replaced with the original fictional demo plans.",
      )
    ) {
      return;
    }

    const result = await resetDemo();
    setNotice(result.ok ? "Demo data was reset." : result.message);
  }

  async function handleApprove(planId: string) {
    const plan = plans.find((currentPlan) => currentPlan.id === planId);

    if (!plan) {
      return;
    }

    const result = await transition(planId, "approve", {
      expectedVersion: plan.version,
    });
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

    const result = await transition(planId, "complete", {
      expectedVersion: plan.version,
    });
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
            hasConflict={editor.hasConflict}
            onReloadLatest={editor.reloadLatest}
            onBack={leaveEditor}
            onDraftChange={editor.updateDraft}
            onPanelChange={editor.setActivePanel}
            onGenerate={editor.generate}
            onSave={editor.save}
            onApprove={editor.approve}
            onComplete={editor.complete}
            onResetApproval={editor.resetApproval}
            onRequestChanges={editor.requestChanges}
            onResubmit={editor.resubmit}
            onAcknowledgeDrift={editor.acknowledgeDrift}
          />
        ) : (
          <>
            <DemoNotice />

            <AppHeader
              user={user}
              currentMainView={currentMainView}
              canCreate={can(user, "plan:create")}
              canViewInsights={canViewInsights}
              onViewChange={setCurrentMainView}
              onCreate={() => route.navigate(planPath(null))}
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

            {planMissing ? (
              <div
                role="alert"
                className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950"
              >
                <p className="font-semibold">Plan not found</p>
                <p>
                  This plan does not exist, was deleted by the nightly demo
                  reset, or your role cannot see it.
                </p>
                <button
                  className="mt-2 font-semibold underline underline-offset-4"
                  type="button"
                  onClick={() => route.navigate("/")}
                >
                  Back to action plans
                </button>
              </div>
            ) : null}

            {loadState === "ready" &&
            currentMainView === "actionPlans" &&
            !planMissing ? (
              <ActionPlanList
                user={user}
                plans={plans}
                filters={route.filters}
                onFiltersChange={route.setFilters}
                onCreate={() => route.navigate(planPath(null))}
                onLoadDemoCases={handleLoadDemoCases}
                onEdit={(plan) => route.navigate(planPath(plan.id))}
                onDelete={handleDelete}
                onApprove={handleApprove}
                onComplete={handleComplete}
                onResetDemo={handleResetDemo}
              />
            ) : null}

            {loadState === "ready" &&
            currentMainView === "insights" &&
            canViewInsights ? (
              <>
                {auditError ? (
                  <p className="text-sm text-rose-900">{auditError}</p>
                ) : null}
                <InsightsView
                  plans={plans}
                  auditEvents={auditEvents}
                  auditLoading={auditLoading}
                />
              </>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
