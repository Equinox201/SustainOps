import { useEffect, useState } from "react";
import { fetchKnowledgeDocuments } from "../services/action-plan-api";
import type { KnowledgeDocumentInfo } from "../types";

export function useKnowledgeDocuments(enabled: boolean) {
  const [documents, setDocuments] = useState<KnowledgeDocumentInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

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
      } else {
        setError(result.message);
      }
    });

    return () => {
      isActive = false;
    };
  }, [enabled]);

  return { documents, error };
}
