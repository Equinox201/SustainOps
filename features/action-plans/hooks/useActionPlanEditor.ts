import { useRef, useState } from "react";
import {
  defaultSustainabilityCase,
  emptyGovernanceReview,
  emptyKpiProgress,
  emptyReadinessChecklist,
} from "../constants";
import {
  draftToPlan,
  lifecycleErrorMessages,
  planToDraft,
  type LifecycleEvent,
  type LifecycleResult,
} from "../domain/lifecycle";
import { hasCompleteCase, trimCase } from "../domain/plan-utils";
import { generateActionPlan } from "../services/action-plan-api";
import type { EditorDraft, EditorPanel } from "../types";
import type { StoredActionPlan } from "@/lib/types";
import type { RecordTelemetry } from "./useTelemetry";

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
export function useActionPlanEditor({
  savePlan,
  transition,
  recordTelemetry,
}: {
  savePlan: (plan: StoredActionPlan) => void;
  transition: (
    plan: StoredActionPlan,
    event: LifecycleEvent,
  ) => LifecycleResult;
  recordTelemetry: RecordTelemetry;
}) {
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [activePanel, setActivePanel] = useState<EditorPanel>("case");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Bumped whenever an editor opens or closes, so a slow AI response cannot
  // land on a different plan than the one it was requested for.
  const sessionRef = useRef(0);

  function clearMessages() {
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function openNew() {
    sessionRef.current += 1;
    recordTelemetry({
      eventName: "action_plan_created",
      department: defaultSustainabilityCase.department,
    });
    setDraft(createEmptyDraft());
    setActivePanel("case");
    setIsGenerating(false);
    clearMessages();
  }

  function openExisting(plan: StoredActionPlan) {
    sessionRef.current += 1;
    setDraft(planToDraft(plan));
    setActivePanel(plan.actionPlan ? "plan" : "case");
    setIsGenerating(false);
    clearMessages();
  }

  function close() {
    sessionRef.current += 1;
    setDraft(null);
    setActivePanel("case");
    setIsGenerating(false);
    clearMessages();
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

    const result = await generateActionPlan(sustainabilityCase);

    if (session !== sessionRef.current) {
      return;
    }

    setIsGenerating(false);

    if (!result.ok) {
      setErrorMessage(result.error);
      return;
    }

    setDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            sustainabilityCase,
            actionPlan: result.actionPlan,
            approved: false,
            completed: false,
            governanceReview: {
              humanReviewRequired: result.actionPlan.humanReviewRequired,
              containsGuestPersonalData: false,
              approvedOperationalUse: false,
              reviewerStatus: "Pending",
              auditTimestamp: new Date().toISOString(),
            },
          }
        : currentDraft,
    );
    setActivePanel("plan");
    recordTelemetry({
      eventName: "action_plan_generated",
      planId: draft.id ?? undefined,
      department: sustainabilityCase.department,
    });
  }

  function save() {
    if (!draft) {
      return;
    }

    const result = draftToPlan(draft, new Date().toISOString());

    if (!result.ok) {
      setErrorMessage(lifecycleErrorMessages[result.error]);
      setSuccessMessage(null);
      return;
    }

    savePlan(result.plan);
    setDraft(planToDraft(result.plan));
    setErrorMessage(null);
    setSuccessMessage("Action plan saved locally.");
  }

  /**
   * Approve / complete / reset. Any edits in the editor are saved together
   * with the transition, so what the reviewer sees is exactly what is stored.
   */
  function runLifecycleEvent(event: LifecycleEvent) {
    if (!draft) {
      return;
    }

    const saved = draftToPlan(draft, new Date().toISOString());

    if (!saved.ok) {
      setErrorMessage(lifecycleErrorMessages[saved.error]);
      setSuccessMessage(null);
      return;
    }

    const result = transition(saved.plan, event);

    if (!result.ok) {
      setErrorMessage(lifecycleErrorMessages[result.error]);
      setSuccessMessage(null);

      if (result.error === "not_ready") {
        setActivePanel("case");
      }

      return;
    }

    setDraft(planToDraft(result.plan));
    setErrorMessage(null);
    setSuccessMessage(successMessages[event]);

    if (event === "approve") {
      setActivePanel("notes");
    } else if (event === "reset_approval") {
      setActivePanel("case");
    }
  }

  function approve() {
    runLifecycleEvent("approve");
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

    runLifecycleEvent("complete");
  }

  function resetApproval() {
    runLifecycleEvent("reset_approval");
  }

  return {
    draft,
    activePanel,
    isGenerating,
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
