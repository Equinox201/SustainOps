import { evalCasesCategoryOrder } from "./categories";
import { mean, percentile, proportion } from "./metrics";
import type {
  CaseReport,
  EvalCase,
  EvalCategory,
  GenerationCaseResult,
  Proportion,
  RetrievalCaseResult,
} from "./types";

export type EvalMeta = {
  generatedAt: string;
  mode: "retrieval" | "full";
  embedder: string;
  generationModel: string | null;
  judgeModel: string | null;
  promptVersion: string | null;
  topK: number;
  minScore: number;
  gitSha: string | null;
  corpus: { documents: number; approvedDocuments: number; sections: number };
};

export type EvalReport = {
  schemaVersion: 1;
  meta: EvalMeta;
  summary: {
    cases: number;
    passed: number;
    retrieval: {
      goldHitRate: Proportion;
      goldSectionRecall: Proportion;
      documentPrecision: number | null;
      forbiddenLeakage: Proportion;
      abstention: Proportion;
      coverage: Proportion;
    };
    generation: null | {
      completion: Proportion;
      firstAttemptCompliance: Proportion;
      groundingAsExpected: Proportion;
      citationCoverage: Proportion;
      invalidCitationRate: Proportion;
      untraceableFigureRate: Proportion;
      kpiMeasurable: Proportion;
      forbiddenTextCases: Proportion;
      staleFactCases: Proportion;
      faithfulness: null | {
        supported: Proportion;
        supportedOrPartial: Proportion;
        actionsJudged: number;
      };
      /**
       * Statement labels (added with prompt v4). Absent from reports published
       * before the labels existed.
       */
      policy?: {
        /** Actions the model called policy requirements, of all actions. */
        claimShare: Proportion;
        /** Claimed policy requirements whose quotation was found in the source. */
        claimsVerified: Proportion;
        /** Judge: verified policy actions rated fully supported by their excerpts. */
        supportedVerified: Proportion | null;
        /** Judge: every other cited action rated fully supported. */
        supportedOther: Proportion | null;
      };
      latencyMs: { mean: number | null; p50: number | null; p95: number | null };
      outputTokensMean: number | null;
      confidence: Record<"Low" | "Medium" | "High", number>;
    };
  };
  byCategory: Array<{
    category: EvalCategory;
    cases: number;
    passed: number;
  }>;
  cases: CaseReport[];
  limitations: string[];
};

export function caseFailures(
  evalCase: EvalCase,
  retrieval: RetrievalCaseResult,
  generation?: GenerationCaseResult,
): string[] {
  const failures: string[] = [];

  for (const slug of retrieval.forbiddenHits) {
    failures.push(`retrieved forbidden document: ${slug}`);
  }

  if (retrieval.abstainedCorrectly === false) {
    failures.push(
      evalCase.expect.sources === "none"
        ? `should have retrieved nothing but retrieved ${retrieval.retrieved.length}`
        : "should have retrieved sources but retrieved none",
    );
  }

  if (evalCase.expect.gold.length > 0 && retrieval.goldFound.length === 0) {
    failures.push("no gold section was retrieved");
  }

  if (generation) {
    if (!generation.ok) {
      failures.push(`generation failed: ${generation.error ?? "unknown"}`);
    } else {
      if (generation.groundingAsExpected === false) {
        failures.push(`grounding was ${generation.groundingStatus}`);
      }

      for (const hit of generation.forbiddenTextHits) {
        failures.push(`plan contains forbidden text: "${hit}"`);
      }

      for (const hit of generation.staleFactHits) {
        failures.push(`plan states a superseded figure: "${hit}"`);
      }
    }
  }

  return failures;
}

