import { useCallback } from "react";
import { demoActionPlans } from "@/lib/demo-plans";
import type { StoredActionPlan, TelemetryEventName } from "@/lib/types";
import {
  transitionPlan,
  type LifecycleEvent,
  type LifecycleResult,
} from "../domain/lifecycle";
import { copyActionPlan } from "../domain/plan-utils";
import {
  readStoredActionPlans,
  writeStoredActionPlans,
} from "../storage/action-plan-storage";
import type { RecordTelemetry } from "./useTelemetry";
import { usePersistedList } from "./usePersistedList";

const lifecycleTelemetry: Record<LifecycleEvent, TelemetryEventName> = {
  approve: "action_plan_approved",
  complete: "action_plan_marked_done",
  reset_approval: "approval_reset",
};

function hasKpiProgress(plan: StoredActionPlan) {
  return Object.values(plan.kpiProgress).some(
    (value) => value.trim().length > 0,
  );
}

/**
 * The single owner of saved action plans.
 *
 * Every mutation (save, lifecycle transition, delete) writes a complete plan
 * and records its telemetry only after the change has been applied.
 */
export function useActionPlans({
  recordTelemetry,
}: {
  recordTelemetry: RecordTelemetry;
}) {
  const { items: plans, setItems: setPlans, reset } = usePersistedList({
    read: readStoredActionPlans,
    write: writeStoredActionPlans,
  });

  const upsertPlan = useCallback(
    (plan: StoredActionPlan) => {
      setPlans((currentPlans) =>
        currentPlans.some((currentPlan) => currentPlan.id === plan.id)
          ? currentPlans.map((currentPlan) =>
              currentPlan.id === plan.id ? plan : currentPlan,
            )
          : [plan, ...currentPlans],
      );
    },
    [setPlans],
  );

  /** Persists a plan (create or update) and records what changed. */
  const savePlan = useCallback(
    (plan: StoredActionPlan) => {
      const department = plan.sustainabilityCase.department;

      upsertPlan(plan);
      recordTelemetry({
        eventName: "action_plan_saved",
        planId: plan.id,
        department,
      });

      if (plan.actionNotes.trim().length > 0) {
        recordTelemetry({
          eventName: "action_notes_updated",
          planId: plan.id,
          department,
        });
      }

      if (hasKpiProgress(plan)) {
        recordTelemetry({
          eventName: "kpi_progress_updated",
          planId: plan.id,
          department,
        });
      }
    },
    [recordTelemetry, upsertPlan],
  );

  /**
   * Applies approve / complete / reset to a plan and persists the result in
   * the same step, so the stored record can never lag behind the UI.
   */
  const transition = useCallback(
    (plan: StoredActionPlan, event: LifecycleEvent): LifecycleResult => {
      const result = transitionPlan(plan, event, new Date().toISOString());

      if (result.ok) {
        upsertPlan(result.plan);
        recordTelemetry({
          eventName: lifecycleTelemetry[event],
          planId: plan.id,
          department: plan.sustainabilityCase.department,
        });
      }

      return result;
    },
    [recordTelemetry, upsertPlan],
  );

  const deletePlan = useCallback(
    (planId: string) => {
      const plan = plans.find((currentPlan) => currentPlan.id === planId);

      if (!plan) {
        return;
      }

      setPlans((currentPlans) =>
        currentPlans.filter((currentPlan) => currentPlan.id !== planId),
      );
      recordTelemetry({
        eventName: "action_plan_deleted",
        planId,
        department: plan.sustainabilityCase.department,
      });
    },
    [plans, recordTelemetry, setPlans],
  );

  const newDemoPlans = demoActionPlans.filter(
    (demoPlan) => !plans.some((plan) => plan.id === demoPlan.id),
  );

  /** Adds the demo plans that are not already in the list. */
  const loadDemoPlans = useCallback(() => {
    if (newDemoPlans.length === 0) {
      return;
    }

    setPlans((currentPlans) => [
      ...newDemoPlans.map(copyActionPlan),
      ...currentPlans,
    ]);
    recordTelemetry({ eventName: "demo_cases_loaded" });
  }, [newDemoPlans, recordTelemetry, setPlans]);

  return {
    plans,
    newDemoPlanCount: newDemoPlans.length,
    savePlan,
    transition,
    deletePlan,
    loadDemoPlans,
    resetPlans: reset,
  };
}
