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
`web_search` grounding routinely take 15-20s, sometimes longer. proof-script
runs the full 10 prompts x 4 models = 40 calls (prompts grew from 3 to 10 on
2026-08-09 at a live user's request — see `shared/aivis-core.mjs`'s
`PROMPT_TEMPLATES` comment; models grew from 2 to 4 on 2026-08-13, after a
briefly-reverted attempt at 6 on 2026-08-09 — see the `MODELS` comment for
the full history). The hosted site's `run-scan-background.mts` uses a
**5-prompt slice** of the same `PROMPT_TEMPLATES` array (20 calls, not 40)
— see "Async scan execution" below for why. Each call has a 60s per-call
timeout. This used to force the whole `/scan` request to stay synchronous
and tightly timeout-budgeted — that constraint is gone since Milestone 5
made scans asynchronous (see "Async scan execution" below).

Also changed 2026-08-09, after a live user flagged the original
fire-everything-via-`Promise.all` approach as a real risk once call counts
grew: `run-scan-background.mts` runs calls through a concurrency-limited
worker pool (`runWithConcurrency` in `aivis-core.mjs`) instead of all at
once, and every call shares one scan-wide `SCAN_DEADLINE_MS` via a single
`AbortController` — this is what actually bounds worst-case scan latency as
prompt/model count grows, since otherwise each call gets its own full retry
budget regardless of how long the batch had already run. Calls still in
flight when the scan deadline fires are aborted and counted as failed, same
as any other failure. **The concurrency limit and deadline value have
changed twice since, most recently to 1 / 600000ms (10 min) — see "Update
2026-08-13" below; don't trust a specific number in older prose without
checking `run-scan-background.mts` directly.** `callModelWithRetry` uses 3
attempts with a rate-limit-aware escalating backoff between them (longer for
HTTP 429 specifically than other failures) — the backoff exists specifically
to avoid re-hammering a live rate limit rather than to guard against generic
flakiness.

**Update 2026-08-12 (Milestone A of `PLAN_NEXT_PHASE.md`, shipped):**
per-check failure detail (which prompt/model failed, and why) is now
persisted — a `failures jsonb` column on `scans`, populated by
`aggregateProspect`'s return value and rendered in `ScanDetail.vue` in
place of the old "isn't currently recorded" note. This resurrects a feature
that briefly existed (commit `522eb63`) and was accidentally deleted the
next day during an unrelated refactor (`74afa41`) — diagnosing which calls
failed no longer needs the Netlify function logs. A `total_tokens integer`
column on `scans` was added the same migration, DB-only (not surfaced in
any UI), so real per-scan Perplexity cost can be queried directly via Neon
MCP — this exists to inform report/subscription pricing, not as a product
feature.

Also fixed the same milestone: `isAmbiguousBrandName()`
(`shared/aivis-core.mjs`) used to flag **any** single-word brand name of 4
characters or fewer as ambiguous and skip detection entirely, regardless of
whether it was an actual common word — a real bug, not a design choice,
that gave real brands (ASML, TSMC, NRC, IBM, SAP) a false `0/100 —
Invisible` score. Ambiguity is now driven only by `COMMON_WORD_STOPLIST`
membership. Competitor-name ambiguity (which previously failed silently,
indistinguishable from "never mentioned") now sets a per-competitor
`ambiguous` flag surfaced in `ScanDetail.vue`'s scoreboard.

