# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AIVis: checks whether a business shows up when AI search engines (ChatGPT,
Gemini, via Perplexity's Agent API) are asked about their category. Two
implementations share one core:

- **`proof-script/`** (Approach A) — a local CLI, run manually by one person
  against a hand-curated prospect list. No server, no DB, no accounts. Still
  the tool for hand-curated outbound (see `TODOS.md`'s GTM notes) — untouched
  by the SaaS pivot below.
- **The repo root** (Approach B) — a hosted, self-serve, multi-tenant SaaS
  deployed to Netlify as site `aivis-scan`: users sign up, add companies they
  want to track, run scans against them, and watch a score-over-time trend.
  This **was** a single-operator, passphrase-gated stateless-link tool until
  2026-08-03, when the CEO confirmed a deliberate pivot to self-serve
  multi-tenant SaaS (see memory `aivis-saas-pivot-2026-08-03` and the
  executed plan at `~/.claude/plans/cheerful-leaping-dragon.md` for the full
  milestone-by-milestone history). `result.html` — the old stateless
  shareable-link page — is kept alive indefinitely alongside the new
  authenticated app so links shared before the pivot never break; it is
  otherwise frozen and receives no new traffic.
- **`shared/aivis-core.mjs`** — the single source of truth for prompt
  templates, models, brand-detection, scoring, and the Perplexity API call.
  Imported by `proof-script/index.mjs`, every `netlify/functions/*.mts` that
  needs it, and the Vue app under `src/`. Deliberately kept as plain untyped
  `.mjs` at this exact path — `proof-script` runs via plain `node index.mjs`
  with zero deps and zero transpilation, so it cannot load a `.ts` file.
  Converting or moving this file would break proof-script outright. Every
  export added since the SaaS pivot (`buildDeepAdvicePrompt`,
  `parseDeepAdviceResponse`) follows this same constraint and is additive
  only — nothing existing has been removed or renamed.

The full rationale for the *original* stateless-link design (why Approach A
first, what was rejected, what's deferred) lives in the design doc at
`~/.gstack/projects/ai-business-score/marc-none-no-git-repo-design-20260728-153615.md`
and its eng-review addendum — still useful history, but read it knowing the
"no database, no accounts" scoping it documents was reversed on 2026-08-03,
not just the earlier "add a Blobs store" reversal it already describes.
Vertical prompt templating is still deliberately deferred per that doc's
original reasoning (see `TODOS.md`).

**Known limitation, unchanged by the pivot:** real Perplexity calls with
`web_search` grounding routinely take 15-20s, sometimes longer. A scan runs
10 prompts x 2 models = 20 calls (prompts grew from 3 to 10 on 2026-08-09 at
a live user's request — see `shared/aivis-core.mjs`'s `PROMPT_TEMPLATES`
comment; models briefly grew to 6 the same day, then were reverted to the 2
live-verified ones — see the `MODELS` comment for why) with a 60s per-call
timeout. This used to force the whole `/scan` request to stay synchronous
and tightly timeout-budgeted — that constraint is gone since Milestone 5
made scans asynchronous (see "Async scan execution" below).

Also changed 2026-08-09, after a live user flagged the original
fire-everything-via-`Promise.all` approach as a real risk once call counts
grew: `run-scan-background.mts` now runs calls through a concurrency-limited
worker pool (`runWithConcurrency` in `aivis-core.mjs`, limit 10) instead of
all at once, and every call shares one scan-wide `SCAN_DEADLINE_MS` (100s)
via a single `AbortController` — this is what actually bounds worst-case
scan latency as prompt/model count grows, since previously each call got
its own full retry budget regardless of how long the batch had already run
(one straggler retrying 3x at 60s with no backoff could drag a 6-call scan
past 3 minutes even though the other 5 finished in 20s). `callModelWithRetry`
also dropped from 3 attempts to 2 and added a 1s backoff between them —
losing one call out of 6 was a meaningful chunk of the data, but with more
prompts each individual call matters less to the aggregate score, so it's
worth capping per-call worst-case latency instead of retrying aggressively;
the backoff specifically avoids re-hammering a live rate limit. Calls still
in flight when the scan deadline fires are aborted and counted as failed,
same as any other failure — and per-check failure detail (which
prompt/model) still isn't persisted to the DB, only the aggregate count, so
diagnosing *which* calls hit the deadline vs. a real error needs the
Netlify function logs.

## Deployment

- **Netlify site:** `aivis-scan`, site ID `70e29675-6562-4245-831a-7a3392e51980`,
  team `dizid`. Git-connected CI — pushing to `master` triggers a build.
- **Neon project:** `aivis`, project ID `square-snow-36406551`, org
  `org-raspy-sound-58493566` ("Marc de"), database `neondb`, branch `main`
  (`br-little-queen-axuj51in`). Created 2026-08-03 specifically for this
  app — do not confuse with the org's ~16 other unrelated Neon projects.
- **Neon Auth (Better Auth 1.4.18):** base URL
  `https://ep-polished-flower-axm1d600.neonauth.c-4.us-east-2.aws.neon.tech/neondb/auth`,
  JWKS at `.../auth/.well-known/jwks.json`. `https://aivis-scan.netlify.app`
  is in Neon Auth's `trusted_origins` (was empty at provisioning time —
  required for browser sign-up/sign-in to work from the deployed site, not
  just `localhost`).
- Env vars on the Netlify site (all non-secret, per standing rule):
  `PERPLEXITY_API_KEY`, `DATABASE_URL` (Neon pooled connection string),
  `NEON_AUTH_JWKS_URL`. `SCAN_PASSPHRASE` was removed 2026-08-03 (Milestone 8
  cleanup) once nothing in code referenced it anymore.

## Commands

**Local script** (from `proof-script/`):

```bash
node index.mjs --dry-run                       # sanity-check the pipeline, no network calls, no cost
node index.mjs --prospects prospects.json       # the real run (needs PERPLEXITY_API_KEY in .env)
node index.mjs --prospects prospects.json --concurrency 4 --out results
node index.mjs --help
```

Setup: copy `proof-script/.env.example` to `proof-script/.env` and set
`PERPLEXITY_API_KEY`. Copy `proof-script/prospects.example.json` to
`prospects.json` and fill in real prospects (schema: brand, website,
competitors, category, use_case, region, customer_segment).

**Hosted site** (from the repo root):

```bash
npm install       # from the repo root, after any dependency change
npm run dev       # Vite dev server on :5173, @netlify/vite-plugin emulates
                   # functions/blobs/env vars locally (no netlify dev needed)
npm run type-check  # vue-tsc --noEmit (covers netlify/functions/**/*.mts too, not just src/)
npm run build     # vue-tsc --noEmit && vite build -> dist/
```

Deploys go through **git-connected Netlify CI** (site `aivis-scan`, team
`dizid`) — pushing to `master` triggers Netlify to run `npm run build` and
publish `dist`. `netlify.toml` sets `command = "npm run build"`,
`publish = "dist"`, `functions = "netlify/functions"`,
`node_bundler = "esbuild"`, plus a `[[redirects]]` rule rewriting `/app/*` to
`/app.html` for the SPA (see below).

No lint config, no test framework anywhere in this repo — `proof-script/`
stays zero-dep, plain `node index.mjs`, no build step. The hosted site's
Netlify Functions are bundled independently by Netlify's own esbuild
function bundler at deploy time — they import `../../shared/aivis-core.mjs`
directly and are unaffected by the frontend's Vite build (both are now
type-checked by the same `npm run type-check`, though — `tsconfig.json`'s
`include` covers `netlify/functions/**/*.mts` since Milestone 0 of the
pivot, fixing a real gap where those files were never type-checked before).
Formal automated tests were explicitly deferred in favor of `--dry-run` as
the pre-flight check for `proof-script/` and `vue-tsc`/manual browser
verification for the hosted site — this constraint predates the pivot and
wasn't revisited by it.

