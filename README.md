# SustainOps

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

## Governance

- Human review is always required; there is no auto-approve path.
- Approval is gated by an owner, dates and a readiness checklist.
- Approved plans are locked; completed plans are immutable.
- Lifecycle rules live in one pure module ([`domain/lifecycle.ts`](features/action-plans/domain/lifecycle.ts)) and every transition is persisted as a single complete write.
- Users are reminded not to enter guest personal data.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 ·
OpenAI Responses API with strict structured output · Zod · Drizzle ORM ·
Supabase Postgres · Vitest (+ PGlite)

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
| `audit_events` | Append-only history of what happened to which plan. Written in the same transaction as the change. |
| `ai_generations` | Every generation attempt: model, prompt version, latency, token use and outcome. Also backs rate limiting. |

Row Level Security is enabled on every table with no policies, so nothing is
reachable through Supabase's public Data API; only the server reads and writes.

## API

| Method and path | Purpose |
| --- | --- |
| `GET/POST /api/action-plans` | List and create plans |
| `GET/PUT/DELETE /api/action-plans/:id` | Read, edit (lock rules enforced) and delete |
| `POST /api/action-plans/:id/transition` | Approve, complete or reset, optionally saving pending edits atomically |
| `POST /api/action-plans/generate` | Generate a plan (validated, rate-limited, timed out, recorded) |
| `GET /api/audit-events` | Recent audit events |

Errors share one shape, `{ error: { code, message, requestId, details? } }`,
and every response carries an `x-request-id` header.

## Status and roadmap

This is under active development. What works today: case creation, AI plan
generation, human review and approval gating, locking, KPI and notes tracking,
server-side persistence with an audit log, and tests for the lifecycle rules
and the repository.

Next, in order:

- [x] Rename, de-brand, fictional demo data, refactor into small components and hooks
- [x] Fix: approve / complete / reset are persisted atomically
- [x] PostgreSQL persistence on Supabase, Zod validation, request IDs, rate limiting
- [ ] Seeded roles with server-enforced permissions and per-user audit attribution
- [ ] Unit, API and end-to-end tests with CI
- [ ] Retrieval-grounded generation with source citations over synthetic SOPs
- [ ] Evaluation suite for grounding, citations and schema compliance
- [ ] Public deployment

## Running locally

```bash
npm install
cp .env.example .env.local   # add DATABASE_URL and OPENAI_API_KEY
npm run db:migrate           # create the tables in your database
npm run dev
```

Open <http://localhost:3000>, use **Load Demo Cases** to explore without calling
the model, or create a new plan and generate it.

```bash
npm run typecheck
npm run lint
npm test
```