**Update 2026-08-13 (Milestone C1 of `PLAN_NEXT_PHASE.md`, shipped):**
`MODELS` grew from 2 to 4 (`anthropic/claude-haiku-4-5`, `xai/grok-4.6`
added, both live-smoke-tested first — see `shared/aivis-core.mjs`'s
`MODELS` comment). Anthropic models need an explicit `max_output_tokens` in
the request body that the other providers don't (`callModel` now sends it
conditionally). The same smoke-testing pass found something bigger than the
model additions: **Perplexity's real per-key concurrency limit is ~1**, not
the 4 this file previously documented — bursts of 2-4 concurrent calls,
including across different providers, failed 50-83% of the time with HTTP
429, while fully sequential calls succeeded 100%. `CONCURRENCY_LIMIT` is
now `1` (fully sequential) and `SCAN_DEADLINE_MS` is `600000` (10 min) —
see `run-scan-background.mts`'s `CONCURRENCY_LIMIT` comment for the full
incident writeup (this is the second retune the same day; an earlier
same-day fix for a *worse* incident, concurrency=10 causing 16-18/20 calls
to fail, had already dropped it to 4 — which turned out to still be wrong).
Sequential-only means wall-clock time scales directly with call count, so
the hosted site's scan was cut to a 5-prompt slice of `PROMPT_TEMPLATES`
(20 calls total, same as before the model expansion) rather than growing to
40 — proof-script keeps the full 10-prompt set since it isn't
latency-constrained by a live browser tab. A scan now takes several minutes
end to end; a Pro-plan monthly fair-use cap (`PRO_PLAN_MONTHLY_SCAN_LIMIT`,
`_shared/plan.mts`) was added the same change since per-scan Perplexity
cost also went up with the pricier model mix. A scan-complete email
notification was also added the same day (`_shared/email.mts`,
`sendScanCompleteEmail`, called from `run-scan-background.mts` after every
scan finalizes, success or failure) via Resend's plain HTTP API — best-
effort, a failed send is logged but never changes the scan's own
already-persisted status. Sends from `scans@notifications.dizid.com` — this
domain is registered and **DNS-verified with Resend** (`region: eu-west-1`;
DKIM/MX/SPF records live on `dizid.com`'s Netlify-managed DNS zone),
confirmed working end-to-end with a real delivered test email to a
non-owner address the same day, not just the sandbox-restricted
`onboarding@resend.dev` address.

`RESEND_API_KEY`/`RESEND_FROM_EMAIL` are set on the Netlify site (see
"Deployment" below) — `RESEND_API_KEY` is reused from an existing personal
Resend account (also used by other unrelated Dizid projects), not a new
account created for AIVis specifically.

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
  `NEON_AUTH_JWKS_URL`, `RESEND_API_KEY`/`RESEND_FROM_EMAIL` (added
  2026-08-13, scan-complete email, sending domain DNS-verified same day —
  see "Update 2026-08-13" note above). `SCAN_PASSPHRASE` was removed
  2026-08-03 (Milestone 8 cleanup) once nothing in code referenced it
  anymore.

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
  rather than force-fit into the new model. `is_public` is an **unused,
  present-but-dead column** — it backed an opt-in public leaderboard feature
  (shipped, then deleted per Milestone B of `PLAN_NEXT_PHASE.md`) and is no
  longer read or written anywhere in the app. Left in place deliberately
  (not dropped) rather than a destructive live migration.
- **`scans`** — one row per scan, `company_id` FK, `status` (`pending` →
  `running` → `completed`/`failed`), denormalized `brand`/`website`/
  `category` snapshot at scan time, `jsonb` columns for
  `per_prompt_rank`/`competitor_tallies`/`raw_responses`/`advice`/
  `deep_advice`, plus `legacy_blob_key` (traceability back to the original
  Blobs entry, for legacy-imported scans only). Added 2026-08-12
  (Milestone A of `PLAN_NEXT_PHASE.md`): `failures jsonb` (per-failed-call
  `{model, promptIndex, error}` detail, nullable — old rows have `null`,
  rendered as `[]`) and `total_tokens integer` (DB-only, for cost queries,
  never surfaced in the UI). Added 2026-08-15 (Milestone F, citation-URL
  attribution): `own_site_citations jsonb` — citation URLs from completed
  checks matching the scanned company's own domain, `[{promptIndex, model,
  url, title}]`, nullable/additive, surfaced in `ScanDetail.vue`'s new
  "Your site, cited" section. Each `raw_responses` entry also gained a
  `citations` array (all citations for that check, not just own-domain
  matches) — no new column needed, additive key inside the existing jsonb.
- **`company_urls`** — an **unused, present-but-dead table**. It backed
  multi-URL-per-company tracking (shipped, then deleted per Milestone B of
  `PLAN_NEXT_PHASE.md`): every company got a primary row equal to its
  `website`, and scans could target a non-primary URL via `url_id`. Nothing
  in the app reads, writes, or joins against this table anymore — `scan.mts`
  always uses `companies.website` directly. Left in place rather than
  dropped, same reasoning as `is_public` above.
- **`company_members`** — added 2026-08-15, a **schema-only scaffold, not
  yet read or written anywhere**. `company_id` FK to `companies`,
  `member_user_id` FK to `user_profiles(user_id)` (same FK target
  `companies.owner_user_id` uses, for consistency), `role text default
  'viewer'`, unique on `(company_id, member_user_id)`. Exists ahead of the
  actual team/agency-access feature (invite flow, permission checks) since
  it's a pure additive migration — the opposite case from `is_public`/
  `company_urls` above, which are dead columns from a *removed* feature;
  this one is prep for a feature that hasn't been built yet.

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

### Billing (Stripe), `netlify/functions/_shared/plan.mts` + `stripe.mts`

Shipped in commit `5f47127` — not documented here until now, a pre-existing
gap this update fixes rather than something built this session.

- **`_shared/plan.mts`** — `FREE_PLAN_COMPANY_LIMIT = 1`,
  `FREE_PLAN_SCAN_LIMIT = 3`, `isPro(planTier)`. Centralized so limits are
  tunable in one place instead of scattered magic numbers.
- **`_shared/stripe.mts`** — cached Stripe singleton reading
  `STRIPE_SECRET_KEY`.
- **`create-checkout-session.mts`** — POST, auth-gated. Creates a Stripe
  Checkout session, `mode: 'subscription'` (real recurring billing, not a
  one-time charge), rejects if already Pro.
- **`stripe-webhook.mts`** — POST, deliberately *not* `requireAuth` (Stripe
  signs the raw body itself, verified via `STRIPE_WEBHOOK_SECRET`).
  `checkout.session.completed` sets `plan_tier='pro'` on `user_profiles`;
  `customer.subscription.updated`/`.deleted` sync `subscription_status` and
  flip back to `'free'` if the subscription is no longer active/trialing.
- **What Pro actually gates today**: only two quantity limits, both via
  `isPro()` — `scan.mts` (3 scans total on Free) and `companies.mts` (1
  company on Free), both returning a `402 {error, upgradeRequired, limit}`
  the frontend renders as an inline "Upgrade to Pro" CTA
  (`CompaniesListView.vue`/`CompanyDetailView.vue`). **Nothing else is
  plan-gated** — deep advice is free for anyone today (see "Deep advice"
  below), and the Pro price itself is still unset in both Stripe and the
  landing page copy (`index.html`'s pricing card intentionally says "One
  flat price /month" — not finalized).
- **Not yet built**: a one-time "Full AI Visibility Report" purchase SKU
  (separate from the subscription) and gating deep advice behind
  Pro-or-purchased — both are Milestone E of `PLAN_NEXT_PHASE.md`, gated on
  Marc's manual sales test (E0) actually landing a real payment first.

### `shared/aivis-core.mjs`

The single source of truth, imported by every consumer:

- **Prompt templates** (10, generic brand/competitor substitution only —
  vertical-specific templating still deferred, see `TODOS.md`) x **4
  models** (`openai/gpt-5-mini`, `google/gemini-3-flash-preview`,
  `anthropic/claude-haiku-4-5`, `xai/grok-4.6`, the latter two added
  2026-08-13). Prompt count grew from 8 to 10 on 2026-08-09, and the hosted
  site briefly ran the full 10-prompt set (both `proof-script` and the
  hosted site running all 10) before being cut back to a **5-prompt slice**
  on 2026-08-13 when the model count grew — see this file's "Update
  2026-08-13" note above for why (concurrency dropped to 1, so more calls
  means direct wall-clock cost with no parallelism to hide it behind).
  `proof-script` still runs the full 10.
- **Perplexity Agent API client** (`callModel`) — `POST
  https://api.perplexity.ai/v1/responses`, routing both OpenAI- and
  Google-branded models through one Perplexity key via `provider/model-name`
  addressing. Optional `timeoutMs` (via `AbortController`).