## Architecture

### Database schema (Neon Postgres, `public` schema)

- **`user_profiles`** — one row per signed-up user, `user_id` FK to
  `neon_auth."user".id` (a `uuid`, not `text` — confirmed by inspecting the
  live schema before writing this, don't assume). Holds `plan_tier` (default
  `'free'`) as a metering/plan-gating hook for later — nothing reads it yet.
- **`companies`** — a tracked business, `owner_user_id` FK to
  `user_profiles`. Single owner per company (CEO decision, 2026-08-03) —
  extending to team/agency shared access later is a pure additive migration
  (a `company_members` join table), not a breaking one. `is_legacy_import`
  flags companies created by the one-off Blobs backfill (Milestone 3) —
  those are the founder's own prospect-research history (scans of *other*
  businesses for outbound), not "the user's own company," labeled honestly
  rather than force-fit into the new model.
- **`scans`** — one row per scan, `company_id` FK, `status` (`pending` →
  `running` → `completed`/`failed`), denormalized `brand`/`website`/
  `category` snapshot at scan time, `jsonb` columns for
  `per_prompt_rank`/`competitor_tallies`/`raw_responses`/`advice`/
  `deep_advice`, plus `legacy_blob_key` (traceability back to the original
  Blobs entry, for legacy-imported scans only).

