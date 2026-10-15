import { useCallback, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  filtersToQuery,
  parseFilters,
  type PlanFilters,
} from "../domain/filters";
import { parsePlanPath } from "../domain/routes";

/**
 * The URL is the source of truth for which plan is open and how the list is
 * filtered, so every view has a shareable link and Back/Forward work.
 *
 * Changes use the native History API, which Next.js integrates with
 * `usePathname` / `useSearchParams`. That updates the address without
 * remounting the app, so loaded plans and the signed-in session stay put.
 */
export function usePlanRoute() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const routePlanId = parsePlanPath(pathname);
  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);

  const navigate = useCallback(
    (url: string, mode: "push" | "replace" = "push") => {
      if (mode === "push") {
        window.history.pushState(null, "", url);
      } else {
        window.history.replaceState(null, "", url);
      }
    },
    [],
  );

  const setFilters = useCallback(
    (next: PlanFilters) => {
      const query = filtersToQuery(next);
      navigate(query ? `/?${query}` : "/", "replace");
    },
    [navigate],
  );

  return { routePlanId, filters, navigate, setFilters };
}
