import { useCallback, useEffect, useState } from "react";
import type { PlanContent } from "@/lib/schemas/action-plan";
import type { StoredActionPlan } from "@/lib/types";
import type { LifecycleEvent } from "../domain/lifecycle";
import * as api from "../services/action-plan-api";

type LoadState = "loading" | "ready" | "error";

/**
 * Saved action plans, held in React state and backed by the server.
 *
 * The server is the source of truth: every mutation waits for the server to
 * confirm and then replaces the local copy with what the server returned.
 */
export function useActionPlans() {
  const [plans, setPlans] = useState<StoredActionPlan[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await api.fetchPlans();

    if (result.ok) {
      setPlans(result.data);
      setLoadError(null);
      setLoadState("ready");
    } else {
      setLoadError(result.message);
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    api.fetchPlans().then((result) => {
      if (!isActive) {
        return;
      }

      if (result.ok) {
        setPlans(result.data);
        setLoadState("ready");
      } else {
        setLoadError(result.message);
        setLoadState("error");
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  const upsertLocal = useCallback((plan: StoredActionPlan) => {
    setPlans((currentPlans) =>
      currentPlans.some((currentPlan) => currentPlan.id === plan.id)
        ? currentPlans.map((currentPlan) =>
            currentPlan.id === plan.id ? plan : currentPlan,
          )
        : [plan, ...currentPlans],
    );
  }, []);

  const savePlan = useCallback(
    async (content: PlanContent, id: string | null) => {
      const result = id
        ? await api.updatePlan(id, content)
        : await api.createPlan(content);

      if (result.ok) {
        upsertLocal(result.data);
      }

      return result;
    },
    [upsertLocal],
  );

  const transition = useCallback(
    async (
      id: string,
      event: LifecycleEvent,
      options: { content?: PlanContent; comment?: string } = {},
    ) => {
      const result = await api.transitionPlan(id, event, options);

      if (result.ok) {
        upsertLocal(result.data);
      }

      return result;
    },
    [upsertLocal],
  );

  const deletePlan = useCallback(async (id: string) => {
    const result = await api.deletePlan(id);

    if (result.ok) {
      setPlans((currentPlans) =>
        currentPlans.filter((plan) => plan.id !== id),
      );
    }

    return result;
  }, []);

  const loadDemoPlans = useCallback(async () => {
    const result = await api.loadDemoPlans();

    if (result.ok) {
      setPlans(result.data.plans);
    }

    return result;
  }, []);

  const resetDemo = useCallback(async () => {
    const result = await api.resetDemo();

    if (result.ok) {
      await refresh();
    }

    return result;
  }, [refresh]);

  return {
    plans,
    loadState,
    loadError,
    refresh,
    savePlan,
    transition,
    deletePlan,
    loadDemoPlans,
    resetDemo,
  };
}
