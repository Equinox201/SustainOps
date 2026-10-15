# SustainOps

[![CI](https://github.com/Equinox201/SustainOps/actions/workflows/ci.yml/badge.svg)](https://github.com/Equinox201/SustainOps/actions/workflows/ci.yml)

AI-assisted sustainability operations for hospitality teams. SustainOps turns an
operational issue such as rising laundry volume, buffet food waste or low-occupancy
energy use into a structured action plan that is reviewed by a person, approved,
tracked against KPIs, and closed out.

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
6. Track implementation notes and KPI progress, then mark the plan done.

## Roles and governance

Plans are written by one role and approved by another. Permissions are
defined once in [`domain/permissions.ts`](features/action-plans/domain/permissions.ts)
and enforced on the server, inside the same transaction as the change.

| | Sustainability Manager | Department Manager | Reviewer |
| --- | :---: | :---: | :---: |
| See plans | all | own department | all |
| Create cases, generate, edit plans | ✓ | | |
| Implementation notes and KPI progress | ✓ | ✓ | |
| Approve or request changes (with a comment) | | | ✓ |
| Reset approval | ✓ | | ✓ |
| Mark done, delete | ✓ | | |
| Organisation audit log | ✓ | | ✓ |

- A plan's author cannot approve it, and the approver and approval time are recorded.
- Approved plans are locked: only notes and KPIs change. Completed plans accept notes only.
- Every action is attributed to a user in a per-plan history.
- Out-of-scope plans answer `404`, so a department manager can't probe for other departments' plans.
- Human review is always required; there is no auto-approve path.
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

Latest full run (`gpt-5-mini`, `text-embedding-3-small`, commit `bf47943`):

| | Result | 95% CI |
| --- | --- | --- |
| Cases passing every hard check | **24 / 24** | |
| Gold section retrieved (hit rate) | 21 / 21 | 85–100% |
| Gold section recall | 32 / 33 | 85–99% |
| Forbidden / superseded document retrieved | **0 / 24** | 0–14% |
| Off-topic cases that correctly retrieved nothing | 2 / 2 | 34–100% |
| Plans valid on the first attempt | 24 / 24 | 86–100% |
| Recommended actions citing a retrieved source | 101 / 104 | 92–99% |
| Citations to sources the model was never given | 0 / 151 | 0–2% |
| Percentage/temperature figures not traceable to the case or sources | 2 / 21 | 3–29% |
| Cited actions an LLM judge rated **fully** supported | 37 / 101 | 28–46% |
| Cited actions rated at least partly supported | 100 / 101 | 95–100% |
| Latency, median / p95 | 15.9 s / 20.7 s | |

How to read it, including the parts that are less flattering:

- **The hard guarantees held.** No superseded or wrong-department document was
  retrieved, the trap case did not repeat the superseded figure, injected
  instructions and guest identifiers were not echoed, and off-topic cases were
  labelled as general guidance.
- **"Partially supported" is the common verdict, not "fully".** Across four
  full runs the fully-supported share ranged 37–43%. Inspecting the verdicts
  shows the typical partial action follows a cited section and adds operational
  detail (a duration, a logging step), which is often desirable but is not the
  same as the policy saying it. Surfacing "what the policy says" separately from
  "what this plan proposes" is the obvious next product improvement.
- **The judge is the same model family as the generator**, so it may be
  lenient, and it is a screening signal rather than ground truth.
- **Untraceable figures are a proxy.** The two flagged here were a target the
  plan proposed (100%); in an earlier run one was the model converting "one in
  seven" to 14%. Neither is invented policy, which is why this is reported but
  does not fail a case.
- **Confidence is not discriminating.** 18 of 24 plans report High. The server
  caps it when grounding is weak, but among grounded plans the model almost
  always says High, so it should not be relied on.
- **Small and synthetic.** 24 cases over 49 synthetic sections, labelled by one
  person and written against the corpus. The first version of the benchmark was
  too easy (a lexical embedder passed 20 of 20), which is why paraphrased cases
  were added; the intervals above are wide.

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
| `users` | Seeded fictional personas with a role (and a department for department managers). |
| `audit_events` | Append-only history of what happened to which plan and who did it. Written in the same transaction as the change. |
| `ai_generations` | Every generation attempt: user, model, prompt version, latency, token use, outcome, the sources retrieved and how many citations were dropped. Also backs rate limiting. |
| `knowledge_documents`, `knowledge_chunks` | The approved knowledge base and its section-level vectors (pgvector, in the `extensions` schema). |

Row Level Security is enabled on every table with no policies, so nothing is
reachable through Supabase's public Data API; only the server reads and writes.

## API

| Method and path | Purpose |
| --- | --- |
| `GET/POST /api/action-plans` | List and create plans |
| `GET/PUT/DELETE /api/action-plans/:id` | Read, edit (lock rules enforced; body carries `expectedVersion`, stale writes answer `409`) and delete |
| `POST /api/action-plans/:id/transition` | Approve, request changes, complete or reset; optionally saves pending edits atomically. Carries `expectedVersion` |
| `GET /api/action-plans/:id/history` | The plan's attributed audit history |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET /api/auth/personas` | Demo sign-in |
| `POST /api/action-plans/generate` | Generate a plan (validated, rate-limited, timed out, recorded) |
| `GET /api/audit-events` | Organisation-wide recent events (managers and reviewers) |
| `GET /api/knowledge` | The knowledge base catalogue |

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
| Unit | Lifecycle state machine, permissions, UI capabilities, document parsing, embedder | Vitest |
| Repository and retrieval | Transactions, rollbacks, lock rules, authorization matrix, audit accuracy; pgvector retrieval over the real corpus (approved-only, department scope, floor) | Vitest on in-memory Postgres (PGlite) running the **real migrations** |
| API and generation | 401 / 403 / 404 / 400 / 415, forged cookies, CSRF, rate limits; malformed, truncated, retried and over-citing model output | Route handlers and the generation service, fake model |
| End-to-end | A plan moving through four roles in a real browser; grounded and ungrounded plans; role-gated UI; API refusals; deep links, filters in the URL, and two sessions editing one plan | Playwright against the production build |

The end-to-end suite needs no external services. `e2e/server.mjs` starts an
in-memory Postgres exposed over TCP, a fake OpenAI Responses API, and the
production Next.js server, wired together with the same driver and SDK the app
uses in production. It never reads your `.env.local`, so it cannot touch real
data or spend real credit.

CI (GitHub Actions) runs lint, typecheck, tests and build, and the end-to-end
suite in a separate job.
