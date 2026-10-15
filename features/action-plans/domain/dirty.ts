import type { PlanContent } from "@/lib/types";
import type { EditorDraft } from "../types";
import { deepEqual } from "./deep-equal";
import { draftToContent } from "./lifecycle";

/**
 * Has the draft changed since it was last loaded or saved? Compares content
 * only, so view state (open panels, messages) never counts as an edit.
 */
export function isDraftDirty(
  draft: EditorDraft | null,
  baseline: PlanContent | null,
): boolean {
  if (!draft || !baseline) {
    return false;
  }

  return !deepEqual(draftToContent(draft), baseline);
}
