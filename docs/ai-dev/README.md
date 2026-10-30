# AI-assisted development record

How AI tools were used to build SustainOps, written by me (Nicolas Samarine) for the 42 Singapore B1 Builders
submission. SustainOps is the organisation-scale project of the pair; the individual-use project is
[TimeTracker42](https://github.com/Equinox201/TimeTracker42). The product, its architecture and its measured
limits are in the [README](../../README.md).

**Where the evidence is:** the git history has 16 commits on `main` and 14 merged pull requests (#1 to #14), made
between 14 and 29 October 2026. The pull-request branches hold 33 distinct commits, and all 33 carry a
`Co-Authored-By: Claude` trailer.

**Who wrote what.** The original interview prototype is the starting point of this repository (the first commit).
I wrote its form and the basic logic that calls OpenAI myself; I then let Codex take over the prototype. When I
moved from the prototype to the SustainOps version, I moved to Claude Code, which wrote the code from there on.
My part throughout was direction, decisions, secrets, review and merging.

## AI Tools

| Tool | Purpose |
|---|---|
| **Claude Code** (desktop app, model `claude-sonnet-5-5`) | The main developer of SustainOps from the first milestone on: implementation, tests, debugging, reading CI and production state, drafting documentation, opening pull requests. It also ran the evaluation and probe scripts in my terminal, because they needed my API key |
| **Codex** (OpenAI) | The original interview prototype: I wrote the form and the basic OpenAI call myself, and Codex then built out the rest. Later, on 29 October, one read-only independent review of the submission; its report contained errors, and I checked each finding myself before acting on any |
| **ChatGPT** | A roadmap for turning the prototype into a portfolio project (which I pasted into Claude Code and asked it to critique), and a summary of the programme requirements |
| **OpenAI API** (in the product) | `gpt-5-mini` with strict structured output generates the action plans, and a model from the same family acts as the judge in the evaluation; `text-embedding-3-small` embeds the policy documents |

**Agents.** Claude Code was the only AI agent, working in one long session. I did not define sub-agents or custom
roles. The standing instructions any agent follows in this repository are in [`AGENTS.md`](../../AGENTS.md):
fictional data only, schema-bound AI output, tests required, evaluation kept in step with the product. Claude Code
used its plan mode three times (the Phase 2 roadmap, the submission plan, a CI fix) and asked me multiple-choice
questions at decision points.

**MCP servers.** Supabase (tables, migrations, queries, security advisors), Vercel (projects, documentation), a
terminal tool (commands in my own terminal tab, so that secrets stayed with me), a built-in browser (the
click-through against the live database, and the screenshots) and GitHub pull-request status. When the Supabase
and Vercel connectors failed or could not see my projects, Claude Code fell back to the `gh` and `vercel` CLIs or
to commands in my terminal instead of asking for credentials.

**Skills.** None were invoked.

## Development Approach with AI

**How I worked.** I describe a goal, or paste an outside opinion (a ChatGPT roadmap, a list of features, a CI
log). Claude Code reads the code, history and production state before acting, tells me what it found, including
where the outside opinion was wrong, and proposes a sequence. I answer the decisions, often with one word
("proceed"). Each milestone or bundle is one branch and one pull request; I review CI and a click-through against
the real database, merge it myself, and Claude Code then checks production and says what it could not verify.
Rules I set along the way: fictional data only, secrets entered by me, deletions only on my say-so, and nothing
merged that I had not been told how to verify.

### Key prompts

Verbatim excerpts, typos included.

| # | Prompt | What the AI did | What I decided |
|---|---|---|---|
| 1 | "I have a project that I built for an interview that I want to make CV ready ... I initially built this with chatgpt and here is what it recommended to make it an asset on my profile, help me performa similar analysis and let me know what you would do and plan how you would do it" (followed by ChatGPT's roadmap) | Read the code and history, found a real lifecycle bug, corrected ChatGPT's file paths and called the roadmap "directionally right but too big". It disagreed with it on several points, including verifying citations on the server, putting limits in before any public link, and not publishing invented evaluation numbers | Approved with "Okay lets proceed", and chose the public repository, the database and the name |
| 2 | "I added my github repo to the supabase setting connections / I updated the correct drizzle supabase link / I have merged the PR" | Ran the whole workflow as each persona against my live database. Found two bugs its own tests had missed (a phantom audit event from `jsonb` key order, and a missing CSRF check on body-less requests). Diagnosed that my network dropped port 6543 while 5432 worked | Merged the fixes (#4) |
| 3 | "I pushed all 4 secrects and generate the cron_secret", then "M6 has conflicts so I cant merge jsut yet, what are the issues?" | Admitted its own mistake: it had created a duplicate Vercel project because a connector returned an empty list. Explained the conflict (I had squash-merged #7, so #8 still held the original commits), proved the trees were identical and resolved it without changing content | Said "proceed" to deleting the empty duplicate; squash merges became the rule |
| 4 | "what do you think about the following features? would theere be any additional profile value to developping these?" (followed by 33 proposed features) | Judged the list "a good product roadmap and a poor portfolio backlog": about 14 features worth building, 8 cheap polish items, 11 to skip. Asked my target role (full-stack / product engineer) and time budget (3+ weeks), then planned five bundles, B1 to B5, each with a measurable claim | Accepted the plan and merged B1 to B4 (#10 to #13) |
| 5 | "does the project actually use supabase?" | Searched the code: Supabase is only the hosted Postgres, through Drizzle. No Supabase client, Auth, Storage or Realtime | Accepted; the README's technology section now says exactly that |
| 6 | "this is the CI error I get" (a pasted failing Playwright log) | Found its own mistake: `.gitignore` swallowed the generated counterfactual report, so CI built a page without it, and so would production. Fixed it narrowly, did not weaken the test, and verified on a fresh clone | Merged after CI passed |
| 7 | "I need to submit my project tomorrow for the B1 builders program ... Is it possible to do B5 first or should I stop here and get ready for submission and work on B5 at a later time?" | Recommended stopping: B5 was five to six days of work, would add a deploy-coupled migration and a new public write surface the night before | Accepted: no new features before submission |

In prompt 1 I wrote that I built the prototype with ChatGPT. To be precise, the prototype was built with Codex (see
AI Tools), and the roadmap I pasted was ChatGPT's.

### Key review points and decisions

| Review point | Decision | Who |
|---|---|---|
| Make the interview prototype a public project with fictional data and no company branding | Accepted; the original repository was made private | Me |
| ChatGPT's roadmap | Modified: kept the direction, cut scope, reordered into milestones M0 to M6, rejected its example metrics | Claude Code proposed, I approved |
| Supabase as Postgres only, through Drizzle | Accepted | Me (constraint), Claude Code (integration) |
| Seeded personas instead of real sign-up | Accepted | Claude Code proposed, I approved |
| Never trust the model's citations or labels: the server keeps a "policy requirement" label only if the quotation appears word for word in a cited source, otherwise it downgrades it with a reason | Accepted (PRs #6, #12) | Claude Code proposed, I approved |
| Retrieval similarity floor: from a guess of 0.28 to a measured 0.45 after probing the real embedding model | Accepted; the README states it rests on six probe cases | Claude Code, from measurements I ran |
| Publish evaluation limits, including results that did not flatter the project | Accepted | Claude Code proposed, I approved |
| Build 14 of 33 features; defer collaboration threads, cross-department plans and lessons-from-history | Accepted | Claude Code recommended, I approved |
| Do not build B5 before the submission | Accepted | Me |
| Independent Codex review: fix its confirmed findings now? | No code changes the day before submission. Five real findings are documented under "Known limitations of the public demo" in the README | Me |

### Verification

- 267 unit, repository and API tests in 25 files. Repository tests run on an in-memory Postgres (PGlite) with the
  **real migrations**, so SQL, constraints, row locks and rollbacks are exercised. 18 Playwright end-to-end tests
  run against the production build with a fake AI and their own database, so they need no credentials.
- Forged and paraphrased quotations, citations to sources the model was never given, malformed and truncated model
  output, forged session cookies, cross-site requests, stale writes and self-approval are all covered by tests.
- A 24-case evaluation through the production retrieval and generation code, published at `/evals` with its
  confidence intervals and limits.
- A click-through against the real database before merging, and anything depending on committed files checked on a
  fresh clone after the CI failure above. Claude Code checked production after the later merges (`/api/health`,
  sign-in as each role, a real generation).
- The nightly demo reset: the live audit log shows a scheduled reset with no actor at 20:31 UTC on 29 October.
  One run is not a track record.

## Reflection

I first built this as a prototype for a hotel company, as part of a job interview. I wrote the form and the basic OpenAI call myself, Codex built out the rest of the prototype, and
I then rebuilt it, with Claude Code, as an independent project and built it out with retrieval-augmented generation over approved policy documents and with
concrete KPIs. It is a mix of my professional operational experience and my understanding of how departments
could use AI to improve operations. It went from a simple prototype for that interview to a fully worked-out
platform that could, one day, become a standalone product, and it has helped me turn operational needs into
technical product development and deployment.

**What worked.** Asking Claude Code to critique an outside plan before implementing it, and then deciding.
Making the unglamorous claim checkable: a quotation either appears in the source or it does not. Publishing the
evaluation with its limits, including results that did not flatter the project (an LLM judge rated 56 of 95 cited
actions fully supported, and the quotation check has never rejected a real quotation). Keeping the data fictional
and the repository public so that everything can be inspected.

**What failed, and what changed.**
- Tests missed two bugs that only a click-through against the real database found (a phantom audit event and a
  CSRF gap), so a real-database click-through became part of how changes were verified before merging.
- Claude Code created a duplicate Vercel project because a connector returned an empty list, and a `.gitignore`
  rule hid a generated file so CI failed. Both were its mistakes and it said so; changes that depend on committed
  files are now verified on a fresh clone.
- Stacked pull requests caused a merge conflict (#8); squash merges became the rule.
- Schema changes were coupled to deploys, which meant short windows of load errors on the demo after three merges.
- A second model's review contained errors as well as real findings, so I checked every item against the code
  instead of trusting it.