Schema and Neon Auth were provisioned via the Neon MCP tools
(`create_project`, `provision_neon_auth`, `prepare_database_migration` →
verify on temp branch → `complete_database_migration`) — see the plan file
for the exact migration SQL if it needs revisiting.

### Auth (Neon Auth / Better Auth), `netlify/functions/_shared/`

- **`auth.mts`** — `requireAuth(req)` verifies an `Authorization: Bearer
  <jwt>` header against Neon Auth's JWKS (via `jose`'s `createRemoteJWKSet`
  + `jwtVerify`), returns the JWT's `sub` claim (the Neon Auth user id) or
  throws. Every function that needs a caller identity uses this — there is
  no shared middleware wrapper, each function calls it explicitly, same
  pattern the old `SCAN_PASSPHRASE` check used before it (copy-pasted, not
  abstracted, deliberately — see each function).
- **`db.mts`** — `sql()` returns a cached `@neondatabase/serverless` client
  (`neon<false, false>(...)`, generics pinned so every call site gets a
  plain `Record<string, any>[]` back instead of the driver's full
  arrayMode/fullResults overload union). HTTP-fetch-based, not a pooled TCP
  client like `pg` — fits Netlify Functions' isolated/cold-start runtime.
- **`scanRow.mts`** — `toScanPayload(row)` converts a `scans` row's
  snake_case DB columns into the camelCase shape `scanPayload.ts`'s
  `validatePayload()` expects (the same shape the old stateless-link
  `/scan` used to write into the URL fragment) — this is what lets
  `ScanDetail.vue` render DB-backed data completely unchanged.
- **Frontend** (`src/app/lib/auth.ts`): wraps `better-auth`'s
  framework-agnostic client (`createAuthClient` from `'better-auth/client'`,
  cross-origin against Neon Auth's own domain — the client handles that
  session-cookie flow). A short-lived JWT for calling *this site's own*
  backend is minted separately via a plain `fetch(`${AUTH_BASE}/token`,
  { credentials: 'include' })` (GET, not POST — confirmed by testing
  directly rather than trusting the Better Auth JWT-plugin docs' generic
  description) rather than through the client's own token-plugin surface,
  since that exact contract was already verified by hand. That JWT is short-
  lived (15 min, confirmed by decoding a live token's `iat`/`exp`) and used
  to be minted exactly once, at login/`restoreSession()`, then cached in a
  module-level ref for the rest of the tab's life — a user who left a tab
  open past 15 min got a hard-to-diagnose 401 (`Missing or malformed
  Authorization header`) on their next click, since the cached ref goes
  stale but nothing ever re-mints it. Fixed 2026-08-04 by adding
  `authFetch()` alongside `authHeaders()`: a fetch wrapper that retries once
  with a freshly-minted token on any 401. Every authenticated call site
  (`CompaniesListView.vue`, `CompanyDetailView.vue`) goes through it now;
  `authHeaders()` itself is kept (still used internally by `authFetch()`)
  rather than removed.

### `shared/aivis-core.mjs`

The single source of truth, imported by every consumer:

- **Prompt templates** (8, generic brand/competitor substitution only —
  vertical-specific templating still deferred, see `TODOS.md`) x **2 models**
  (`openai/gpt-5-mini`, `google/gemini-3-flash-preview`). `proof-script`
  uses all 8; the hosted site uses only the first 3.
- **Perplexity Agent API client** (`callModel`) — `POST
  https://api.perplexity.ai/v1/responses`, routing both OpenAI- and
  Google-branded models through one Perplexity key via `provider/model-name`
  addressing. Optional `timeoutMs` (via `AbortController`).
- **Detection** (`findBrandMention`, `findMentions`) — whole-word,
  case-insensitive regex match on the brand name and a domain-derived alias.
  Presence-only, not sentiment-aware. Common-word brand names are flagged
  ambiguous and skip auto-detection.
- **Aggregation** (`aggregateProspect`) — cited count, completed vs. failed
  call counts, heuristic first-mention-order ranking, and
  `competitorTallies` (computed unconditionally per completed response, not
  gated on the brand itself being cited).
- **Score** (`computeScore`, `scoreBand`) — 0-100 (or `null` if
  `completedCalls === 0` — never a fake 0). Formula: `round(100 *
  (ranked1Count + 0.4 * beatenCount) / completedCalls)`.
- **Advice** (`selectAdvice`) — rule-based/templated, not a live LLM call,
  always computed synchronously right after a scan completes. Copy lives in
  `src/shared/ScanDetail.vue`'s template branches.
- **Deep advice** (`buildDeepAdvicePrompt`, `parseDeepAdviceResponse`) —
  added in the SaaS pivot's Milestone 6, additive only. Unlike
  `selectAdvice`, this **is** a live grounded Perplexity call — safe to add
  specifically because scans are async now, so there's no synchronous
  function-timeout budget left to blow (the exact constraint that used to
  block this is described on `selectAdvice` above, and no longer applies to
  this one). Deliberately on-demand (a "Generate deeper advice" button on a
  completed scan, not automatic) — it roughly doubles Perplexity spend per
  scan, and pricing/plan limits for the new self-serve product aren't
  decided yet. `buildDeepAdvicePrompt` grounds the prompt in the actual scan
  data (citation rate, competitor tallies) rather than generic SEO advice;
  `parseDeepAdviceResponse` follows the same lenient-JSON-extraction,
  always-safe-shape pattern as `parseEnrichmentResponse` below.
- **Enrichment** (`buildEnrichPrompt`, `parseEnrichmentResponse`) — used by
  `netlify/functions/enrich.mts`. Asks a model to research a bare URL and
  return the rest of the prospect fields as JSON; always returns every
  field, defaulted to `''`/`[]` rather than throwing. Not currently wired
  into the new app shell's "create company" form (a plain manual form,
  Milestone 4) — the endpoint still works and is auth-gated, just unused by
  any UI right now; wiring it in is a small future enhancement, not a bug.