- **Detection** (`findBrandMention`, `findMentions`) — whole-word,
  case-insensitive regex match on the brand name and a domain-derived alias.
  Presence-only, not sentiment-aware. Common-word brand names (from a
  curated `COMMON_WORD_STOPLIST`) are flagged ambiguous and skip
  auto-detection. **Fixed 2026-08-12**: a blanket "any single word ≤4
  characters" clause used to also trigger this, independent of the
  stoplist — a real bug that gave short real brand names (ASML, TSMC, NRC,
  IBM, SAP) a false ambiguous flag and a `0/100` score. Removed; ambiguity
  now comes only from stoplist membership. Competitor names get the same
  check but no domain-alias fallback (they have no associated website in
  the schema) — an ambiguous competitor now sets a visible `ambiguous` flag
  on its tally instead of silently staying indistinguishable from "never
  mentioned."
- **Aggregation** (`aggregateProspect`) — cited count, completed vs. failed
  call counts, heuristic first-mention-order ranking, and
  `competitorTallies` (computed unconditionally per completed response, not
  gated on the brand itself being cited). Also returns `ownSiteCitations`
  (added 2026-08-15, Milestone F) — see "Citation-URL attribution" below.
- **Citation-URL attribution** (`extractCitations`, in `aggregateProspect`'s
  `ownSiteCitations`/per-response `citations`) — Perplexity's `/v1/responses`
  payload carries `url_citation` annotations on each message's content parts
  (confirmed against the live OpenAPI schema at
  `docs.perplexity.ai/api-reference/agent-post`, not guessed). `callModel`
  now also returns `citations: extractCitations(json)` alongside `text`;
  `aggregateProspect` matches each completed call's citations against the
  scanned company's own hostname (subdomain-tolerant) and collects matches
  into `ownSiteCitations`, while every citation (own-domain or not) rides
  along on that call's `rawResponses[i].citations` entry. Zero extra
  Perplexity calls — pure post-processing of data the app was already
  fetching and discarding. Surfaced in `ScanDetail.vue` as a "Your site,
  cited" section plus a per-check "Sources:" line in the check-by-check
  breakdown. The semantic/sentiment-aware citation judge that was scoped
  alongside this in `PLAN_NEXT_PHASE.md`'s Milestone F is deliberately
  **not** built yet — it needs a live second LLM call per brand mention
  (a real cost/latency multiplier on an already-tight 5-8 min, 20-call
  sequential scan) plus the calibration pass the plan doc itself calls for;
  building it blind risked repeating the exact kind of unverified-assumption
  incident this file's own history (2026-08-09 model revert, 2026-08-13
  concurrency incidents) already got burned by once.
