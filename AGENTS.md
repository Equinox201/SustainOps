# ImpactFlow — contributor and agent guide

ImpactFlow is an AI-assisted sustainability operations platform for hospitality
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
npm test            # vitest run
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
app/api/                     route handlers (thin): plans, transitions, generate, audit
lib/schemas/                 Zod schemas: the single source of truth for data shapes
lib/server/                  server-only code: db, repository, generation, env, api helpers
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
- **Approved plans are locked.** The case, accountability fields and AI output
  are read-only until approval is reset. Completed plans are immutable.
- **Human review is mandatory.** `humanReviewRequired` is always `true` in the AI
  schema and in the UI copy. Do not add an auto-approve path.
- **Keep the AI contract strict.** Changes to the plan shape must update the
  JSON schema, the validators and the prompt together, and must keep the
  structured-output guarantee.
- **No guest personal data** in prompts, fixtures or logs.
- Keep components small. Prefer extracting a component or hook over growing a
  file past a few hundred lines.

## Roadmap

Planned, in order: seeded roles with server-enforced permissions and
per-user audit attribution, a fuller test suite with CI, retrieval-grounded
generation with source citations, and an evaluation suite. See `README.md`.
