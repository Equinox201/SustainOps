import { useCallback, useEffect, useState } from "react";
import { fetchKnowledgeDocuments } from "../services/action-plan-api";
import type { KnowledgeDocumentInfo } from "../types";

export function useKnowledgeDocuments(enabled: boolean) {
  const [documents, setDocuments] = useState<KnowledgeDocumentInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isActive = true;

    fetchKnowledgeDocuments().then((result) => {
      if (!isActive) {
        return;
      }

      if (result.ok) {
        setDocuments(result.data);
        setError(null);
        setHasLoaded(true);
      } else {
        setError(result.message);
      }
    });

    return () => {
      isActive = false;
    };
  }, [enabled, reloads]);

  // True only while a request is genuinely in flight, so an empty list is
  // never shown (or counted as zero) before the data has arrived.
  const isLoading = enabled && !hasLoaded && error === null;
  const reload = useCallback(() => setReloads((count) => count + 1), []);

  return { documents, error, isLoading, reload };
}
