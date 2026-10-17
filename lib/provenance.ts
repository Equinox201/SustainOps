/**
 * Provenance rules shared by the server and the UI.
 *
 * The model may *claim* that an action restates a company rule and offer a
 * quotation. Nothing is believed until it is checked here: a quotation must
 * appear, word for word, in the excerpt of the source it names.
 */

/** What a statement is: a rule from a source, a suggestion, or an assumption. */
export const CLAIM_TYPES = [
  "policy_requirement",
  "proposal",
  "assumption",
] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

/** Stored plans may also hold actions written before claims were recorded. */
export const STORED_CLAIM_TYPES = [...CLAIM_TYPES, "unclassified"] as const;
export type StoredClaimType = (typeof STORED_CLAIM_TYPES)[number];

export const CLAIM_LABELS: Record<StoredClaimType, string> = {
  policy_requirement: "Policy requirement",
  proposal: "Proposal",
  assumption: "Assumption",
  unclassified: "Not classified",
};

/** Why a claimed policy requirement was not kept as one. */
export const DOWNGRADE_REASONS = [
  "no_quote",
  "quote_not_found",
  "source_not_cited",
  "quote_too_short",
  "text_edited",
] as const;
export type DowngradeReason = (typeof DOWNGRADE_REASONS)[number];

export const DOWNGRADE_LABELS: Record<DowngradeReason, string> = {
  no_quote:
    "The AI called this a policy requirement but gave no quotation, so it is treated as a proposal.",
  quote_not_found:
    "The quotation the AI gave was not found in the source, so this is treated as a proposal.",
  source_not_cited:
    "The quotation came from a source this action does not cite, so this is treated as a proposal.",
  quote_too_short:
    "The quotation was too short to show the source says this, so this is treated as a proposal.",
  text_edited:
    "A person reworded this action after it was classified, so the source quotation no longer vouches for it.",
};

/** A quotation shorter than this proves nothing ("the", "must be"). */
export const MIN_QUOTE_CHARS = 20;
export const MIN_QUOTE_WORDS = 4;

/**
 * Makes two renderings of the same text comparable: Unicode-normalised,
 * typographic quotes and dashes flattened, markdown emphasis removed, runs of
 * whitespace collapsed, case ignored.
 */
export function normalizeForQuote(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export type QuoteCheck =
  | { ok: true; start: number; end: number }
  | { ok: false; reason: "quote_too_short" | "quote_not_found" };

/**
 * Does `quote` appear verbatim (after normalisation) in `excerpt`? On success
 * returns where it sits in the *original* excerpt so the UI can highlight it.
 */
export function checkQuote(quote: string, excerpt: string): QuoteCheck {
  const wanted = normalizeForQuote(quote);

  if (
    wanted.length < MIN_QUOTE_CHARS ||
    wanted.split(" ").length < MIN_QUOTE_WORDS
  ) {
    return { ok: false, reason: "quote_too_short" };
  }

  // Normalise the excerpt while remembering where each kept character came
  // from, so a match can be mapped back onto the original text.
  const kept: string[] = [];
  const origin: number[] = [];
  let lastWasSpace = true; // drops leading whitespace

  for (let index = 0; index < excerpt.length; index += 1) {
    const piece = normalizeForQuote(excerpt[index]);

    if (piece === "") {
      if (/\s/.test(excerpt[index]) && !lastWasSpace) {
        kept.push(" ");
        origin.push(index);
        lastWasSpace = true;
      }

      continue;
    }

    for (const char of piece) {
      kept.push(char);
      origin.push(index);
    }

    lastWasSpace = false;
  }

  const haystack = kept.join("");
  const at = haystack.indexOf(wanted);

  if (at === -1) {
    return { ok: false, reason: "quote_not_found" };
  }

  return {
    ok: true,
    start: origin[at],
    end: origin[at + wanted.length - 1] + 1,
  };
}
