import { useRef, useState } from "react";
import type { PlanContent } from "@/lib/schemas/action-plan";
import type { StoredActionPlan } from "@/lib/types";
import {
  defaultSustainabilityCase,
  emptyGovernanceReview,
  emptyKpiProgress,
  emptyReadinessChecklist,
} from "../constants";
import { isDraftDirty } from "../domain/dirty";
import {
  checkDraftSavable,
  draftToContent,
  isReadyForApproval,
  lifecycleErrorMessages,
  planToContent,
  planToDraft,
  type LifecycleEvent,
} from "../domain/lifecycle";
import { hasCompleteCase, trimCase } from "../domain/plan-utils";
import { fetchPlan, generateActionPlan } from "../services/action-plan-api";
import type { ApiResult } from "../services/api-client";
import type { EditorDraft, EditorPanel } from "../types";

type PlanActions = {
  savePlan: (
    content: PlanContent,
    id: string | null,
    expectedVersion: number | null,
  ) => Promise<ApiResult<StoredActionPlan>>;
  transition: (
    id: string,
    event: LifecycleEvent,
    options: {
      expectedVersion: number;
      content?: PlanContent;
      comment?: string;
    },
  ) => Promise<ApiResult<StoredActionPlan>>;
};

const successMessages: Record<LifecycleEvent, string | null> = {
  approve: null,
  request_changes: "Changes requested. The plan was returned to its authors.",
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
    version: null,
    approved: false,
    completed: false,
    reviewStatus: "none",
    reviewComment: null,
    approvedBy: null,
    approvedAt: null,
    createdAt: null,
    updatedAt: null,
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
  // True after the server rejected a save because someone else changed the plan.
  const [hasConflict, setHasConflict] = useState(false);
  // The content as last loaded or saved, to tell real edits from none.
  const [baseline, setBaseline] = useState<PlanContent | null>(null);
  // Bumped whenever an editor opens or closes, so a slow response cannot
  // land on a different plan than the one it was requested for.
  const sessionRef = useRef(0);

  function clearMessages() {
    setErrorMessage(null);
    setSuccessMessage(null);
    setHasConflict(false);
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
    const empty = createEmptyDraft();

    setDraft(empty);
    setBaseline(draftToContent(empty));
  }

  function openExisting(plan: StoredActionPlan) {
    resetEditorState(plan.actionPlan ? "plan" : "case");
    setDraft(planToDraft(plan));
    setBaseline(planToContent(plan));
  }

  function close() {
    resetEditorState("case");
    setDraft(null);
    setBaseline(null);
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

    const result = await savePlan(
      draftToContent(draft),
      draft.id,
      draft.version,
    );

    if (session !== sessionRef.current) {
      return;
    }

    setIsSaving(false);

    if (!result.ok) {
      setErrorMessage(result.message);
      setHasConflict(result.code === "stale_write");
      return;
    }

    setDraft(planToDraft(result.data));
    setBaseline(planToContent(result.data));
    setSuccessMessage("Action plan saved.");
  }

  /**
   * Approve / complete / reset. Pending edits travel with the request and
   * are committed by the server in the same transaction as the transition.
   * A brand-new draft is saved first, so the plan exists before approval.
   */
  async function runLifecycleEvent(event: LifecycleEvent, comment?: string) {
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
    let version = draft.version ?? 1;

    if (!planId) {
      const created = await savePlan(content, null, null);

      if (session !== sessionRef.current) {
        return;
      }

      if (!created.ok) {
        setIsSaving(false);
        setErrorMessage(created.message);
        return;
      }

      planId = created.data.id;
      version = created.data.version;
      setDraft(planToDraft(created.data));
      setBaseline(planToContent(created.data));
    }

    const result = await transition(planId, event, {
      expectedVersion: version,
      content,
      comment,
    });

    if (session !== sessionRef.current) {
      return;
    }

    setIsSaving(false);

    if (!result.ok) {
      setErrorMessage(result.message);
      setHasConflict(result.code === "stale_write");

      if (result.code === "not_ready") {
        setActivePanel("case");
      }

      return;
    }

    setDraft(planToDraft(result.data));
    setBaseline(planToContent(result.data));
    setSuccessMessage(successMessages[event]);

    if (event === "approve") {
      setActivePanel("notes");
    } else if (event === "reset_approval") {
      setActivePanel("case");
    }
  }

  /** Replaces the draft with the server's current copy (discarding local edits). */
  async function reloadLatest() {
    if (!draft?.id) {
      return;
    }

    const session = sessionRef.current;
    const result = await fetchPlan(draft.id);

    if (session !== sessionRef.current) {
      return;
    }

    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }

    setDraft(planToDraft(result.data));
    setBaseline(planToContent(result.data));
    clearMessages();
    setSuccessMessage("Loaded the latest version.");
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

  function requestChanges(comment: string) {
    if (comment.trim().length === 0) {
      setErrorMessage(lifecycleErrorMessages.comment_required);
      setSuccessMessage(null);
      return;
    }

    void runLifecycleEvent("request_changes", comment.trim());
  }

  return {
    draft,
    activePanel,
    isGenerating,
    isSaving,
    errorMessage,
    successMessage,
    hasConflict,
    isDirty: isDraftDirty(draft, baseline),
    reloadLatest,
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
    requestChanges,
  };
}
