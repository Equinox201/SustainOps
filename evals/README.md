# Evaluation methodology

This suite answers one question: **when SustainOps says a plan is grounded,
is it?** It runs the production retrieval and generation code (not a copy)
against 24 labelled cases and reports what it measures, including failures.

```bash
npm run evals -- --mode retrieval --embedder hash        # free, offline
npm run evals -- --mode retrieval --embedder openai      # embeddings only
npm run evals -- --mode full --embedder openai --judge   # full pipeline
npm run evals -- ... --publish                           # also update evals/results/latest.json
```

Each run builds a fresh in-memory Postgres with the real migrations and
ingests the real corpus, so it never touches (or depends on) the live
database and is repeatable.

## The benchmark (`evals/cases.ts`)

| Category | Cases | What it tests |
| --- | --: | --- |
| Grounded retrieval | 14 | The right sections are found for a typical case |
| Paraphrased | 4 | Same need, written *without* the corpus's vocabulary |
| Stale-fact trap | 1 | A superseded SOP states a different figure; the plan must not repeat it |
| Abstention | 2 | Nothing applies; the system must say so, not pad with weak matches |
| Department isolation | 1 | Content that belongs to another department must not leak across |
| Adversarial | 2 | Prompt injection in the case text; a request to name individual guests |

Gold sections (the ones a competent person would cite) were chosen by reading
the corpus **before** any model output was seen. They are not exhaustive.

The paraphrased category exists because the first version of the benchmark was
too easy: written against the corpus, its cases shared the corpus's wording and
an offline lexical embedder passed 20 of 20. Adding cases that avoid that
vocabulary made the benchmark discriminate: the lexical embedder misses 2 of 4,
a semantic one misses none.

## Metrics

**Retrieval**

| Metric | Definition |
| --- | --- |
| Gold hit rate | Cases (that have gold sections) where at least one gold section was retrieved |
| Gold section recall | Gold sections retrieved / all gold sections |
| Document precision | Retrieved sections that belong to a document holding a gold section. Document-level on purpose: other sections of the right document can be legitimately useful |
| Forbidden leakage | Cases that retrieved a superseded or wrong-department document. Target: 0 |
| Abstention | Off-topic cases that retrieved nothing |

**Generation**

| Metric | Definition |
| --- | --- |
| Completed / first-attempt valid | Produced a valid plan; needed no retry of unreadable output |
| Grounding as expected | Labelled grounded/partial when sources exist; ungrounded when none apply |
| Citation coverage | Recommended actions citing at least one retrieved source |
| Invalid citations | Citations to sources never supplied to the model (the server drops them). Target: 0 |
| Untraceable figures | Percentages and temperatures in the plan found in neither the case text nor the retrieved sources. A deterministic proxy for unsupported claims |
| Judged faithful | An LLM judge rates each cited action against only its cited excerpts: supported / partial / unsupported |
| Stale figure stated / forbidden text | Hard checks on the trap and adversarial cases. Target: 0 |
| Confidence reported | Distribution of the model's own confidence. Reported, not scored |
| KPIs measurable | KPIs that name a number, rate or unit (heuristic) |
| Latency | Wall-clock time per generation, including any retry |

A case **passes** when none of its hard checks fail: no forbidden document, no
wrong abstention, at least one gold section found, and (in full runs) the plan
generated, was labelled as expected, and contains no forbidden text or stale
figure. Informational metrics (untraceable figures, judged faithfulness, KPI
measurability) do not fail a case, but are reported.

**Statement labels (prompt v4)**

| Metric | Definition |
| --- | --- |
| Called policy requirements | Actions the model labelled as restating a company rule, of all actions. Each must come with a quotation |
| Quotations that held up | Policy claims whose quotation the server found word for word in a source the action cites. The rest are stored as proposals. Measures how often the model's claim to be quoting is true |
| Verified policy actions judged fully supported | The LLM judge's verdict on the actions kept as policy requirements |
| Other cited actions judged fully supported | The same verdict for every other cited action, as the comparison |

The quotation check is deterministic and proves the source contains those
words. It cannot prove the action applies them correctly, which is why the
judged comparison sits beside it: if verified policy actions are not judged
supported more often than the rest, the label is not adding information.

### A metric that was removed

An early version also scored "current figure used" on the trap case: whether
the plan literally printed the right threshold. Inspecting the plan showed it
applied the rule correctly ("open a formal sustainability case") without
restating the number, so the metric rewarded wording, not behaviour. It was
removed rather than reported. The trap is judged by the check that matters:
the plan must not repeat the superseded figure.

## Counterfactual demonstration

`npm run evals:counterfactual -- --runs 3` answers a different question from the
benchmark: does retrieval change the *decision* a plan recommends, or only its
wording? One case (38% forecast occupancy for four nights: consolidate floors?)
is generated under three versions of the world with nothing else changed:

| Policy in force | Rule | What the case should lead to |
| --- | --- | --- |
| Current (Energy SOP v2) | consolidate below 45% for 3+ nights | consolidate now |
| Updated (v3, one sentence changed) | consolidate below 30% for 5+ nights | hold off |
| None | no Energy SOP approved | nothing to cite; the model falls back on its own judgment |

The update goes through the real lifecycle (a manager drafts, a reviewer
publishes), then the document is withdrawn for the third condition. For each run
the report records the grounding status, the percent figures inside quotations
the server verified, the documents cited, and the decision, which a model
classifies from the case and the plan alone (it never sees the policy). The
figures in verified quotations are the check that does not depend on that
classifier.

Limits: one case, a few runs, a policy change I wrote, a same-family
classifier. It shows the mechanism works on a controlled example; it is not a
rate.

## Reading the numbers

- **Counts, not just percentages.** With 24 cases a single failure moves a rate
  by several points. Every rate carries a 95% Wilson interval; wide intervals
  are the honest answer to "how sure are you".
- **One labeller, synthetic corpus, cases written against it.** Results show
  behaviour on this material, not on real company documents.
- **The judge is the same model family as the generator**, so it may favour its
  own style. It is a screening signal, not ground truth.
- **"Untraceable figures" is a proxy.** A figure can be correct and still
  absent from the sources; a number can be present and misused. Read the
  per-case detail before concluding anything from the rate.
- **A passing run is not a guarantee.** It is evidence that specific,
  previously-failing behaviours have not regressed on these cases.

## Regression gate

`evals/retrieval.test.ts` re-runs the retrieval benchmark with the offline
embedder in CI and fails on any forbidden-document leakage or wrong abstention,
and on a drop in gold hit rate below the level measured at the time of writing.
It uses the hash embedder because CI has no API key, so it guards the
metadata filtering and thresholding logic rather than embedding quality.

## Reports

Every run writes `evals/results/<timestamp>-<mode>-<embedder>.json`. The run
published with `--publish` is `evals/results/latest.json`, which the public
`/evals` page renders.
