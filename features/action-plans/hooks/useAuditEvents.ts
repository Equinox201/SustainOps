import { useEffect, useState } from "react";
import type { AuditEvent } from "@/lib/types";
import { fetchAuditEvents } from "../services/action-plan-api";

/** Recent audit events from the server, loaded when `enabled` becomes true. */
export function useAuditEvents(enabled: boolean) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let isActive = true;

    fetchAuditEvents().then((result) => {
      if (!isActive) {
        return;
      }

      if (result.ok) {
        setEvents(result.data);
        setError(null);
        setHasLoaded(true);
      } else {
        setError(result.message);
      }
    });

    return () => {
      isActive = false;
    };
  }, [enabled]);

  // True only while a request is genuinely in flight, so an empty list is
  // never shown (or counted as zero) before the data has arrived.
  const isLoading = enabled && !hasLoaded && error === null;

  return { events, error, isLoading };
}
