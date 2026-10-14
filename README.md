# ImpactFlow

AI-assisted sustainability operations for hospitality teams. ImpactFlow turns an
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
OpenAI Responses API with strict structured output · Vitest

## Project structure

```
app/                         routes and the /api/action-plan endpoint
lib/                         shared types, prompts, demo data
features/action-plans/
  components/                UI, composed from small pieces
  hooks/                     useActionPlans, useActionPlanEditor, useTelemetry
  domain/                    pure logic: lifecycle, validation guards, utilities
  services/                  calls to the backend API
  storage/                   browser persistence (placeholder for a database)
```

## Status and roadmap

This is under active development. What works today: case creation, AI plan
generation, human review and approval gating, locking, KPI and notes tracking,
a status overview, and a test suite for the lifecycle rules.

Browser `localStorage` is a placeholder. Next, in order:

- [x] Rename, de-brand, fictional demo data, refactor into small components and hooks
- [x] Fix: approve / complete / reset are persisted atomically
- [ ] PostgreSQL persistence on Supabase, Zod validation, rate limiting
- [ ] Seeded roles with server-enforced permissions and a persistent audit trail
- [ ] Unit, API and end-to-end tests with CI
- [ ] Retrieval-grounded generation with source citations over synthetic SOPs
- [ ] Evaluation suite for grounding, citations and schema compliance
- [ ] Public deployment

## Running locally

```bash
npm install
cp .env.example .env.local   # then add your OPENAI_API_KEY
npm run dev
```

Open <http://localhost:3000>, use **Load Demo Cases** to explore without calling
the API, or create a new plan and generate it with the model.

```bash
npm run typecheck
npm run lint
npm test
```
