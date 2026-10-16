import { useCallback, useEffect, useState } from "react";
import type { PlanNote } from "@/lib/types";
import { addPlanNote, fetchPlanNotes } from "../services/action-plan-api";

/** A plan's append-only implementation notes. */
export function usePlanNotes(planId: string | null) {
  const [notes, setNotes] = useState<PlanNote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!planId) {
      return;
    }

    let isActive = true;

    fetchPlanNotes(planId).then((result) => {
      if (!isActive) {
        return;
      }

      if (result.ok) {
        setNotes(result.data);
        setError(null);
      } else {
        setError(result.message);
      }
    });

    return () => {
      isActive = false;
    };
  }, [planId]);

  const add = useCallback(
    async (body: string) => {
      if (!planId) {
        return false;
      }

      setIsSaving(true);
      const result = await addPlanNote(planId, body);
      setIsSaving(false);

      if (!result.ok) {
        setError(result.message);
        return false;
      }

      setError(null);
      setNotes((current) => [...current, result.data]);

      return true;
    },
    [planId],
  );

  return { notes: planId ? notes : [], error, isSaving, add };
}
