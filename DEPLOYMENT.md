# Deploying SustainOps

SustainOps runs on **Vercel** (Next.js, function region `icn1`/Seoul, next to the
database) with **Supabase** Postgres. The demo is public, shared and
passwordless, so it ships with abuse limits and a nightly reset.

```
Visitor -> Vercel (Next.js, icn1) -> Supabase Postgres (ap-northeast-2)
                |                          transaction pooler :6543
                +-> OpenAI (generation + embeddings)
Vercel Cron 20:00 UTC -> /api/cron/reset-demo
```

## 1. Deploy

1. Merge the deployment PR into `main` (use **Squash and merge**).
2. In Vercel: **Add New → Project**, import `Equinox201/SustainOps`. Vercel will
   ask to install its GitHub app on the repository; allow it.
3. Framework preset is detected (Next.js). Leave build settings alone;
   `vercel.json` pins the region and the cron, and `package.json` pins Node 22
   (the version CI tests on; Vercel otherwise defaults to the newest).
4. Add the environment variables below **before** the first deploy
   (Production and Preview).
5. Deploy.

## 2. Environment variables

**Secrets** (mark as *Sensitive*):

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Supabase **transaction pooler** string (port **6543**) with your real database password. Prisma-only params such as `?pgbouncer=true` are ignored. |
| `OPENAI_API_KEY` | Your key. Set a monthly usage limit in the OpenAI dashboard as a hard backstop. |
| `SESSION_SECRET` | `openssl rand -base64 32`. Signs the session cookie. Use a **different** value from local development. |
| `CRON_SECRET` | `openssl rand -hex 24`. Vercel sends it as a bearer token to the nightly reset; with it unset the endpoint refuses every request. |

**Configuration** (not secret):

| Variable | Suggested | Why |
| --- | --- | --- |
| `DATABASE_POOL_MAX` | `1` | Each serverless instance should hold one connection through the pooler. |
| `GENERATION_DAILY_CAP` | `60` | Global ceiling on model calls per 24 hours. |
| `GENERATION_LIMIT_PER_HOUR` | `15` | Per persona (personas are shared by every visitor). |
| `GENERATION_IP_LIMIT_PER_HOUR` | `4` | Per visitor address. This is the limit that bounds one person. |
| `RATE_LIMIT_SALT` | optional | Salts the hashed addresses. Defaults to a value derived from `SESSION_SECRET`, so it needs no separate setting. |

Everything else has a sensible default (`OPENAI_MODEL=gpt-5-mini`,
`EMBEDDINGS_PROVIDER=openai`, similarity floor `0.45`). The knowledge base was
ingested into the database once with `npm run knowledge:ingest`; deploys do not
need to re-run it.

## 3. Verify

```bash
curl -s https://<your-domain>/api/health
# {"status":"ok","database":"ok","knowledge":{"approvedDocuments":6,"sections":49},...}
```

Then in the browser: `/evals` loads; sign in as **Maya Chen**; **Load Demo
Cases** shows plans with citations; **Generate** produces a grounded plan.

## 4. Operating it

- **Nightly reset.** At 20:00 UTC every plan and its history is replaced with the
  fictional demo plans. Generation records are kept, because the rate limits
  depend on them. A manager can also press **Reset demo data**.
- **If the daily cap is hit**, generation returns a clear 429 until it rolls
  over; browsing, review and approval keep working.
- **Logs.** Generation failures log the request id, error code and field-level
  diagnostics (paths and rule names only, never model content).
- **Changing the schema.** Generate with `npm run db:generate`, apply with
  `npm run db:migrate` against the production `DATABASE_URL` (use the session
  pooler, port 5432, for migrations if your network drops 6543).

## 5. Known limitations of the public demo

- Personas have **no passwords**: anyone can act as any role. That is the point
  of the demo, and it is stated on every screen, but it is not production auth.
  `getSessionPrincipal` is the single seam to replace with a real identity
  provider.
- All visitors share one database. The nightly reset bounds the damage and the
  data is fictional, but one visitor can see another's edits.
- There is no content-security-policy for scripts (the App Router needs
  per-request nonces for that); clickjacking is blocked with
  `frame-ancestors 'none'`.
- Rate limits use the platform's `x-forwarded-for`. They are a cost control for a
  demo, not a defence against a determined attacker with many addresses; the
  daily cap and the OpenAI usage limit are the backstops.
