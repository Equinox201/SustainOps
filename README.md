# SustainOps

[![CI](https://github.com/Equinox201/SustainOps/actions/workflows/ci.yml/badge.svg)](https://github.com/Equinox201/SustainOps/actions/workflows/ci.yml)

AI-assisted sustainability operations for hospitality teams. SustainOps turns an
operational issue such as rising laundry volume, buffet food waste or low-occupancy
energy use into a structured action plan that is reviewed by a person, approved,
tracked against KPIs, and closed out.

**Live demo:** <https://sustainops.vercel.app> (sign in as any persona; data is
fictional and resets nightly) · **Evaluation results:** <https://sustainops.vercel.app/evals>

> All properties, policies and data in this project are fictional. It originated
> as a take-home prototype and was rebuilt as a generic, standalone product.

## Problem

Sustainability goals are broad; operations are specific. Hotel teams need to turn
"reduce food waste" into department-level actions with an owner, a date, a staff
message and a measurable KPI, and they need a record of who approved what.

## Solution

A governed workflow rather than a chatbot:

1. Describe a sustainability case (property, department, issue, current and target metric, context).
2. Generate a structured action plan with strict JSON-schema output.
3. Review it: root causes, actions, staff micro-training, manager checklist, KPIs, governance notes.
4. Assign an owner and dates and complete the readiness checklist.
5. Approve. The plan is locked to protect the reviewed record.
6. Track action progress, add notes and KPI progress, then mark the plan done.

## Roles and governance

Plans are written by one role and approved by another. Permissions are
defined once in [`domain/permissions.ts`](features/action-plans/domain/permissions.ts)
and enforced on the server, inside the same transaction as the change.

| | Sustainability Manager | Department Manager | Reviewer |
| --- | :---: | :---: | :---: |
| See plans | all | own department | all |
| Create cases, generate, edit plans; edit, add and assign actions | ✓ | | |
| Write knowledge drafts and new versions | ✓ | | |
| Publish or withdraw knowledge documents | | | ✓ |
| Action progress and blockers, KPI progress, add notes | ✓ | ✓ | |
| Respond to change requests and resubmit | ✓ | | |
| Approve or request changes (with a comment) | | | ✓ |
| Reset approval | ✓ | | ✓ |
| Mark done, delete | ✓ | | |
| Organisation audit log | ✓ | | ✓ |

- A plan's author cannot approve it, and the approver and approval time are recorded.
- Approved plans are locked: only notes and KPIs change. Completed plans accept notes only.
- Every action is attributed to a user in a per-plan history.
- Out-of-scope plans answer `404`, so a department manager can't probe for other departments' plans.
- Human review is always required; there is no auto-approve path.
- **Actions are individual records.** Each has a stable id, an `origin` (`ai` or
  `human`, decided by the server, never the client), an assignee who must be a
  real eligible person, a due date and a status. The AI's output is stored
  separately and never edited, so what people changed is always measurable.
  What an action says and who does it is part of the plan (locked on approval);
  its progress and blockers stay open to the people doing the work.
- **Review is a loop, not a flag.** A change request stays open until the author
  answers it. Editing the plan does not close it; an explicit *resubmit* with a
  response to every open request does, and approval is refused while any is open.
- **Every version is kept.** Each write stores an immutable snapshot in the same
  transaction, the approved version is pinned, and any two versions can be
  compared ("changes since approval").
- **Notes are append-only**, attributed and timestamped.
- Concurrent edits cannot silently overwrite each other. Every plan carries a
  `version`; a save or transition must name the version it was based on, and a
  stale one is refused with `409 stale_write` instead of winning. The editor
  then offers to load the latest copy. The check runs inside the same
  transaction, after the row lock.

> **Demo sign-in.** There are no passwords: you pick one of five seeded,
> fictional personas. Sessions are a signed HttpOnly cookie that carries only a
> user id, and the user and role are re-read from the database on every
> request. `getSessionPrincipal` is the single seam to replace with a real
> identity provider (Supabase Auth or OIDC) without touching authorization.

## Provenance: what is the AI's, and what is verified

A cited source shows what the model was *given*. It does not show that the
model *used it correctly*, or that an action is something the company
*requires*. So every AI action carries a label the server stands behind:

| Label | Means |
| --- | --- |
| **Policy requirement** | The action carries out a rule a source states, **and** the server found the model's quotation word for word in that source's excerpt. The highlighted quotation is shown. |
| **Proposal** | A sensible suggestion. Sources may support it; none requires it. |
| **Assumption** | Relies on something about the hotel the case and sources do not state. |
| *Not classified* | Written before labels existed. Never guessed at. |

- The model *claims* a label (prompt v4) and offers a quotation. The server
  accepts "policy requirement" only if the quotation appears in an excerpt the
  action itself cites (whitespace, case and typographic punctuation ignored; at
  least four words). Otherwise the action is stored as a proposal with the
  reason (`quote_not_found`, `source_not_cited`, `quote_too_short`, `no_quote`).
  The stored quotation is the source's own wording, not the model's rendering.
- **Provenance is the server's record, not the client's claim.** Each generation
  stores the case it was given and the plan it produced. A plan can only claim
  AI origin by naming a generation, and what is saved must equal that record. A
  plan with no generation is the author's own work: no sources, no claims. Origin,
  sources, label and evidence of an existing action cannot be changed by a
  client, and rewording a policy action drops it to a proposal, because the
  quotation no longer vouches for the new words.
- **Stale plans are caught.** The case as the AI saw it is stored with the plan.
  If the case is edited afterwards, the plan is flagged, the changed fields are
  named, and approval is blocked until the plan is regenerated or its author
  confirms in writing that it still applies. A further edit reopens the
  question.
- **Retrieval is explainable.** Every section of the knowledge base is scored
  and given a decision for each generation (given to the model, below the floor,
  ranked below the cut-off, another department's document, not approved), and
  managers and reviewers can inspect that record.

## Knowledge lifecycle

Documents are not static files. Each has a key and immutable versions with a
state: `draft`, `approved`, `superseded` or `withdrawn`.

- **A manager writes, a reviewer publishes.** A draft is invisible to plan
  generation. Publishing embeds its sections (the state shows as
  `processing`, `available` or `failed`, with retry), makes it the approved
  version and supersedes the one it replaces, atomically. The author cannot
  publish their own document. A published version is never edited: a change is
  a new version.
- **Plans keep the sections they were built on.** When a document they cite is
  superseded or withdrawn, plans are *flagged* with what changed and which
  version now applies (also listed on the Insights page). Nothing is rewritten:
  reassessing means regenerating, which records a new version.
- **Sources are untrusted input.** Anyone who can publish can put text in front
  of the model, so each source is delimited, labelled as data, and cannot close
  its own delimiter; the system prompt tells the model never to follow
  instructions inside it. This is a mitigation, not a proof: whether a model
  ignores an injected instruction is only measurable, and the benchmark's
  adversarial cases test injection in the *case* text, not in published
  documents.
- **Bounded for a public demo.** Document size, section count, the number of
  documents written in the app and daily publishes are capped; the nightly reset
  removes everything written in the app and restores shipped documents'
  statuses, before it rebuilds the demo plans.

## Grounded generation

The model is not asked to recall policy. It is given approved sections and must
cite them, and the server decides what survives.

```
Sustainability case
      |
      v
Eligibility (metadata)      status = approved
                            department = case's, or "All departments"
                            vectors from the same embedding model
      |
      v
Rank by cosine similarity   pgvector, top 6, similarity floor 0.45
      |
      v
Structured generation       sections passed as [S1]..[Sn]; strict JSON schema
      |
      v
Server verification         unknown source ids are dropped
                            grounding status derived by the server, not the model
                            confidence capped: ungrounded -> Low, partial -> Medium
      |
      v
Stored with the plan        frozen snapshot of the sources actually retrieved
```

What a reviewer sees: each recommended action with the exact section it relies
on (for example "Housekeeping Resource Efficiency SOP v2 §4.3"), a banner saying
whether the plan is grounded, partly grounded or general guidance only, and the
retrieved excerpts.

Design decisions:

- **Metadata before similarity.** A food-waste case can never retrieve the
  housekeeping SOP, however similar the wording, because eligibility is decided
  by department and approval status first.
- **Superseded documents are kept but invisible.** The v1 housekeeping SOP
  exists in the corpus specifically to prove retrieval ignores it.
- **Citations are verified, not trusted.** A model that cites a source it was
  never given has that citation removed, and a plan claiming High confidence
  with no valid evidence is forced to Low. The count of dropped citations is
  recorded per generation.
- **Weak matches are not passed off as evidence.** Below the similarity floor
  the plan says it is general guidance, instead of padding with loosely related
  policy.
- **Sources are frozen into the plan.** Editing a document later does not
  rewrite what an approved plan relied on.
- **Retrieval failure degrades visibly.** If retrieval cannot run, generation
  still succeeds but the plan is labelled ungrounded.

**Measured, not guessed.** The similarity floor comes from running
`npm run knowledge:probe` against the real embedding model
(`text-embedding-3-small`) on this corpus: relevant sections scored 0.555 to
0.77, wrong-department off-topic text scored about 0.22, and the hardest
off-topic case (right department, wrong subject) scored at most 0.344. A first
guess of 0.28 would have passed that last case through; 0.45 sits in the gap.

Known limits: the corpus is small (7 documents, 49 sections) and synthetic; the
floor was calibrated on 6 probe cases, so it is a measured starting point, not
a validated threshold (an evaluation suite is next); retrieval is dense-only
with no reranking; a document's `region` is stored but not yet used as a
filter. An offline hash embedder keeps tests and CI free, but it has no
semantic knowledge and is not a substitute for a real model.

## Evaluation

Whether a plan is *really* grounded is measured, not asserted. 24 labelled
cases run through the production retrieval and generation code and are
published at **`/evals`** (methodology and metric definitions in
[`evals/README.md`](evals/README.md)).

Latest full run (`gpt-5-mini`, `text-embedding-3-small`, prompt v5, commit `8efddac`):

| | Result | 95% CI |
| --- | --- | --- |
| Cases passing every hard check | **24 / 24** | |
| Gold section retrieved (hit rate) | 21 / 21 | 85–100% |
| Gold section recall | 32 / 33 | 85–99% |
| Forbidden / superseded document retrieved | **0 / 24** | 0–14% |
| Off-topic cases that correctly retrieved nothing | 2 / 2 | 34–100% |
| Plans valid on the first attempt | 24 / 24 | 86–100% |
| Recommended actions citing a retrieved source | 95 / 110 | 79–92% |
| Citations to sources the model was never given | 0 / 110 | 0–3% |
| Percentage/temperature figures not traceable to the case or sources | 0 / 21 | 0–15% |
| Cited actions an LLM judge rated **fully** supported | 56 / 95 | 49–68% |
| Cited actions rated at least partly supported | 95 / 95 | 96–100% |
| Actions the model called policy requirements | 82 / 120 | 60–76% |
| …whose quotation the server found in the source | **82 / 82** | 96–100% |
| Verified policy actions judged fully supported | 55 / 82 | 56–76% |
| Every other cited action judged fully supported | 1 / 13 | 1–33% |
| Latency, median / p95 | 27.8 s / 35.1 s | |

What the statement labels showed (the parts that are not flattering):

- **The quotation check has rejected nothing on real output.** Across the two
  full runs since labels were introduced, all 164 quotations were real. That is
  a good result about the model, but it means the check has not yet caught a
  real failure: it is proven by unit tests with forged and paraphrased
  quotations, not by production traffic.
- **The model over-assigns the label.** It called about 70% of actions policy
  requirements. A verified one means *the source contains those words*, not
  *the source requires this action*: a third of verified policy actions were
  still judged only partly supported (the quotation is real; the action adds
  detail beyond it).
- **The label does carry signal, in both runs.** Verified policy actions were
  judged fully supported far more often than the remaining cited actions (67%
  vs 8% here, 56% vs 11% before). The comparison group is small (13 to 18
  actions per run), it is two runs of one model, and the judge is the same
  family; read it as encouraging, not settled.
- **Overall fully-supported (59%) is not a demonstrated improvement.** Six
  full runs now range from 37% to 59%. The only prompt change between the last
  two (delimiting source text as untrusted data) should not have moved this, so
  run-to-run variance is the likelier explanation.
- **Latency** is 27.8 s median, roughly double the pre-label prompt (15.9 s).
  Quotations and a label per action mean more output; I have not separated that
  from run-to-run variance in a reasoning model.

How to read it, including the parts that are less flattering:

- **The hard guarantees held.** No superseded or wrong-department document was
  retrieved, the trap case did not repeat the superseded figure, injected
  instructions and guest identifiers were not echoed, and off-topic cases were
  labelled as general guidance.
- **"Partially supported" is the common verdict, not "fully".** Across six
  full runs the fully-supported share ranged 37–59%. Inspecting the verdicts
  shows the typical partial action follows a cited section and adds operational
  detail (a duration, a logging step), which is often desirable but is not the
  same as the policy saying it. Statement labels (above) now surface "what the
  policy says" separately from "what this plan proposes"; tightening when the
  model may use the policy label is the next improvement.
- **The judge is the same model family as the generator**, so it may be
  lenient, and it is a screening signal rather than ground truth.
- **Untraceable figures are a proxy.** In earlier runs the flagged figures were
  a target the plan proposed (100%) and the model converting "one in seven" to
  14%. Neither is invented policy, which is why this is reported but does not
  fail a case.
- **Confidence is not discriminating.** This run reports 7 High, 15 Medium and
  2 Low; earlier runs had most plans at High. The server caps it when grounding
  is weak, but it varies run to run for the same cases, so it should not be
  relied on.
- **Small and synthetic.** 24 cases over 49 synthetic sections, labelled by one
  person and written against the corpus. The first version of the benchmark was
  too easy (a lexical embedder passed 20 of 20), which is why paraphrased cases
  were added; the intervals above are wide.

**Does retrieval change the decision?** A separate run
(`npm run evals:counterfactual`, shown on `/evals`) generates one case (38%
forecast occupancy for four nights: consolidate floors?) under three versions
of the policy, using the real draft, review and publish steps. Under Energy SOP
v2 (consolidate below 45% for three nights) the plan recommended consolidating
in 3 of 3 runs, quoting the 45% rule; after a one-sentence change to v3 (below
30% for five nights) it held off in 3 of 3, quoting the 30% rule. With the
policy withdrawn the model still recommended consolidating, on its own
judgment, and could cite only a generic group-wide target. So a rule that
exists steers the decision and the quotation shows why; without one, the model's
prior takes over, which is what the "partly grounded" label is for. One case,
three runs each, a change I wrote, and a same-family classifier: a demonstration
of the mechanism, not a rate.

The retrieval benchmark also runs in CI with a free offline embedder as a
regression gate for the metadata filtering and similarity floor.

## Knowledge base

`knowledge/` holds synthetic Markdown documents with front matter (`department`,
`document_type`, `region`, `version`, `status`) and numbered sections. One
numbered `###` section is one retrieval chunk and one citation. See
[`knowledge/README.md`](knowledge/README.md).

```bash
npm run knowledge:ingest   # parse, embed and store (idempotent)
npm run knowledge:probe    # show retrieval scores for sample cases
npm run evals -- --mode retrieval --embedder hash        # benchmark, free
npm run evals -- --mode full --embedder openai --judge   # full pipeline
npm run evals:inspect -- hk-trap-escalation              # audit one case
```

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 ·
OpenAI Responses API (strict structured output) and embeddings · pgvector ·
Zod · Drizzle ORM · Supabase Postgres · Vitest (+ PGlite) · Playwright

## Project structure

```
app/api/                     route handlers: plans, transitions, generate, audit
lib/schemas/                 Zod schemas shared by API, client and OpenAI schema
lib/server/                  database, repository, generation service, config
features/action-plans/
  components/                UI, composed from small pieces
  hooks/                     useActionPlans, useActionPlanEditor, useAuditEvents
  domain/                    pure logic: lifecycle rules, utilities
  services/                  typed client for the backend API
```

## Data model

| Table | Purpose |
| --- | --- |
| `action_plans` | The plan: case, AI output, owner and dates, readiness, KPI progress, approval state, and a `version` for optimistic concurrency. A DB constraint guarantees a plan can't be completed without being approved. |
| `action_plan_revisions` | One immutable snapshot per plan version, with who and why. Written in the same transaction as the change; `action_plans.approved_version` pins the approved one. |
| `change_requests` | A reviewer's request and, once given, the author's response. Open until answered. |
| `plan_notes` | Append-only implementation notes. |
| `users` | Seeded fictional personas with a role (and a department for department managers). |
| `audit_events` | Append-only history of what happened to which plan and who did it. Written in the same transaction as the change. |
| `ai_generations` | Every generation attempt: user, model, prompt version, latency, token use, outcome, the case it was given, the plan it produced, the full retrieval record, and how many policy claims held up. Also backs rate limiting. |
| `knowledge_documents`, `knowledge_chunks` | The knowledge base: versioned documents with a lifecycle state, who wrote and approved each, indexing status, and section-level vectors (pgvector, in the `extensions` schema). |

Row Level Security is enabled on every table with no policies, so nothing is
reachable through Supabase's public Data API; only the server reads and writes.

## API

| Method and path | Purpose |
| --- | --- |
| `GET/POST /api/action-plans` | List and create plans |
| `GET/PUT/DELETE /api/action-plans/:id` | Read, edit (lock rules enforced; body carries `expectedVersion`, stale writes answer `409`) and delete |
| `POST /api/action-plans/:id/transition` | Approve, request changes, resubmit (with `responses`), acknowledge that a stale plan still applies (with a reason), complete or reset; optionally saves pending edits atomically. Carries `expectedVersion` |
| `GET /api/action-plans/:id/history` | The plan's attributed audit history |
| `GET/POST /api/action-plans/:id/notes` | List and append implementation notes |
| `GET /api/action-plans/:id/revisions`, `GET .../revisions/:version` | Versions of a plan, and one version's content |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET /api/auth/personas` | Demo sign-in |
| `POST /api/action-plans/generate` | Generate a plan (validated, rate-limited, timed out, recorded) |
| `GET /api/action-plans/:id/retrieval` | Why each knowledge section was or was not given to the model (managers and reviewers) |
| `GET /api/audit-events` | Organisation-wide recent events (managers and reviewers) |
| `GET/POST /api/knowledge`, `POST /api/knowledge/preview` | The catalogue; save a draft; check how a draft splits into sections |
| `GET/PUT/DELETE /api/knowledge/:id` | A document with its sections; edit or delete a draft |
| `POST /api/knowledge/:id/publish`, `.../withdraw` | Publish a draft (reviewers; not the author); withdraw an approved document with a reason |

Every endpoint requires a session (`401`), checks the role (`403`) and validates
its body (`400`, `415`). Errors share one shape,
`{ error: { code, message, requestId, details? } }`, and every response carries
an `x-request-id` header.

## Status and roadmap

This is under active development. What works today: case creation, AI plan
generation, human review and approval gating, locking, KPI and notes tracking,
server-side persistence, role-based access with review decisions, a per-plan
attributed history, and tests for the rules, the repository and the API.

Next, in order:

- [x] Rename, de-brand, fictional demo data, refactor into small components and hooks
- [x] Fix: approve / complete / reset are persisted atomically
- [x] PostgreSQL persistence on Supabase, Zod validation, request IDs, rate limiting
- [x] Seeded roles with server-enforced permissions, review decisions and per-user audit attribution
- [x] Unit, API and end-to-end tests with CI
- [x] Retrieval-grounded generation with verified source citations over synthetic SOPs
- [x] Evaluation suite for grounding, citations and schema compliance (published at `/evals`)
- [x] Deployment configuration, abuse limits and nightly reset (see `DEPLOYMENT.md`)
- [x] Phase 2 / B1: stable plan URLs and list filters, optimistic concurrency, unsaved-change guard, accurate loading states
- [x] Phase 2 / B4: knowledge lifecycle (drafts, publish, supersede, withdraw), plans flagged when their sources change, untrusted-source prompt hardening, counterfactual demonstration
- [x] Phase 2 / B3: server-verified policy quotations, server-held generation records, stale-plan detection, evidence panel, retrieval record
- [x] Phase 2 / B2: action-level model, revisions and comparison, explicit change-request resubmission, linked assignees, append-only notes

## Deployment

Runs on Vercel (region `icn1`) with Supabase Postgres, with per-address and
global generation limits, a nightly demo reset, and a `/api/health` endpoint.
See [`DEPLOYMENT.md`](DEPLOYMENT.md) for the runbook and its limitations.

## Running locally

```bash
npm install
cp .env.example .env.local   # add DATABASE_URL, SESSION_SECRET, OPENAI_API_KEY
npm run db:migrate           # create the tables in your database
npm run knowledge:ingest     # embed the knowledge base (uses your OpenAI key)
npm run db:check             # verify the connection, tables and seeded personas
npm run dev
```

Open <http://localhost:3000> and sign in as **Maya Chen** (Sustainability
Manager), then use **Load Demo Cases** to explore without calling the model.
Switch to **Daniel Ortiz** (Reviewer) to approve or request changes.

```bash
npm run typecheck
npm run lint
npm test          # unit, repository and API tests
npm run e2e       # Playwright, full browser flow (see below)
npm run evals     # the evaluation benchmark (see Evaluation)
```

## Testing

| Layer | What it covers | How |
| --- | --- | --- |
| Unit | Lifecycle state machine, permissions, action rules, snapshot diffs, UI capabilities, document parsing, embedder | Vitest |
| Repository and retrieval | Transactions, rollbacks, lock rules, provenance and drift, revisions, change requests, authorization matrix, audit accuracy; the data migration against legacy-shaped rows; pgvector retrieval over the real corpus (approved-only, department scope, floor) | Vitest on in-memory Postgres (PGlite) running the **real migrations** |
| API and generation | 401 / 403 / 404 / 400 / 415, forged cookies, CSRF, rate limits; malformed, truncated, retried and over-citing model output | Route handlers and the generation service, fake model |
| End-to-end | A plan moving through four roles in a real browser; grounded and ungrounded plans; role-gated UI; API refusals; deep links, filters in the URL, and two sessions editing one plan | Playwright against the production build |

The end-to-end suite needs no external services. `e2e/server.mjs` starts an
in-memory Postgres exposed over TCP, a fake OpenAI Responses API, and the
production Next.js server, wired together with the same driver and SDK the app
uses in production. It never reads your `.env.local`, so it cannot touch real
data or spend real credit.

CI (GitHub Actions) runs lint, typecheck, tests and build, and the end-to-end
suite in a separate job.