export function buildReport({
  meta,
  cases,
  retrieval,
  generation,
}: {
  meta: EvalMeta;
  cases: EvalCase[];
  retrieval: Map<string, RetrievalCaseResult>;
  generation?: Map<string, GenerationCaseResult>;
}): EvalReport {
  const reports: CaseReport[] = cases.map((evalCase) => {
    const retrievalResult = retrieval.get(evalCase.id)!;
    const generationResult = generation?.get(evalCase.id);

    return {
      id: evalCase.id,
      category: evalCase.category,
      title: evalCase.title,
      retrieval: retrievalResult,
      generation: generationResult,
      failures: caseFailures(evalCase, retrievalResult, generationResult),
    };
  });

  const withGold = reports.filter(
    (report, index) => cases[index].expect.gold.length > 0,
  );
  const goldTotal = withGold.reduce(
    (sum, report) =>
      sum + report.retrieval.goldFound.length + report.retrieval.goldMissed.length,
    0,
  );
  const goldFound = withGold.reduce(
    (sum, report) => sum + report.retrieval.goldFound.length,
    0,
  );
  const precisions = reports
    .map((report) => report.retrieval.documentPrecision)
    .filter((value): value is number => value !== null);
  const expectNone = reports.filter(
    (_, index) => cases[index].expect.sources === "none",
  );
  const expectSome = reports.filter(
    (_, index) => cases[index].expect.sources === "some",
  );

  const generations = reports
    .map((report) => report.generation)
    .filter((value): value is GenerationCaseResult => Boolean(value));
  const okGenerations = generations.filter((g) => g.ok);

  const sum = (pick: (g: GenerationCaseResult) => number) =>
    okGenerations.reduce((total, g) => total + pick(g), 0);

  const generationSummary: EvalReport["summary"]["generation"] = generation
    ? (() => {
        const judged = okGenerations.filter((g) => g.judge);
        const supported = judged.reduce((t, g) => t + g.judge!.supported, 0);
        const partial = judged.reduce((t, g) => t + g.judge!.partial, 0);
        const unsupported = judged.reduce((t, g) => t + g.judge!.unsupported, 0);
        const total = supported + partial + unsupported;
        const retrievedSomething = (id: string) =>
          retrieval.get(id)!.retrieved.length > 0;
        const withSources = reports.filter(
          (report) =>
            report.generation?.ok && retrievedSomething(report.id),
        );
        const traceable = sum((g) => g.figuresChecked);
        const staleChecked = cases.filter(
          (evalCase) => (evalCase.expect.staleFacts?.length ?? 0) > 0,
        );
        const forbiddenTextChecked = cases.filter(
          (evalCase) => (evalCase.expect.forbiddenText?.length ?? 0) > 0,
        );
        const tokens = okGenerations
          .map((g) => g.outputTokens)
          .filter((value): value is number => value !== null);
        const confidence = { Low: 0, Medium: 0, High: 0 };

        for (const g of okGenerations) {
          if (g.confidence) {
            confidence[g.confidence] += 1;
          }
        }

        const policyJudged = judged.filter((g) => g.judgePolicy);
        const policySupported = policyJudged.reduce(
          (t, g) => t + g.judgePolicy!.supported,
          0,
        );
        const policyTotal = policyJudged.reduce(
          (t, g) =>
            t +
            g.judgePolicy!.supported +
            g.judgePolicy!.partial +
            g.judgePolicy!.unsupported,
          0,
        );

        const expectedGrounding = okGenerations.filter(
          (g) => g.groundingAsExpected !== null,
        );

        return {
          completion: proportion(okGenerations.length, generations.length),
          firstAttemptCompliance: proportion(
            okGenerations.filter((g) => g.attempts === 1).length,
            okGenerations.length,
          ),
          groundingAsExpected: proportion(
            expectedGrounding.filter((g) => g.groundingAsExpected).length,
            expectedGrounding.length,
          ),
          citationCoverage: proportion(
            withSources.reduce((t, r) => t + r.generation!.actionsCited, 0),
            withSources.reduce((t, r) => t + r.generation!.actions, 0),
          ),
          invalidCitationRate: proportion(
            sum((g) => g.citationsDropped),
            sum((g) => g.citationsDropped + g.citationsKept),
          ),
          untraceableFigureRate: proportion(
            sum((g) => g.untraceableFigures.length),
            traceable,
          ),
          kpiMeasurable: proportion(
            sum((g) => g.kpisMeasurable),
            sum((g) => g.kpisTotal),
          ),
          forbiddenTextCases: proportion(
            okGenerations.filter((g) => g.forbiddenTextHits.length > 0).length,
            forbiddenTextChecked.length,
          ),
          staleFactCases: proportion(
            okGenerations.filter((g) => g.staleFactHits.length > 0).length,
            staleChecked.length,
          ),
          policy: {
            claimShare: proportion(
              sum((g) => g.policyClaims),
              sum((g) => g.actions),
            ),
            claimsVerified: proportion(
              sum((g) => g.policyClaimsVerified),
              sum((g) => g.policyClaims),
            ),
            supportedVerified:
              policyTotal === 0 ? null : proportion(policySupported, policyTotal),
            supportedOther:
              total - policyTotal === 0
                ? null
                : proportion(supported - policySupported, total - policyTotal),
          },
          faithfulness:
            total === 0
              ? null
              : {
                  supported: proportion(supported, total),
                  supportedOrPartial: proportion(supported + partial, total),
                  actionsJudged: total,
                },
          latencyMs: {
            mean: mean(okGenerations.map((g) => g.latencyMs)),
            p50: percentile(okGenerations.map((g) => g.latencyMs), 50),
            p95: percentile(okGenerations.map((g) => g.latencyMs), 95),
          },
          outputTokensMean: mean(tokens),
          confidence,
        };
      })()
    : null;

  return {
    schemaVersion: 1,
    meta,
    summary: {
      cases: reports.length,
      passed: reports.filter((report) => report.failures.length === 0).length,
      retrieval: {
        goldHitRate: proportion(
          withGold.filter((report) => report.retrieval.goldFound.length > 0).length,
          withGold.length,
        ),
        goldSectionRecall: proportion(goldFound, goldTotal),
        documentPrecision: mean(precisions),
        forbiddenLeakage: proportion(
          reports.filter((report) => report.retrieval.forbiddenHits.length > 0)
            .length,
          reports.length,
        ),
        abstention: proportion(
          expectNone.filter((report) => report.retrieval.abstainedCorrectly).length,
          expectNone.length,
        ),
        coverage: proportion(
          expectSome.filter((report) => report.retrieval.retrieved.length > 0)
            .length,
          expectSome.length,
        ),
      },
      generation: generationSummary,
    },
    byCategory: evalCasesCategoryOrder.map((category) => {
      const inCategory = reports.filter((report) => report.category === category);

      return {
        category,
        cases: inCategory.length,
        passed: inCategory.filter((report) => report.failures.length === 0).length,
      };
    }),
    cases: reports,
    limitations: buildLimitations(
      meta,
      cases.length,
      generationSummary?.confidence ?? null,
    ),
  };
}

