import type { ChangeResponse, SessionUser } from "@/lib/schemas/action-plan";
import { getEditorCapabilities } from "../domain/capabilities";
import { usePeople } from "../hooks/usePeople";
import { usePlanHistory } from "../hooks/usePlanHistory";
import type { EditorDraft, EditorPanel } from "../types";
import { AccountabilityFields } from "./AccountabilityFields";
import { CaseForm } from "./CaseForm";
import { EditorSection } from "./EditorSection";
import { EditorSummary } from "./EditorSummary";
import { EditorToolbar } from "./EditorToolbar";
import { GeneratedPlan } from "./GeneratedPlan";
import { KpiPanel } from "./KpiPanel";
import { PlanHistory } from "./PlanHistory";
import { PlanNotes } from "./PlanNotes";
import { PlanRevisions } from "./PlanRevisions";
import { RetrievalDiagnostics } from "./RetrievalDiagnostics";
import { ReadinessChecklist } from "./ReadinessChecklist";
import { primaryButtonClassName } from "./form-styles";

type ActionPlanEditorProps = {
  user: SessionUser;
  draft: EditorDraft;
  activePanel: EditorPanel;
  errorMessage: string | null;
  successMessage: string | null;
  isGenerating: boolean;
  isSaving: boolean;
  hasConflict: boolean;
  onReloadLatest: () => void;
  onBack: () => void;
  onDraftChange: (draft: EditorDraft) => void;
  onPanelChange: (panel: EditorPanel) => void;
  onGenerate: () => void;
  onSave: () => void;
  onApprove: () => void;
  onComplete: () => void;
  onResetApproval: () => void;
  onRequestChanges: (comment: string) => void;
  onResubmit: (responses: ChangeResponse[]) => void;
  onAcknowledgeDrift: (reason: string) => void;
};

