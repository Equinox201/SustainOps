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

## Knowledge base

`knowledge/` holds synthetic Markdown documents with front matter (`department`,
`document_type`, `region`, `version`, `status`) and numbered sections. One
numbered `###` section is one retrieval chunk and one citation. See
[`knowledge/README.md`](knowledge/README.md).

```bash
npm run knowledge:ingest   # parse, embed and store (idempotent)
npm run knowledge:probe    # show retrieval scores for sample cases
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
| `action_plans` | The plan: case, AI output, owner and dates, readiness, KPI progress, approval state. A DB constraint guarantees a plan can't be completed without being approved. |
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
| `GET/PUT/DELETE /api/action-plans/:id` | Read, edit (lock rules enforced) and delete |
| `POST /api/action-plans/:id/transition` | Approve, request changes, complete or reset; optionally saves pending edits atomically |
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
- [ ] Evaluation suite for grounding, citations and schema compliance
- [ ] Public deployment

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
```

## Testing

| Layer | What it covers | How |
| --- | --- | --- |
| Unit | Lifecycle state machine, permissions, UI capabilities, document parsing, embedder | Vitest |
| Repository and retrieval | Transactions, rollbacks, lock rules, authorization matrix, audit accuracy; pgvector retrieval over the real corpus (approved-only, department scope, floor) | Vitest on in-memory Postgres (PGlite) running the **real migrations** |
| API and generation | 401 / 403 / 404 / 400 / 415, forged cookies, CSRF, rate limits; malformed, truncated, retried and over-citing model output | Route handlers and the generation service, fake model |
| End-to-end | A plan moving through four roles in a real browser; grounded and ungrounded plans; role-gated UI; API refusals | Playwright against the production build |

The end-to-end suite needs no external services. `e2e/server.mjs` starts an
in-memory Postgres exposed over TCP, a fake OpenAI Responses API, and the
production Next.js server, wired together with the same driver and SDK the app
uses in production. It never reads your `.env.local`, so it cannot touch real
data or spend real credit.

CI (GitHub Actions) runs lint, typecheck, tests and build, and the end-to-end
suite in a separate job.