function buildLimitations(
  meta: EvalMeta,
  caseCount: number,
  confidence: Record<"Low" | "Medium" | "High", number> | null,
): string[] {
  const limitations = [
    `Small benchmark: ${caseCount} cases over a ${meta.corpus.sections}-section synthetic corpus. Rates carry wide confidence intervals; read counts, not just percentages.`,
    "Gold sections were chosen by the author before any model output was seen, but one person labelled them. There is no inter-annotator agreement.",
    "Retrieval is measured on gold sections; other sections can be legitimately useful, so document-level precision is the fairer precision figure.",
    "The corpus is synthetic and the cases were written against it, so results measure the system's behaviour on this material, not on real company documents.",
  ];

  if (meta.mode === "full") {
    limitations.push(
      "Untraceable-figure rate only checks percentages and temperatures against the case text and retrieved sources. It is a proxy for unsupported claims, not a proof of faithfulness.",
      "Generation is non-deterministic and this is a single run: re-running one case produced different figures and wording. Differences of a case or two between runs are noise.",
      "'Partially supported' mostly means an action follows a cited section and adds operational detail (a duration, a logging step). That is often desirable, but it is not the same as being stated by the policy.",
      "The KPI-measurability heuristic was revised after the first full run, which had misclassified plainly countable KPIs. The definition is in evals/README.md.",
    );
  }

  if (confidence) {
    const total = confidence.Low + confidence.Medium + confidence.High;

    if (total > 0 && confidence.High / total >= 0.75) {
      limitations.push(
        `Confidence is not yet a discriminating signal: ${confidence.High} of ${total} plans report High. The server caps it when grounding is weak, but among grounded plans the model almost always says High.`,
      );
    }
  }

  if (meta.mode === "full") {
    limitations.push(
      "A verified policy requirement means the quotation was found word for word in the cited excerpt. It proves the source says those words, not that the action correctly applies them; the judge figure beside it is the check on that.",
    );
  }

  if (meta.judgeModel) {
    limitations.push(
      `Faithfulness is judged by ${meta.judgeModel}, the same model family that wrote the plans, so it may be lenient toward its own style. Treat it as a screening signal.`,
    );
  }

  if (meta.embedder === "hash-v1") {
    limitations.push(
      "This run used the offline hash embedder (no semantic knowledge). It exists as a free regression check; quality numbers for production come from a real embedding model.",
    );
  }

  return limitations;
}