- **Score** (`computeScore`, `scoreBand`) — 0-100 (or `null` if
  `completedCalls < 4` — never a fake 0 from too little data). **Updated**:
  no longer the simple `ranked1Count + 0.4*beatenCount` formula this doc
  previously described (that was stale, predating the "Overhaul scoring:
  positional ranking + strategic query weighting" commit) — `computeScore`
  now weights each completed call by rank (`RANK_WEIGHTS`: ranked-1 1.0,
  ranked-2 0.6, ranked-3 0.3, mentioned 0.1) multiplied by that prompt's
  query-category weight (`DEFAULT_QUERY_WEIGHTS`: high-intent 3, comparison
  2, informational 1, via `PROMPT_CATEGORIES`), then
  `round(100 * totalWeightedScore / totalMaximumScore)` — so ranking first
  on a direct-buying-intent prompt moves the score more than ranking first
  on a broad informational one.
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
  scan. Free/Pro plan limits now exist (see "Billing (Stripe)" below), but
  deep advice itself is **not yet plan-gated** — any authenticated owner of
  a completed scan can generate it, unlimited times, regardless of plan.
  Gating it behind Pro/a one-time report purchase is Milestone E of
  `PLAN_NEXT_PHASE.md`, not yet built — deliberately deferred until Marc's
  manual outbound sales test (Milestone E0) shows someone will actually pay
  for it. `buildDeepAdvicePrompt` grounds the prompt in the actual scan
  data (citation rate, competitor tallies) rather than generic SEO advice;
  `parseDeepAdviceResponse` follows the same lenient-JSON-extraction,
  always-safe-shape pattern as `parseEnrichmentResponse` below.
- **Enrichment** (`buildEnrichPrompt`, `parseEnrichmentResponse`) — used by
  `netlify/functions/enrich.mts`. Asks a model to research a bare URL and
  return the rest of the prospect fields as JSON; always returns every
  field, defaulted to `''`/`[]` rather than throwing. Wired into the app
  shell's "create company" form since the "URL-first onboarding" work
  (`CompaniesListView.vue`'s two-step flow: URL → `/enrich` pre-fills the
  rest → editable review before `POST /companies`) — this doc previously
  said it was still unwired; it wasn't, that was stale.

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
  `/app/signup`, `/app/companies/:id`, `/app/billing/success`, plus three
  no-auth-required content routes added 2026-08-12:  `/app/privacy`,
  `/app/terms`, `/app/how-it-works` (see `App.vue`'s footer below). A
  global `beforeEach` guard calls `restoreSession()` once, then redirects
  unauthenticated visitors to `/app/login?redirect=<intended path>` (and
  authenticated visitors away from `/app/login`/`/app/signup`) — verified
  end-to-end including the redirect-preservation round trip. The
  `/app/leaderboard` route (a public opt-in leaderboard, shipped commit
  `1b0c7a9`) was deleted 2026-08-12 per Milestone B of `PLAN_NEXT_PHASE.md`
  — Marc decided the feature was unwanted scope; `companies.is_public`
  remains as an unused DB column (see Database schema above).
- **`App.vue`** — the shared shell wrapping every `/app/*` route. Added a
  footer 2026-08-12: links to Privacy Policy, Terms of Service, How this
  works, "Made by Dizid" (external), a `dev@dizid.com` contact line, and a
  one-line data-handling note. Renders on every authenticated and
  unauthenticated app page alike, since it's in the shell, not per-view.
- **`views/PrivacyView.vue` / `TermsView.vue` / `HowItWorksView.vue`** —
  added 2026-08-12, plain static content, no DB/API calls. Privacy and
  Terms both carry a "Draft — have this reviewed before relying on it for
  compliance" notice; How This Works is real polished product content
  (accurately describes the 5-prompt × 4-model / 20-check scan mechanism
  and the actual score bands, not generic filler — updated 2026-08-13 when
  the model expansion changed those numbers).
- **`views/LoginView.vue` / `SignupView.vue`** — plain email/password forms
  against `lib/auth.ts`'s `signIn`/`signUp`.
- **`views/CompaniesListView.vue`** — lists the caller's companies
  (`GET /companies`), each with `scan_count`/`latest_score` computed
  server-side via correlated subqueries; a two-step "+ New company" form —
  URL first, `POST /enrich` pre-fills brand/category/use_case/region/
  customer_segment/competitors, then an editable review step before
  `POST /companies` — falling back to a blank editable form on enrichment
  failure (`enrich.mts` always returns 200 even on internal failure).
  **Changed 2026-08-12**: on successful creation, `onCreate()` now
  navigates straight to the new company's detail view with `?autoscan=1`
  instead of just closing the form and staying on the list — a brand-new,
  never-scanned company used to show the same bare `0` a real zero score
  would, which read as broken.
- **`views/CompanyDetailView.vue`** — one company's master-detail dashboard:
  `CompanyProgressChart.vue` (score-over-time, shown once a company has 2+
  scans — a single point isn't a trend) above a scan list, selecting a scan
  renders it via the shared `ScanDetail.vue`. Also owns the "Run new scan"
  button (POSTs `/scan`, then polls `/scans/:id` every ~2s — `pollScan()`
  now retries a transient fetch failure up to 3x with backoff before giving
  up, added 2026-08-12, since it previously abandoned polling permanently
  on one network blip) and the "Generate deeper advice" flow (POSTs
  `/scans/:id/deep-advice`, replaces the scan in local state with the
  response on success). `onMounted` auto-triggers a scan when
  `route.query.autoscan === '1'` (set by `CompaniesListView.vue` above),
  then strips the query param via `router.replace` so a refresh doesn't
  re-trigger it. Multi-URL-per-company tracking (a `company_urls` table,
  a URL-chip selector, "+ Add URL") was **removed 2026-08-12** per
  Milestone B of `PLAN_NEXT_PHASE.md` — every company now has exactly one
  URL (`companies.website`), matching `scan.mts`'s current behavior.
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

- **`_shared/cors.mts`** — added 2026-08-12, `corsHeaders()` +
  `handleOptions(req)`, applied across every JSON-returning function
  (`scan.mts`, `scan-status.mts`, `companies.mts`, `company.mts`,
  `enrich.mts`, `generate-deep-advice.mts`). Defensive hardening, not a
  functional requirement today (every call is same-origin) — guards
  against a hard, ungraceful "Failed to fetch" if origins ever diverge
  (a preview URL, a custom domain added without updating Neon Auth's
  `trusted_origins`).
- **`scan.mts`** — POST `/scan`, `{ company_id }`. Auth + company-ownership
  checked, inserts a `pending` scans row, fires a **Background Function**
  trigger (`run-scan-background.mts`) and returns `{ scanId }` in well under
  a second — confirmed viable on this site's plan (`nf_team_dev`) via a
  throwaway spike before committing to this design (Milestone 0): a
  Background Function POST returns 202 immediately, the actual work
  continues afterward. No more 302 redirect, no more Blobs write, no more
  synchronous-request timeout budget. Free-tier callers are capped at
  `FREE_PLAN_SCAN_LIMIT` (lifetime); Pro callers are capped at
  `PRO_PLAN_MONTHLY_SCAN_LIMIT` (calendar-month, added 2026-08-13 alongside
  the model expansion — see `_shared/plan.mts`) — both 402 with a plain
  `error` message, only the free-tier one sets `upgradeRequired: true`.
- **`run-scan-background.mts`** — the actual 20-call scan (a 5-prompt slice
  × 4 models, updated 2026-08-13 — this bullet previously said "10 prompts
  × 2 models," stale since that date's model expansion) (`-background`
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
