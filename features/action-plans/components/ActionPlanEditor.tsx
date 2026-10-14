import type { EditorDraft, EditorPanel } from "../types";
import { AccountabilityFields } from "./AccountabilityFields";
import { CaseForm } from "./CaseForm";
import { EditorSection } from "./EditorSection";
import { EditorSummary } from "./EditorSummary";
import { EditorToolbar } from "./EditorToolbar";
import { GeneratedPlan } from "./GeneratedPlan";
import { ImplementationNotes } from "./ImplementationNotes";
import { KpiPanel } from "./KpiPanel";
import { LockedNotice } from "./LockedNotice";
import { ReadinessChecklist } from "./ReadinessChecklist";
import { primaryButtonClassName } from "./form-styles";

type ActionPlanEditorProps = {
  draft: EditorDraft;
  activePanel: EditorPanel;
  errorMessage: string | null;
  successMessage: string | null;
  isGenerating: boolean;
  onBack: () => void;
  onDraftChange: (draft: EditorDraft) => void;
  onPanelChange: (panel: EditorPanel) => void;
  onGenerate: () => void;
  onSave: () => void;
  onApprove: () => void;
  onComplete: () => void;
  onResetApproval: () => void;
};

export function ActionPlanEditor({
  draft,
  activePanel,
  errorMessage,
  successMessage,
  isGenerating,
  onBack,
  onDraftChange,
  onPanelChange,
  onGenerate,
  onSave,
  onApprove,
  onComplete,
  onResetApproval,
}: ActionPlanEditorProps) {
  const isApprovedLocked = draft.approved;

  function togglePanel(panel: EditorPanel, fallback: EditorPanel) {
    onPanelChange(activePanel === panel ? fallback : panel);
  }

  return (
    <section className="space-y-5">
      <EditorToolbar
        draft={draft}
        onBack={onBack}
        onSave={onSave}
        onApprove={onApprove}
        onComplete={onComplete}
        onResetApproval={onResetApproval}
      />

      <EditorSummary
        draft={draft}
        errorMessage={errorMessage}
        successMessage={successMessage}
        isGenerating={isGenerating}
        onGenerate={onGenerate}
        onApprove={onApprove}
        onComplete={onComplete}
      />

      <div className="space-y-4">
        <EditorSection
          label="Section 1"
          title="Operational Case Form"
          isOpen={activePanel === "case"}
          onToggle={() => togglePanel("case", "plan")}
        >
          {isApprovedLocked ? <LockedNotice className="mb-5" /> : null}
          <CaseForm
            value={draft.sustainabilityCase}
            disabled={isApprovedLocked}
            onChange={(sustainabilityCase) =>
              onDraftChange({ ...draft, sustainabilityCase })
            }
          />
          <AccountabilityFields
            draft={draft}
            disabled={isApprovedLocked}
            onDraftChange={onDraftChange}
          />
          <ReadinessChecklist
            draft={draft}
            disabled={isApprovedLocked}
            onDraftChange={onDraftChange}
          />
          <button
            className={`${primaryButtonClassName} mt-5`}
            type="button"
            onClick={onGenerate}
            disabled={isGenerating || isApprovedLocked}
          >
            {isGenerating ? "Generating action plan..." : "Generate Action Plan"}
          </button>
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
              {isApprovedLocked ? <LockedNotice className="mb-5" /> : null}
              <div className="mb-5 flex flex-col gap-3 rounded-lg border border-stone-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-stone-950">
                    Save this generated action plan
                  </p>
                  <p className="mt-1 text-sm leading-6 text-stone-600">
                    Save Action Plan records this AI output so it appears in the
                    action-plan list.
                  </p>
                </div>
                <button
                  className="min-h-11 rounded-lg bg-stone-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800"
                  type="button"
                  onClick={onSave}
                >
                  Save Action Plan
                </button>
              </div>
              <GeneratedPlan
                actionPlan={draft.actionPlan}
                governanceReview={draft.governanceReview}
              />
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
            disabled={draft.completed}
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
          <ImplementationNotes draft={draft} onDraftChange={onDraftChange} />
        </EditorSection>
      </div>
    </section>
  );
}
