import { useEffect, useState } from "react";
import type { PlanRevision, PlanRevisionSummary } from "@/lib/types";
import { fetchRevision, fetchRevisions } from "../services/action-plan-api";

/** The versions a plan has had. Reloads when `version` changes. */
export function usePlanRevisions(
  planId: string | null,
  version: number | null,
) {
  const [revisions, setRevisions] = useState<PlanRevisionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!planId) {
      return;
    }

    let isActive = true;

    fetchRevisions(planId).then((result) => {
      if (!isActive) {
        return;
      }

      if (result.ok) {
        setRevisions(result.data);
        setError(null);
      } else {
        setError(result.message);
      }
    });

    return () => {
      isActive = false;
    };
  }, [planId, version]);

  return { revisions: planId ? revisions : [], error };
}

/** Loads two revisions' content for comparison. */
export function useRevisionPair(
  planId: string | null,
  from: number | null,
  to: number | null,
) {
  const [pair, setPair] = useState<{
    from: PlanRevision;
    to: PlanRevision;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!planId || from === null || to === null) {
      return;
    }

    let isActive = true;

    Promise.all([fetchRevision(planId, from), fetchRevision(planId, to)]).then(
      ([a, b]) => {
        if (!isActive) {
          return;
        }

        if (a.ok && b.ok) {
          setPair({ from: a.data, to: b.data });
          setError(null);
        } else {
          setPair(null);
          setError(!a.ok ? a.message : !b.ok ? b.message : null);
        }
      },
    );

    return () => {
      isActive = false;
    };
  }, [planId, from, to]);

  const ready =
    pair !== null && pair.from.version === from && pair.to.version === to;

  return { pair: ready ? pair : null, error };
}