### `vite.config.ts` — two entries

- **`result.html`** — the pre-pivot shareable result page, kept alive
  indefinitely so old links never break. Thin Vite shell; `src/result/App.vue`
  decodes a `#d=` URL fragment client-side (`b64urlDecode` +
  `validatePayload` from `scanPayload.ts`) and renders via
  `<ScanDetail :payload="data" />`. Never calls the API. `allowDeepAdvice`
  is not set here, so the deep-advice button never shows on old links (no
  auth system on this page at all).
- **`app.html`** — the real product: a full **vue-router SPA**
  (`src/app/router.ts`, `history` mode). Safe as a client-side-routed SPA
  specifically because its data comes from authenticated API calls fetched
  by ID, not a URL fragment a route change would drop — the opposite of why
  the pre-pivot pages were deliberately *not* a SPA (see below).
  `netlify.toml`'s `[[redirects]]` rule (`/app/* → /app.html`, 200) makes
  direct navigation/refresh on nested routes like `/app/companies/123`
  resolve correctly.

`index.html` and `history.html` (the old passphrase-gated scan form and
history list) were **retired** in Milestone 5 once the authenticated app
shell covered the same ground — deleted along with their
`src/index`/`src/history` Vue apps and the then-fully-redundant
`netlify/functions/history.mts` (superseded by `GET /companies` +
`GET /companies/:id`). If you're looking for the "why not a SPA" reasoning
that used to live here, it only ever applied to those retired pages and
`result.html` — read `src/app/router.ts`'s own comment for why `app.html`
doesn't have that constraint.

### `src/app/` — the authenticated app shell

- **`router.ts`** — routes: `/app` (companies list), `/app/login`,
  `/app/signup`, `/app/companies/:id`. A global `beforeEach` guard calls
  `restoreSession()` once, then redirects unauthenticated visitors to
  `/app/login?redirect=<intended path>` (and authenticated visitors away
  from `/app/login`/`/app/signup`) — verified end-to-end including the
  redirect-preservation round trip.
- **`views/LoginView.vue` / `SignupView.vue`** — plain email/password forms
  against `lib/auth.ts`'s `signIn`/`signUp`.
- **`views/CompaniesListView.vue`** — lists the caller's companies
  (`GET /companies`), each with `scan_count`/`latest_score` computed
  server-side via correlated subqueries; a manual "+ New company" form
  (`POST /companies`) — not yet wired to `enrich.mts`'s auto-fill, see
  above.
