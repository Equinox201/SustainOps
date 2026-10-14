import { useCallback } from "react";
import type { TelemetryEvent, TelemetryEventName } from "@/lib/types";
import { createId } from "../domain/plan-utils";
import {
  readStoredTelemetryEvents,
  writeStoredTelemetryEvents,
} from "../storage/telemetry-storage";
import { usePersistedList } from "./usePersistedList";

export type RecordTelemetry = (event: {
  eventName: TelemetryEventName;
  planId?: string;
  department?: string;
}) => void;

export function useTelemetry() {
  const {
    items: telemetryEvents,
    setItems,
    reset,
  } = usePersistedList<TelemetryEvent>({
    read: readStoredTelemetryEvents,
    write: writeStoredTelemetryEvents,
  });

  const recordTelemetry = useCallback<RecordTelemetry>(
    ({ eventName, planId, department }) => {
      const event: TelemetryEvent = {
        id: createId(),
        eventName,
        planId,
        department,
        timestamp: new Date().toISOString(),
      };

      setItems((currentEvents) => [event, ...currentEvents]);
    },
    [setItems],
  );

  return { telemetryEvents, recordTelemetry, resetTelemetry: reset };
}
