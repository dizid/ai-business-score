# CLAUDE.md — netlify/functions/

Scoped guidance for `netlify/functions/`, split out of the project root
`CLAUDE.md` on 2026-08-17 (via `/doctor`) so it only loads when a session
actually touches this directory, instead of every session paying for it.
See the root `CLAUDE.md` for overall project context.

### Database schema (Neon Postgres, `public` schema)

- **`user_profiles`** — one row per signed-up user, `user_id` FK to
  `neon_auth."user".id` (a `uuid`, not `text` — confirmed by inspecting the
  live schema before writing this, don't assume). Holds `plan_tier` (default
  `'free'`) as a metering/plan-gating hook for later — nothing reads it yet.
- **`companies`** — a tracked business, `owner_user_id` FK to
  `user_profiles`. Single owner per company (CEO decision, 2026-08-03) —
  extending to team/agency shared access later is a pure additive migration
  (a `company_members` join table), not a breaking one. **`owner_user_id`
  became nullable 2026-08-24** (Milestone 2 of the monetization plan,
  explicitly signed off by Marc): an anonymous $19 single-scan purchase
  creates a company before any account exists to own it. This doesn't
  reopen "single owner" — a company is never owned by more than one user,
  just transiently zero until `claim-single-scan.mts` attaches it — and
  every existing `WHERE owner_user_id = $userId` check stays safe by
  construction (`NULL` never matches a real UUID). `is_legacy_import`
  flags companies created by the one-off Blobs backfill (Milestone 3) —
  those are the founder's own prospect-research history (scans of *other*
  businesses for outbound), not "the user's own company," labeled honestly
  rather than force-fit into the new model. `is_public` is an **unused,
  present-but-dead column** — it backed an opt-in public leaderboard feature
  (shipped, then deleted per Milestone B of `PLAN_NEXT_PHASE.md`) and is no
  longer read or written anywhere in the app. Left in place deliberately
  (not dropped) rather than a destructive live migration. **Briefly
  re-activated a second time** in commit `555e3f4` (2026-08-14, "Make AIVis
  SEO/AI-crawler friendly...") for an unrequested per-company "public report
  page" feature (a `PATCH /companies/:id` toggle plus a public `/reports/:id`
  page and `/sitemap-reports.xml`) built as apparent scope creep during
  what was meant to be technical-SEO work — never an approved milestone
  item. Removed again 2026-08-17 once the CEO flagged it as something he
  never asked for; the column reverts to dormant-but-present, same state as
  before `555e3f4`. Three companies had already been toggled `true` in the
  live DB by the time this was caught — those rows were deliberately left
  as `true` rather than reset (the serving route is gone, so the flag is
  inert either way) — if this column is ever wired up a third time, check
  `git log --all --oneline -- netlify/functions/report.mts` first.
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
  Also added 2026-08-15 (Milestone F, sentiment judge): `sentiment_judgments
  jsonb` — `[{promptIndex, model, classification, reasoning}]`, populated
  one check at a time via `judge-sentiment.mts`, nullable/additive, empty
  until a user judges at least one check. Added 2026-08-17: `progress
  jsonb` — `{completed, total, currentModel}`, written incrementally by
  `run-scan-background.mts` before each of a scan's calls starts (streaming
  progress, `docs/improvement-roadmap.md`'s top UX candidate), nullable —
  `null` while `pending`, meaningless once `completed`/`failed`. Read by
  `scan-status.mts` and rendered live in `CompanyDetailView.vue`'s polling
  UI. The `completed` counter is computed as an atomic SQL increment
  (`coalesce((progress->>'completed')::int, 0) + N` inside a `jsonb_set`,
  in `writeProgress()`) rather than a plain JS variable — fixed when
  provider lanes first went concurrent (see `own_site_citations` era
  comment history), specifically so more than one call can be in flight at
  once without two lanes' writes racing each other. Confirmed this stays
  correct under the 2026-08-23 per-provider concurrency bump below (raising
  a lane's own limit doesn't reintroduce the old plain-counter race — the
  increment was already SQL-side, not JS-side). Added 2026-08-19: **`harmonia jsonb`** — a
  technical/on-page/content-structure/UX audit of the scanned business's
  own website, computed by `shared/harmonia.mjs`'s `analyzeHarmonia()` and
  kicked off in parallel with (not serialized into) the sequential LLM-call
  loop in `run-scan-background.mts`, since it's a plain HTTP fetch chain
  (the site's own homepage/robots.txt/sitemap.xml, plus PageSpeed Insights)
  with no Perplexity-rate-limit interaction. `website` is fully
  user-controlled (a company's own field), so `harmonia.mjs`'s three direct
  fetches go through a `safeFetch()` SSRF guard (flagged by automated
  security review the same day it shipped, fixed same-day): rejects
  non-http(s) schemes, resolves the hostname via DNS and refuses any
  loopback/private/link-local/cloud-metadata address (`169.254.169.254`
  included) before fetching, and re-validates on every redirect hop
  (`redirect: 'manual'`, max 3 hops) rather than trusting `fetch`'s default
  auto-follow — a public hostname's *response* redirecting to an internal
  address would otherwise bypass the initial check. PageSpeed Insights is
  deliberately not covered by this guard — that fetch runs on Google's
  infrastructure, not ours, so it isn't an SSRF vector from this server.
  Nullable/additive, same
  pattern as `own_site_citations`/`sentiment_judgments` — `null` for
  pre-migration rows, and `analyzeHarmonia()` never throws (worst case
  resolves with mostly-null fields plus an `errors` array). **This is a
  SEPARATE, secondary score from the AI Visibility Score (`scans.score`) —
  a deliberate product decision (Marc confirmed AI visibility stays "the
  main thing") — never blended into it.** See `src/shared/CLAUDE.md` for
  the pillar breakdown and UI.
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
- **`scan_credit_purchases`** — added 2026-08-23, backs Pro scan top-up
  packs (see "Billing (Stripe)" below). `user_id` FK to `user_profiles`,
  `credits integer` (granted amount, stored per-row rather than inferred
  from a shared constant so a future pack-size/price change never corrupts
  historical accounting), `stripe_checkout_session_id text unique` (the
  idempotency guard against Stripe's at-least-once webhook delivery —
  insert uses `ON CONFLICT ... DO NOTHING`), `stripe_payment_intent_id`,
  `amount_cents`, `purchased_at timestamptz default now()`. Insert-only,
  never updated/decremented — "credits available" is always a `SUM()` over
  a rolling 2-calendar-month window (`purchased_at >= date_trunc('month',
  now()) - interval '1 month'`), computed fresh on every `/scan` call, same
  pattern `scan.mts` already used for the scan count itself. Deliberately
  not a lifetime rollover: `PRO_PLAN_MONTHLY_SCAN_LIMIT` didn't exist
  before 2026-08-13, so inferring historical overage from `scans` would
  misfire for any Pro user active before that date — this table only ever
  looks at its own `purchased_at`, never at scan history.
- **`single_scan_purchases`** — added 2026-08-24, backs the $19 one-time
  single-scan SKU (Milestone 2 of the monetization plan, see "Billing
  (Stripe)" below). `email text not null`, `stripe_checkout_session_id text
  unique not null` (idempotency guard, same `ON CONFLICT ... DO NOTHING`
  pattern as `scan_credit_purchases`), `stripe_payment_intent_id`,
  `amount_cents`, `company_id`/`scan_id`/`user_id` all nullable FKs,
  `access_token text unique` (the unguessable lookup key for anonymous
  buyers — `null` for the logged-in "topup" mode, which is looked up by
  `scan_id` instead), `purchased_at`. One row per purchase, doubles as: the
  deep-advice entitlement record for that scan (`generate-deep-advice.mts`
  checks `EXISTS (... WHERE scan_id = $scanId)`), the free-cap-bypass
  record, and — for anonymous purchases — the pending-claim record until
  `claim-single-scan.mts` sets `user_id`.

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
  `FREE_PLAN_SCAN_LIMIT = 3` (lifetime), `PRO_PLAN_MONTHLY_SCAN_LIMIT = 20`
  (calendar-month fair-use cap, added 2026-08-13 — see `scan.mts`'s entry
  below), `isPro(planTier)`. Added 2026-08-23: `SCAN_CREDIT_PACK_SIZE = 10`,
  `SCAN_CREDIT_PACK_PRICE_USD = 19`, `MAX_CREDIT_PACKS_PER_MONTH = 3` for
  the scan top-up feature below. Centralized so limits are tunable in one
  place instead of scattered magic numbers.
- **`_shared/stripe.mts`** — cached Stripe singleton reading
  `STRIPE_SECRET_KEY`.
- **`create-checkout-session.mts`** — POST, auth-gated. Creates a Stripe
  Checkout session, `mode: 'subscription'` (real recurring billing, not a
  one-time charge), rejects if already Pro.
- **`create-topup-checkout-session.mts`** — added 2026-08-23, POST,
  auth-gated. Mirrors `create-checkout-session.mts`'s shape but
  `mode: 'payment'` (one-time, not recurring) against a separate
  `STRIPE_TOPUP_PRICE_ID` Price. Rejects non-Pro callers (400 — top-ups
  extend the Pro cap, they don't substitute for the Pro upgrade) and
  callers who've already bought `MAX_CREDIT_PACKS_PER_MONTH` packs this
  calendar month. `metadata: { type: 'scan_credit_pack', credits }` on the
  Checkout session is how the webhook (below) tells this apart from a
  subscription checkout.
- **`stripe-webhook.mts`** — POST, deliberately *not* `requireAuth` (Stripe
  signs the raw body itself, verified via `STRIPE_WEBHOOK_SECRET`).
  `checkout.session.completed` sets `plan_tier='pro'` on `user_profiles`
  for a subscription session; **added 2026-08-23**: the same event type,
  when `session.mode === 'payment'` and `metadata.type ===
  'scan_credit_pack'`, instead inserts a `scan_credit_purchases` row
  (idempotent via `ON CONFLICT (stripe_checkout_session_id) DO NOTHING`) —
  checked first, before falling through to the subscription-handling code.
  `customer.subscription.updated`/`.deleted` sync `subscription_status` and
  flip back to `'free'` if the subscription is no longer active/trialing.
- **What Pro actually gates today**: `scan.mts` (3 scans lifetime on Free,
  20/calendar-month fair-use on Pro — extendable via top-up packs, see
  below) and `companies.mts` (1 company on Free), both returning a
  `402 {error, upgradeRequired, limit}` the frontend renders as an inline
  "Upgrade to Pro" CTA (`CompaniesListView.vue`/`CompanyDetailView.vue`).
  The Pro-cap 402 additionally returns `topupAvailable` (added 2026-08-23)
  so `CompanyDetailView.vue` can render a "Buy more scans" CTA instead once
  a Pro user is capped. **Since 2026-08-24** (Milestone 1 of the
  monetization plan): `generate-deep-advice.mts` also gates on
  `isPro(planTier)`, returning `402 {error, upgradeRequired: true}` — the
  frontend (`CompanyDetailView.vue`/`ScanDetail.vue`'s new
  `deepAdviceLocked` prop) shows an "Upgrade to Pro" CTA in place of the
  generate button for non-Pro users instead of hiding the section outright.
  The Pro subscription price is now decided and live: **$199/month**,
  reflected in `index.html`'s pricing card, FAQ, and JSON-LD `Offer`, and
  `llms.txt`. **Confirmed 2026-08-24**: a direct Stripe API check found the
  original `STRIPE_PRICE_ID` actually charged $29/month, a stale
  placeholder — a new Price (`price_1U7s8r8gBja0qkMxwx4bqoSD`) was created
  at $199/month and the env var swapped (see root `CLAUDE.md`'s Deployment
  section for the full correction). Note `STRIPE_SECRET_KEY` is still a
  Stripe *test-mode* key, so "live" here means the pricing/config matches
  reality, not that real payments are being accepted yet.
- **Scan top-up packs** (added 2026-08-23) — Pro users who hit the
  monthly cap can buy a one-time $19/10-scan pack instead of waiting for
  the reset. See the `scan_credit_purchases` schema entry above for the
  accounting model (insert-only, rolling 2-month window, no decrementing
  balance). **Live as of 2026-08-24**: `STRIPE_TOPUP_PRICE_ID` was created
  and set (`price_1U7s9K8gBja0qkMx9TV9czH4`, $19/10 scans) —
  `create-topup-checkout-session.mts` no longer 500s. This is a distinct
  SKU from the still-unbuilt one-time report purchase below — same
  architectural shape (separate one-time Stripe Price + additive purchases
  table), different product.
- **Single-scan purchase — shipped 2026-08-24** (Milestone 2 of
  `~/.claude/plans/we-need-alot-of-transient-floyd.md`): a $19 one-time
  scan, serving both an anonymous lead-gen entry point and a logged-in
  free-tier fallback for a user out of scans who doesn't want to
  subscribe, bundling deep advice for that one scan. **Live as of
  2026-08-24**: `STRIPE_SINGLE_SCAN_PRICE_ID` was created and set
  (`price_1U7s9C8gBja0qkMxi4bLhk3X`, $19 one-time) and live-verified with a
  full anonymous Checkout session (`amount_total: 1900`) —
  `create-single-scan-checkout-session.mts` no longer 500s. The E0
  manual-sales-validation gate from `PLAN_NEXT_PHASE.md` was explicitly
  waived by Marc for this round; pricing was decided directly instead
  ($199/mo Pro, $19 one-time).

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
  the model expansion — see `_shared/plan.mts`), **extended 2026-08-23** to
  add any purchased `scan_credit_purchases` credits to that limit before
  gating — both cases 402 with a plain `error` message; free-tier sets
  `upgradeRequired: true`, the Pro-cap case sets `topupAvailable` instead
  (see "Billing (Stripe)" above).
- **`run-scan-background.mts`** — the actual 20-call scan (a 5-prompt slice
  × 4 models, updated 2026-08-13 — this bullet previously said "10 prompts
  × 2 models," stale since that date's model expansion) (`-background`
  filename suffix required by Netlify's convention). Atomically claims the
  scan (`UPDATE ... WHERE status='pending'`) so a duplicate trigger is a
  cheap no-op instead of double-spending Perplexity calls, then updates the
  row to `completed`/`failed`. `CALL_TIMEOUT_MS` (60000) is shared by 3 of
  the 4 models; `xai/grok-4.6` gets its own longer 100000ms override
  (`CALL_TIMEOUT_MS_BY_MODEL`, added 2026-08-17 per
  `docs/grok-timeout-investigation.md`) since its documented 30-50s+
  typical latency was already brushing the old flat ceiling.
  `SCAN_DEADLINE_MS` is 720000 (12 min, bumped from 600000 the same day —
  the longer xai timeout needed more overall headroom, not less). Also
  writes `scans.progress` incrementally before each call starts — see the
  `progress` column entry above. Added 2026-08-19: also kicks off
  `analyzeHarmonia()` (`shared/harmonia.mjs`, new file — a technical/
  on-page/content-structure/UX audit of the scanned site, unrelated to
  the LLM calls) as a promise alongside `runWithConcurrency(...)`, awaited
  just before the final `UPDATE`, its own `psiApiKey` resolved from
  `GOOGLE_PAGESPEED_API_KEY` (falls back to reusing `apiKeys.google` if
  unset) — see `harmonia` column entry above. Also calls
  `sendScanCompleteEmail` (`_shared/email.mts`, added 2026-08-13) after
  every scan finalizes, success or failure, via Resend's plain HTTP API —
  best-effort, a failed send is logged but never changes the scan's own
  already-persisted status. Sends from `scans@notifications.dizid.com`,
  DNS-verified with Resend (`region: eu-west-1`; DKIM/MX/SPF records live
  on `dizid.com`'s Netlify-managed DNS zone) — confirmed working
  end-to-end with a real delivered test email to a non-owner address the
  same day it shipped, not just the sandbox-restricted
  `onboarding@resend.dev` address. (Migrated here from root `CLAUDE.md` on
  2026-08-20 via `/doctor`.) Added 2026-08-23: `started_at timestamptz`
  written by the claim `UPDATE` (`now()`, atomic with the `pending`→
  `running` transition) — the DB's own authoritative scan-start timestamp,
  used both for `scanStartTime` (previously a `Date.now()` captured ~230
  lines later, now sourced from this column instead to avoid any
  function-container-vs-Neon clock skew) and for the "scan completed in Xm
  Ys" duration shown in `ScanDetail.vue` (`generated_at - started_at`,
  computed downstream, not persisted as a third column). Also added the
  same day: `CONCURRENCY_LIMIT` (flat, 1) replaced with
  `CONCURRENCY_LIMIT_BY_PROVIDER` (`{openai: 1, anthropic: 3, google: 3,
  xai: 2}` + a `DEFAULT_PROVIDER_CONCURRENCY = 1` fallback) — `openai`
  (the Perplexity gateway lane) is untouched, still 1, per its three
  documented incidents above; `anthropic`/`google`/`xai` raised since they
  call independent provider APIs directly (2026-08-15 migration) with no
  shared-gateway history of trouble. **Live-verified 2026-08-23**: the
  first real scan run after this change deployed (id `e462fb2d...`)
  completed in 233.5s (3m 54s) — down from the historical 5-8 min baseline
  — with `completed_calls: 20, failed_calls: 0, failures: []`, no 429s on
  any provider. One data point, not a full soak test — keep watching
  `scans.failures` on subsequent scans (query in this file's own history
  above), and roll a provider back toward 1 immediately if a 429 spike
  ever appears, same discipline as this file's three prior incidents. Also
  confirms the `openai`/Perplexity lane (still capped at 1, untouched by
  this change) remains the wall-clock bottleneck — 233.5s is real
  improvement but still over the 2-minute goal, exactly as expected.
- **`scan-status.mts`** — GET `/scans/:id`, auth + ownership-scoped (join
  through `companies`), polled by the frontend. Returns `progress` (the
  live `{completed, total, currentModel}` object, added 2026-08-17) and
  `startedAt` (added 2026-08-23, for a live elapsed-time ticker while a
  scan is still `running`) alongside `status`/`errorMessage` on every poll,
  not just once the scan
  finishes.
- **`generate-deep-advice.mts`** — POST `/scans/:id/deep-advice`, see
  `shared/CLAUDE.md`'s "Deep advice" section.
- **`judge-sentiment.mts`** — POST `/scans/:id/judge-sentiment`, body
  `{promptIndex, model}`, see `shared/CLAUDE.md`'s "Sentiment judge" section.
- **`companies.mts`** — GET (list, with per-company `scan_count`/
  `latest_score`) and POST (create) `/companies`, auth-scoped.
- **`company.mts`** — GET `/companies/:id` (via Netlify's URLPattern path
  syntax, `context.params.id`), returns the company plus its full scan
  history via `toScanPayload`.
- **`enrich.mts`** — POST `/enrich`, auth-gated (not company-scoped — it's a
  stateless research helper with no DB/company concept). Always returns 200
  even on internal failure (`{ ok: false, error }`); nothing here is
  persisted.
- **`create-single-scan-checkout-session.mts`** — added 2026-08-24, POST
  `/create-single-scan-checkout-session`. The one function in this repo
  with *optional* auth rather than hard-`requireAuth` or fully public — a
  valid bearer + owned `company_id` in the body promotes the request to a
  logged-in top-up purchase; anything else falls back to the anonymous
  `{email, website}` path. See "Billing (Stripe)" above for the full
  purchase-flow design.
- **`single-scan-status.mts`** — added 2026-08-24, GET
  `/single-scan-status?token=…` or `?session_id=…`, fully public (no auth
  at all — the token is the access control). Polled by
  `PublicScanView.vue`; returns `{purchaseStatus: 'processing'}` if the
  webhook hasn't landed yet rather than a 404, since an immediate
  post-Checkout request commonly arrives first.
- **`claim-single-scan.mts`** — added 2026-08-24, POST `/claim-single-scan`,
  `{access_token}`, auth-gated. Atomically attaches an anonymous purchase's
  ownerless `companies` row to the caller's account
  (`UPDATE ... WHERE owner_user_id IS NULL`, same claim idiom
  `run-scan-background.mts` uses for claiming pending scans). Called from
  `SignupView.vue` (right after signup, via `?claim=`) and
  `PublicScanView.vue` (auto-claim if already signed in when visiting the
  link).
- **`backfill-legacy-scans.mts`** — one-off Milestone 3 import of the
  pre-pivot `aivis-scans` Blobs store into Postgres (any authenticated
  caller becomes the owner of everything imported; idempotent, skips
  already-imported blobs via `legacy_blob_key`). Was run once against a
  throwaway test account to prove the mechanism works — **still needs to be
  re-run against whichever account the CEO actually uses going forward**;
  left deployed rather than deleted since that hasn't happened yet.
