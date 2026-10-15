import { useEffect, useState } from "react";
import type { AuditEvent } from "@/lib/types";
import { fetchPlanHistory } from "../services/action-plan-api";

/**
 * The audit history of one plan. Reloads whenever `version` changes (pass the
 * plan's updatedAt), so new events appear right after a save or decision.
 */
export function usePlanHistory(planId: string | null, version: string | null) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!planId) {
      return;
    }

    let isActive = true;

    fetchPlanHistory(planId).then((result) => {
      if (!isActive) {
        return;
      }

      if (result.ok) {
        setEvents(result.data);
        setError(null);
      } else {
        setError(result.message);
      }
    });

    return () => {
      isActive = false;
    };
  }, [planId, version]);

  return { events: planId ? events : [], error };
}
