import { useEffect, useState } from "react";
import type { SessionUser } from "@/lib/schemas/action-plan";
import { fetchPersonas } from "../services/auth-api";

let cache: SessionUser[] | null = null;

/**
 * The people who can be named on a plan (the seeded personas). Fetched once
 * per page load; used to offer assignees and to show names for ids.
 */
export function usePeople(): SessionUser[] {
  const [people, setPeople] = useState<SessionUser[]>(cache ?? []);

  useEffect(() => {
    if (cache) {
      return;
    }

    let isActive = true;

    fetchPersonas().then((result) => {
      if (result.ok) {
        cache = result.data;

        if (isActive) {
          setPeople(result.data);
        }
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  return people;
}
