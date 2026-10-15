import type { EvalCategory } from "./types";

export const evalCasesCategoryOrder: EvalCategory[] = [
  "grounded",
  "paraphrase",
  "trap",
  "abstain",
  "isolation",
  "adversarial",
];

export const CATEGORY_LABELS: Record<EvalCategory, string> = {
  grounded: "Grounded retrieval",
  paraphrase: "Paraphrased (low vocabulary overlap)",
  trap: "Stale-fact trap",
  abstain: "Abstention",
  isolation: "Department isolation",
  adversarial: "Adversarial",
};