- **`views/CompanyDetailView.vue`** — one company's master-detail dashboard:
  `CompanyProgressChart.vue` (score-over-time, shown once a company has 2+
  scans — a single point isn't a trend) above a scan list, selecting a scan
  renders it via the shared `ScanDetail.vue`. Also owns the "Run new scan"
  button (POSTs `/scan`, then polls `/scans/:id` every ~2s) and the
  "Generate deeper advice" flow (POSTs `/scans/:id/deep-advice`, replaces
  the scan in local state with the response on success).
- **`views/CompanyProgressChart.vue`** — hand-rolled SVG line chart (no
  chart library, matching `ScanDetail.vue`'s score ring/scoreboard
  approach), single series so no legend needed per the `dataviz` skill's
  rule for one series. Breaks the line across any scan with `score: null`
  rather than drawing through a fake 0. First/last x-axis labels anchor
  start/end instead of center so they don't clip past the SVG viewport (a
  real bug caught by screenshotting the rendered chart, not just reading
  the code — the skill's own "render it and look at it" step).

### `src/shared/scanPayload.ts` + `src/shared/ScanDetail.vue`

Reused across every scan-rendering surface: `result/App.vue`,
`CompanyDetailView.vue`'s detail pane. `scanPayload.ts` holds the types and
`validatePayload()` — fail-closed validation of a scan-result object, since
`result.html`'s payload is inherently unsigned/forgeable (anyone can craft a
`#d=` link) and `CompanyDetailView.vue`'s DB-backed data gets the same
treatment for consistency and bounds-safety. `id` is now a required field
(added for Milestone 6's deep-advice button, which needs to know which scan
to POST to) — confirmed backward compatible since `scan.mts` has always
included `id` in every payload it ever produced, including pre-pivot links
still live in the wild. `deepAdvice`/`deepAdviceGeneratedAt` are optional —
missing, `null`, or malformed all degrade to `null` rather than rejecting
the whole payload, since deep advice is a bonus on top of the always-present
rule-based advice.

`ScanDetail.vue` renders everything from the brand/website header through
the score ring, scoreboard, advice cards, deep-advice section, raw-response
`<details>`, and footer. Its one deliberate exception to "purely
presentational, no other props, no emits" is `allowDeepAdvice`/
`deepAdviceLoading` props plus a `generate-deep-advice` emit — `result/App.vue`
never sets `allowDeepAdvice` (no auth system there), so the button only ever
appears in the authenticated app; the component itself stays auth-agnostic,
`CompanyDetailView.vue` owns the actual fetch call.

### `proof-script/index.mjs` (Approach A)

Unchanged by the SaaS pivot — hand-rolled arg parser and `.env` loader, fail-fast
+ retry (`FailFastTracker`, `callWithRetry`), a concurrency-limited runner
(`runWithConcurrency`), and output formatting (`formatInternalSummary`,
`csvRow`) into `results/`/`tracking.csv` (gitignored). `node
proof-script/index.mjs --dry-run` is the standing regression check, re-run
after every change to `shared/aivis-core.mjs` regardless of which consumer
motivated the change.

### `netlify/functions/` — one function per file, all auth-scoped except `enrich`

- **`scan.mts`** — POST `/scan`, `{ company_id }`. Auth + company-ownership
  checked, inserts a `pending` scans row, fires a **Background Function**
  trigger (`run-scan-background.mts`) and returns `{ scanId }` in well under
  a second — confirmed viable on this site's plan (`nf_team_dev`) via a
  throwaway spike before committing to this design (Milestone 0): a
  Background Function POST returns 202 immediately, the actual work
  continues afterward. No more 302 redirect, no more Blobs write, no more
  synchronous-request timeout budget.
- **`run-scan-background.mts`** — the actual 6-call scan (`-background`
  filename suffix required by Netlify's convention). Atomically claims the
  scan (`UPDATE ... WHERE status='pending'`) so a duplicate trigger is a
  cheap no-op instead of double-spending Perplexity calls, then updates the
  row to `completed`/`failed`.
- **`scan-status.mts`** — GET `/scans/:id`, auth + ownership-scoped (join
  through `companies`), polled by the frontend.
- **`generate-deep-advice.mts`** — POST `/scans/:id/deep-advice`, see
  "Deep advice" above.
- **`companies.mts`** — GET (list, with per-company `scan_count`/
  `latest_score`) and POST (create) `/companies`, auth-scoped.
- **`company.mts`** — GET `/companies/:id` (via Netlify's URLPattern path
  syntax, `context.params.id`), returns the company plus its full scan
  history via `toScanPayload`.
- **`enrich.mts`** — POST `/enrich`, auth-gated (not company-scoped — it's a
  stateless research helper with no DB/company concept). Always returns 200
  even on internal failure (`{ ok: false, error }`); nothing here is
  persisted.
- **`backfill-legacy-scans.mts`** — one-off Milestone 3 import of the
  pre-pivot `aivis-scans` Blobs store into Postgres (any authenticated
  caller becomes the owner of everything imported; idempotent, skips
  already-imported blobs via `legacy_blob_key`). Was run once against a
  throwaway test account to prove the mechanism works — **still needs to be
  re-run against whichever account the CEO actually uses going forward**;
  left deployed rather than deleted since that hasn't happened yet.
