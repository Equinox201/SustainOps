import { useEffect, useState } from "react";
import type { RetrievalDiagnostics } from "@/lib/types";
import { fetchRetrieval } from "../services/action-plan-api";

type Loaded = {
  generation: {
    id: string;
    model: string;
    promptVersion: string;
    createdAt: string;
    policyClaims: number;
    policyClaimsVerified: number;
  };
  diagnostics: RetrievalDiagnostics;
};

/** The retrieval record for a plan's generation, fetched when `enabled`. */
export function useRetrievalDiagnostics(
  planId: string | null,
  enabled: boolean,
) {
  const [data, setData] = useState<{ planId: string; loaded: Loaded } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!planId || !enabled) {
      return;
    }

    let isActive = true;

    fetchRetrieval(planId).then((result) => {
      if (!isActive) {
        return;
      }

      if (result.ok) {
        setData({ planId, loaded: result.data });
        setError(null);
      } else {
        setError(result.message);
      }
    });

    return () => {
      isActive = false;
    };
  }, [planId, enabled]);

  const current = data && data.planId === planId ? data.loaded : null;

  return {
    loaded: current,
    error,
    isLoading: enabled && current === null && error === null,
  };
}
