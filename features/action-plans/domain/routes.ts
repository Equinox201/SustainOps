/**
 * Plan URLs. `/` is the list, `/plans/new` a blank case, `/plans/<id>` an
 * existing plan. Kept pure so the mapping is testable and shared by the
 * server-rendered route and the client.
 */

export const NEW_PLAN_SEGMENT = "new";

export function planPath(planId: string | null): string {
  return `/plans/${encodeURIComponent(planId ?? NEW_PLAN_SEGMENT)}`;
}

/**
 * The plan a pathname points at: a plan id, `"new"`, or `null` for the list.
 * Anything that is not a plan URL is treated as the list.
 */
export function parsePlanPath(pathname: string | null): string | null {
  const match = pathname?.match(/^\/plans\/([^/]+)\/?$/);

  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}
