# SustainOps — contributor and agent guide

SustainOps is an AI-assisted sustainability operations platform for hospitality
teams. It turns an operational sustainability issue (for example, laundry volume
creeping above baseline) into a structured action plan that a human reviews,
approves, tracks against KPIs, and eventually closes.

It is **not** a general chatbot. Every AI output is a structured, schema-bound
plan that goes through a human review lifecycle.

## Fictional data

All properties, policies, people and metrics are **fictional**. Demo properties:
Harbour House Singapore, Alpine Bay Resort, Seaview Urban Hotel. Never add real
company names, real internal documents, or guest personal data to this repo.

## Commands

```bash
npm run dev         # start Next.js on http://localhost:3000
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest run (unit, repository on PGlite, API)
npm run e2e         # Playwright; boots its own DB, fake AI and server
npm run build       # production build
npm run db:generate # generate a SQL migration from lib/server/db/schema.ts
npm run db:migrate  # apply migrations to DATABASE_URL
```

The app needs `DATABASE_URL` (Supabase Postgres) and `OPENAI_API_KEY` in
`.env.local` (see `.env.example`).
Run `typecheck`, `lint` and `test` before considering a change done.

## Stack

Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, the
OpenAI Responses API with strict JSON-schema output, Zod, Drizzle ORM on
Supabase Postgres, Vitest (database tests run on in-memory Postgres via PGlite).

## Layout

```
app/api/                     route handlers (thin): auth, plans, transitions, generate, audit
lib/schemas/                 Zod schemas: the single source of truth for data shapes
lib/server/                  server-only: db, repository, generation, retrieval, env, api helpers
lib/knowledge/               pure parser/chunker for knowledge documents
knowledge/                   synthetic Markdown corpus (numbered sections = citations)
evals/                       benchmark cases, methodology, published results
lib/evals/                   metrics, harness, judge, report builder
scripts/                     ingest-knowledge, probe-retrieval, run-evals, inspect-eval, check-db
lib/server/db/schema.ts      Drizzle schema (migrations are generated into drizzle/)
features/action-plans/
  components/                UI; ActionPlanEditor composes the small pieces
  hooks/                     state: useActionPlans, useActionPlanEditor, ...
  domain/                    pure logic with no React or I/O (lifecycle, utils)
  services/                  typed client for the backend API
```

## Rules that matter

- **One place for lifecycle rules.** Approve, complete and reset-approval are
  defined in `domain/lifecycle.ts` as pure functions that return a full next
  plan. Never flip `approved` / `completed` flags directly in UI code.
- **The server is the authority.** The same lifecycle rules run in the browser
  for fast feedback, but `lib/server/action-plan-repo.ts` enforces them. Every
  write is one transaction that updates the plan *and* records its audit event.
- **Zod schemas are the contract.** Change shapes in `lib/schemas/` only; the
  API, client and OpenAI schema derive from there.
- **Tables are private.** RLS is on with no policies, so tables are not exposed
  through Supabase's Data API. Keep it that way; access goes through the server.
- **Authorization is server-side and role-based.** Rules live in
  `domain/permissions.ts`; the repository checks them inside the transaction.
  UI gating (`domain/capabilities.ts`) is a convenience, never the boundary. A
  plan's author cannot approve it; reviewers cannot edit plan content.
- **Approved plans are locked.** The case, accountability fields and AI output
  are read-only until approval is reset. Completed plans are immutable.
- **Human review is mandatory.** `humanReviewRequired` is always `true` in the AI
  schema and in the UI copy. Do not add an auto-approve path.
- **The model's citations are untrusted.** `finalizePlan` drops any source id
  that was not retrieved and derives grounding and the confidence cap itself.
  Never let the model set `sources` or `grounding`.
- **Retrieval is metadata first.** Only `status = approved` documents for the
  case's department (or "All departments") are eligible; similarity only ranks.
- **Corpus content is synthetic.** Never add real company documents to
  `knowledge/`. Every file carries the synthetic banner (a test enforces it).
- **Evals are part of the product.** Change retrieval, the prompt or the
  similarity floor, and re-run `npm run evals`. Publish what it measures,
  including failures; never edit a report by hand. If a metric turns out to
  measure wording instead of behaviour, remove it and say so.
- **Keep the AI contract strict.** Changes to the plan shape must update the
  JSON schema, the validators and the prompt together, and must keep the
  structured-output guarantee.
- **No guest personal data** in prompts, fixtures or logs.
- Keep components small. Prefer extracting a component or hook over growing a
  file past a few hundred lines.

## Roadmap

Planned: deployment (with the abuse caps), then product work the evals point
at: separating "what the policy says" from "what this plan proposes", and a
confidence signal that discriminates. See `README.md`.
