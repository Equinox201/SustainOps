import { useEffect, useState } from "react";
import type { AuditEvent } from "@/lib/types";
import { fetchAuditEvents } from "../services/action-plan-api";

/** Recent audit events from the server, loaded when `enabled` becomes true. */
export function useAuditEvents(enabled: boolean) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

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
      } else {
        setError(result.message);
      }
    });

    return () => {
      isActive = false;
    };
  }, [enabled]);

  return { events, error };
}