export function ActionPlanEditor({
  user,
  draft,
  activePanel,
  errorMessage,
  successMessage,
  isGenerating,
  isSaving,
  hasConflict,
  onReloadLatest,
  onBack,
  onDraftChange,
  onPanelChange,
  onGenerate,
  onSave,
  onApprove,
  onComplete,
  onResetApproval,
  onRequestChanges,
  onResubmit,
  onAcknowledgeDrift,
}: ActionPlanEditorProps) {
  const capabilities = getEditorCapabilities(user, draft);
  const history = usePlanHistory(draft.id, draft.updatedAt);
  const people = usePeople();
  const isApprovedLocked = draft.approved;
  const caseReadOnly = !capabilities.canEditCore;

  function togglePanel(panel: EditorPanel, fallback: EditorPanel) {
    onPanelChange(activePanel === panel ? fallback : panel);
  }

  return (
    <section className="space-y-5">
      <EditorToolbar
        draft={draft}
        capabilities={capabilities}
        isSaving={isSaving}
        onBack={onBack}
        onSave={onSave}
        onApprove={onApprove}
        onComplete={onComplete}
        onResetApproval={onResetApproval}
      />

      <EditorSummary
        draft={draft}
        capabilities={capabilities}
        errorMessage={errorMessage}
        successMessage={successMessage}
        isGenerating={isGenerating}
        isSaving={isSaving}
        hasConflict={hasConflict}
        onGenerate={onGenerate}
        onReloadLatest={onReloadLatest}
        onRequestChanges={onRequestChanges}
        onResubmit={onResubmit}
        onAcknowledgeDrift={onAcknowledgeDrift}
      />

      <div className="space-y-4">
        <EditorSection
          label="Section 1"
          title="Operational Case Form"
          isOpen={activePanel === "case"}
          onToggle={() => togglePanel("case", "plan")}
        >
          <CaseForm
            value={draft.sustainabilityCase}
            disabled={caseReadOnly}
            onChange={(sustainabilityCase) =>
              onDraftChange({ ...draft, sustainabilityCase })
            }
          />
          <AccountabilityFields
            draft={draft}
            disabled={caseReadOnly}
            onDraftChange={onDraftChange}
          />
          <ReadinessChecklist
            draft={draft}
            disabled={caseReadOnly}
            onDraftChange={onDraftChange}
          />
          {capabilities.canGenerate ? (
            <button
              className={`${primaryButtonClassName} mt-5`}
              type="button"
              onClick={onGenerate}
              disabled={isGenerating || isSaving}
            >
              {isGenerating
                ? "Generating action plan..."
                : "Generate Action Plan"}
            </button>
          ) : null}
          {isApprovedLocked ? (
            <p className="mt-2 text-sm leading-6 text-stone-500">
              Reset approval before making changes or refreshing the AI output.
            </p>
          ) : null}
        </EditorSection>

        <EditorSection
          label="Section 2"
          title="Generated Action Plan"
          isOpen={activePanel === "plan"}
          isLocked={!draft.actionPlan}
          lockedMessage="Generate an action plan first to unlock this section."
          onToggle={() => togglePanel("plan", "case")}
        >
          {draft.actionPlan ? (
            <>
              {capabilities.canSave ? (
                <div className="mb-5 flex flex-col gap-3 rounded-lg border border-stone-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-stone-950">
                      Save this action plan
                    </p>
                    <p className="mt-1 text-sm leading-6 text-stone-600">
                      Saving records your changes and adds them to the plan
                      history.
                    </p>
                  </div>
                  <button
                    className="min-h-11 rounded-lg bg-stone-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                    type="button"
                    onClick={onSave}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : "Save Action Plan"}
                  </button>
                </div>
              ) : null}
              {!draft.id ? (
                <p className="mb-4 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-600">
                  Save the plan to start editing, assigning and tracking its
                  actions. The AI&apos;s output is recorded first, so every
                  later change is measured against it.
                </p>
              ) : null}
              <GeneratedPlan
                actionPlan={draft.actionPlan}
                governanceReview={draft.governanceReview}
                actionEditing={{
                  original: draft.originalAiOutput,
                  department: draft.sustainabilityCase.department,
                  people,
                  canEdit: capabilities.canEditActions,
                  canTrack: capabilities.canTrack,
                  onChange: (actionPlan) =>
                    onDraftChange({ ...draft, actionPlan }),
                }}
              />
              {capabilities.canViewDiagnostics && draft.id ? (
                <div className="mt-4">
                  <RetrievalDiagnostics planId={draft.id} />
                </div>
              ) : null}
            </>
          ) : null}
        </EditorSection>

        <EditorSection
          label="Section 3"
          title="KPI Progress"
          description="Use this section to record whether the action plan is producing measurable operational improvement."
          isOpen={activePanel === "kpi"}
          onToggle={() => togglePanel("kpi", "plan")}
        >
          <KpiPanel
            draft={draft}
            disabled={!capabilities.canEditKpi}
            disabledReason={
              draft.completed
                ? "KPI progress is read-only once the action plan is marked done."
                : "Your role can view KPI progress but not change it."
            }
            onDraftChange={onDraftChange}
          />
        </EditorSection>

        <EditorSection
          label="Section 4"
          title="Action Notes"
          isOpen={activePanel === "notes"}
          isLocked={!draft.approved}
          lockedMessage="Approve this action plan to unlock implementation notes."
          onToggle={() => togglePanel("notes", "plan")}
        >
          <PlanNotes planId={draft.id} canAdd={capabilities.canAddNotes} />
        </EditorSection>

        <EditorSection
          label="Section 5"
          title="History"
          description="Who did what, and when. Recorded by the server."
          isOpen={activePanel === "history"}
          isLocked={!draft.id}
          lockedMessage="Save the plan to start its history."
          onToggle={() => togglePanel("history", "plan")}
        >
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.13em] text-stone-700">
            Versions
          </h3>
          <PlanRevisions
            planId={draft.id}
            version={draft.version}
            approvedVersion={draft.approvedVersion}
            people={people}
          />
          <h3 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-[0.13em] text-stone-700">
            Activity
          </h3>
          <PlanHistory events={history.events} error={history.error} />
        </EditorSection>
      </div>
    </section>
  );
}
