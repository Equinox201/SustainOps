import { useRef, useState } from "react";
import type { PlanContent } from "@/lib/schemas/action-plan";
import type { StoredActionPlan } from "@/lib/types";
import {
  defaultSustainabilityCase,
  emptyGovernanceReview,
  emptyKpiProgress,
  emptyReadinessChecklist,
} from "../constants";
import {
  checkDraftSavable,
  draftToContent,
  isReadyForApproval,
  lifecycleErrorMessages,
  planToDraft,
  type LifecycleEvent,
} from "../domain/lifecycle";
import { hasCompleteCase, trimCase } from "../domain/plan-utils";
import { generateActionPlan } from "../services/action-plan-api";
import type { ApiResult } from "../services/api-client";
import type { EditorDraft, EditorPanel } from "../types";

type PlanActions = {
  savePlan: (
    content: PlanContent,
    id: string | null,
  ) => Promise<ApiResult<StoredActionPlan>>;
  transition: (
    id: string,
    event: LifecycleEvent,
    content?: PlanContent,
  ) => Promise<ApiResult<StoredActionPlan>>;
};

const successMessages: Record<LifecycleEvent, string | null> = {
  approve: null,
  complete: null,
  reset_approval:
    "Approval reset. Changes require a new approval before implementation.",
};

function createEmptyDraft(): EditorDraft {
  return {
    id: null,
    sustainabilityCase: defaultSustainabilityCase,
    actionPlan: null,
    generationId: null,
    governanceReview: emptyGovernanceReview,
    actionNotes: "",
    owner: "",
    priority: "Medium",
    targetDate: "",
    nextReviewDate: "",
    readinessChecklist: { ...emptyReadinessChecklist },
    kpiProgress: { ...emptyKpiProgress },
    approved: false,
    completed: false,
    createdAt: null,
  };
}

/** Editor state for one action plan: the draft, its panels, and its actions. */
export function useActionPlanEditor({ savePlan, transition }: PlanActions) {
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [activePanel, setActivePanel] = useState<EditorPanel>("case");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Bumped whenever an editor opens or closes, so a slow response cannot
  // land on a different plan than the one it was requested for.
  const sessionRef = useRef(0);

  function clearMessages() {
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function resetEditorState(panel: EditorPanel) {
    sessionRef.current += 1;
    setActivePanel(panel);
    setIsGenerating(false);
    setIsSaving(false);
    clearMessages();
  }

  function openNew() {
    resetEditorState("case");
    setDraft(createEmptyDraft());
  }

  function openExisting(plan: StoredActionPlan) {
    resetEditorState(plan.actionPlan ? "plan" : "case");
    setDraft(planToDraft(plan));
  }

  function close() {
    resetEditorState("case");
    setDraft(null);
  }

  function updateDraft(nextDraft: EditorDraft) {
    setDraft(nextDraft);
    setSuccessMessage(null);
  }

  async function generate() {
    if (!draft) {
      return;
    }

    if (draft.approved) {
      setErrorMessage(
        "This action plan is approved and locked. Reset approval before regenerating.",
      );
      setSuccessMessage(null);
      return;
    }

    if (!hasCompleteCase(draft.sustainabilityCase)) {
      setErrorMessage(
        "Please complete all required fields before generating an action plan.",
      );
      return;
    }

    const session = sessionRef.current;
    const sustainabilityCase = trimCase(draft.sustainabilityCase);

    clearMessages();
    setIsGenerating(true);

    const result = await generateActionPlan(sustainabilityCase, draft.id);

    if (session !== sessionRef.current) {
      return;
    }

    setIsGenerating(false);

    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }

    const { actionPlan, generation } = result.data;

    setDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            sustainabilityCase,
            actionPlan,
            generationId: generation.id,
            approved: false,
            completed: false,
            governanceReview: {
              humanReviewRequired: true,
              containsGuestPersonalData: false,
              approvedOperationalUse: false,
              reviewerStatus: "Pending",
              auditTimestamp: generation.generatedAt,
            },
          }
        : currentDraft,
    );
    setActivePanel("plan");
  }

  async function save() {
    if (!draft) {
      return;
    }

    const problem = checkDraftSavable(draft);

    if (problem) {
      setErrorMessage(lifecycleErrorMessages[problem]);
      setSuccessMessage(null);
      return;
    }

    const session = sessionRef.current;

    clearMessages();
    setIsSaving(true);

    const result = await savePlan(draftToContent(draft), draft.id);

    if (session !== sessionRef.current) {
      return;
    }

    setIsSaving(false);

    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }

    setDraft(planToDraft(result.data));
    setSuccessMessage("Action plan saved.");
  }

  /**
   * Approve / complete / reset. Pending edits travel with the request and
   * are committed by the server in the same transaction as the transition.
   * A brand-new draft is saved first, so the plan exists before approval.
   */
  async function runLifecycleEvent(event: LifecycleEvent) {
    if (!draft) {
      return;
    }

    const problem = checkDraftSavable(draft);

    if (problem) {
      setErrorMessage(lifecycleErrorMessages[problem]);
      setSuccessMessage(null);
      return;
    }

    if (event === "approve" && !isReadyForApproval(draft)) {
      setErrorMessage(lifecycleErrorMessages.not_ready);
      setSuccessMessage(null);
      setActivePanel("case");
      return;
    }

    const session = sessionRef.current;
    const content = draftToContent(draft);

    clearMessages();
    setIsSaving(true);

    let planId = draft.id;

    if (!planId) {
      const created = await savePlan(content, null);

      if (session !== sessionRef.current) {
        return;
      }

      if (!created.ok) {
        setIsSaving(false);
        setErrorMessage(created.message);
        return;
      }

      planId = created.data.id;
      setDraft(planToDraft(created.data));
    }

    const result = await transition(planId, event, content);

    if (session !== sessionRef.current) {
      return;
    }

    setIsSaving(false);

    if (!result.ok) {
      setErrorMessage(result.message);

      if (result.code === "not_ready") {
        setActivePanel("case");
      }

      return;
    }

    setDraft(planToDraft(result.data));
    setSuccessMessage(successMessages[event]);

    if (event === "approve") {
      setActivePanel("notes");
    } else if (event === "reset_approval") {
      setActivePanel("case");
    }
  }

  function approve() {
    void runLifecycleEvent("approve");
  }

  function complete() {
    if (
      !draft ||
      !draft.approved ||
      draft.completed ||
      !window.confirm("Mark this sustainability action plan as done?")
    ) {
      return;
    }

    void runLifecycleEvent("complete");
  }

  function resetApproval() {
    void runLifecycleEvent("reset_approval");
  }

  return {
    draft,
    activePanel,
    isGenerating,
    isSaving,
    errorMessage,
    successMessage,
    setActivePanel,
    openNew,
    openExisting,
    close,
    updateDraft,
    generate,
    save,
    approve,
    complete,
    resetApproval,
  };
}
