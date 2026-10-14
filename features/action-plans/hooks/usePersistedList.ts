import { useCallback, useEffect, useState } from "react";

/**
 * A list kept in React state and mirrored to browser storage.
 *
 * Reads happen once after mount (so server and client markup match), and every
 * later change is written back. Storage failures never block the workflow.
 */
export function usePersistedList<T>({
  read,
  write,
}: {
  read: () => T[] | null;
  write: (items: T[]) => void;
}) {
  const [items, setItems] = useState<T[]>([]);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    let isActive = true;
    let storedItems: T[] | null = null;

    try {
      storedItems = read();
    } catch {
      // Invalid browser storage should not block the workflow.
    }

    queueMicrotask(() => {
      if (!isActive) {
        return;
      }

      if (storedItems) {
        setItems(storedItems);
      }

      setHasHydrated(true);
    });

    return () => {
      isActive = false;
    };
  }, [read]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    try {
      write(items);
    } catch {
      // Storage can fail in private browsing or quota-limited contexts.
    }
  }, [hasHydrated, items, write]);

  const reset = useCallback(() => setItems([]), []);

  return { items, setItems, reset };
}
