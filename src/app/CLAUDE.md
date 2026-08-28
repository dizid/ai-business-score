# CLAUDE.md — src/app/

Scoped guidance for `src/app/`, split out of the project root `CLAUDE.md`
on 2026-08-17 (via `/doctor`) so it only loads when a session actually
touches this directory, instead of every session paying for it. See the
root `CLAUDE.md` for overall project context.

### `src/app/` — the authenticated app shell

- **`router.ts`** — routes: `/app` (companies list), `/app/login`,
  `/app/signup`, `/app/companies/:id`, `/app/billing/success`
  (`BillingSuccessView.vue`, the post-Stripe-Checkout landing page),
  `/app/scan` (`PublicScanView.vue`, `meta: {requiresAuth: false}` — see
  its own entry below). The three no-auth content routes added 2026-08-12
  (`/app/privacy`, `/app/terms`, `/app/how-it-works`) were themselves
  **removed 2026-08-14** once their views were deleted and converted to
  static HTML — see those views' entries below; `router.ts` no longer has
  them. A global `beforeEach` guard calls `restoreSession()` once, then redirects
  unauthenticated visitors to `/app/login?redirect=<intended path>` (and
  authenticated visitors away from `/app/login`/`/app/signup`) — verified
  end-to-end including the redirect-preservation round trip. The
  `/app/leaderboard` route (a public opt-in leaderboard, shipped commit
  `1b0c7a9`) was deleted 2026-08-12 per Milestone B of `PLAN_NEXT_PHASE.md`
  — Marc decided the feature was unwanted scope; `companies.is_public`
  remains as an unused DB column (see `netlify/functions/CLAUDE.md`'s
  Database schema section).
- **`App.vue`** — the shared shell wrapping every `/app/*` route. Added a
  footer 2026-08-12: links to Privacy Policy, Terms of Service, How this
  works, "Made by Dizid" (external), a `dev@dizid.com` contact line, and a
  one-line data-handling note. Renders on every authenticated and
  unauthenticated app page alike, since it's in the shell, not per-view.
- **`views/PrivacyView.vue` / `TermsView.vue`** — added 2026-08-12, then
  **deleted 2026-08-14** (commit `555e3f4`) and converted to standalone
  static HTML at the repo root (`privacy.html`, `terms.html`) because
  `app.html` carries a blanket `noindex` and requires JS to render, so AI
  crawlers (GPTBot/ClaudeBot/PerplexityBot) never saw that content as Vue
  views. `App.vue`'s footer links to `/privacy`/`/terms` with plain `<a>`
  tags now, not `router-link`. Both pages shipped with a "Draft — have
  this reviewed before relying on it for compliance" notice that was
  removed 2026-08-24 after a founder-led hardening pass (operator
  identity, international-transfer note, cookie disclosure, a missing
  Resend disclosure fix) — still not a substitute for formal legal
  counsel, should that be wanted later.
- **`views/HowItWorksView.vue`** — also deleted 2026-08-14 for the same
  crawler reason, converted to static `how-it-works.html`. Real polished
  product content (accurately describes the 5-prompt × 4-model / 20-check
  scan mechanism and the actual score bands, not generic filler — updated
  2026-08-13 when the model expansion changed those numbers). Never
  carried the draft notice.
- **`views/LoginView.vue` / `SignupView.vue`** — plain email/password forms
  against `lib/auth.ts`'s `signIn`/`signUp`. **`SignupView.vue` extended
  2026-08-24**: reads `?claim=<access_token>` (set by `PublicScanView.vue`'s
  "create a free account" CTA) and calls `POST /claim-single-scan` right
  after a successful signup, before navigating on — best-effort, a claim
  failure still lands the new user on `/app` rather than blocking signup.
- **`views/PublicScanView.vue`** — added 2026-08-24 (Milestone 2 of the
  monetization plan), route `/app/scan`, `meta: {requiresAuth: false}` — the
  one page in this app shell a signed-out visitor can see real scan data
  on. Landed on either via `?session_id=` (straight off a $19 single-scan
  Stripe Checkout redirect, before an `access_token` is known yet) or
  `?token=` (the emailed receipt link). Polls `GET /single-scan-status`
  (public, unauthenticated) the same way `CompanyDetailView.vue`'s
  `pollScan()` polls `/scans/:id`, tolerant of a `purchaseStatus:
  'processing'` state since the webhook that creates the purchase row runs
  asynchronously relative to the Checkout redirect. Once resolved: renders
  the completed scan via the shared `ScanDetail.vue` (same component
  `result.html`/`CompanyDetailView.vue` use); auto-calls
  `POST /claim-single-scan` if the visitor is already signed in, otherwise
  shows a persistent "create a free account" banner linking to
  `/app/signup?claim=<token>`.
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
  on one network blip). While a scan is `running`, `formatRunningStatus()`
  (added 2026-08-17) renders the live `{completed, total, currentModel}`
  object `scan-status.mts` now returns as "Running checks: 12/20 done —
  checking anthropic/claude-haiku-4-5…" instead of a static message for
  the whole 5-8 minute wait — not to be confused with
  `CompanyProgressChart.vue` above, which is the unrelated historical
  score-over-time chart. Also owns the "Generate deeper advice" flow (POSTs
  `/scans/:id/deep-advice`, replaces the scan in local state with the
  response on success). `onMounted` auto-triggers a scan when
  `route.query.autoscan === '1'` (set by `CompaniesListView.vue` above),
  then strips the query param via `router.replace` so a refresh doesn't
  re-trigger it. Multi-URL-per-company tracking (a `company_urls` table,
  a URL-chip selector, "+ Add URL") was **removed 2026-08-12** per
  Milestone B of `PLAN_NEXT_PHASE.md` — every company now has exactly one
  URL (`companies.website`), matching `scan.mts`'s current behavior.
  **Added 2026-08-26**: an "Automatic weekly scans: Off/On" toggle next to
  "Run new scan", backed by the new `PATCH /companies/:id`
  (`scan_frequency`). Gated on `isProUser` (same `profile.value.plan_tier
  === 'pro'` check as `allowDeepAdvice`) — clicking while not Pro calls the
  existing `startCheckout()` instead of the PATCH, same upgrade-flow reuse
  as everywhere else in this file. The actual weekly trigger is
  `netlify/functions/scheduled-rescan.mts`, a new scheduled Netlify
  Function this view has no direct dependency on beyond the toggle state.
- **`views/CompanyProgressChart.vue`** — hand-rolled SVG line chart (no
  chart library, matching `ScanDetail.vue`'s score ring/scoreboard
  approach), single series so no legend needed per the `dataviz` skill's
  rule for one series. Breaks the line across any scan with `score: null`
  rather than drawing through a fake 0. First/last x-axis labels anchor
  start/end instead of center so they don't clip past the SVG viewport (a
  real bug caught by screenshotting the rendered chart, not just reading
  the code — the skill's own "render it and look at it" step).
- **`views/CompetitorTrendChart.vue`** — same hand-rolled-SVG approach as
  `CompanyProgressChart.vue` above, but plots mention-count-over-time for
  the brand plus its top named competitors (capped at 5), so unlike that
  single-series component it does render a legend, per the `dataviz`
  skill's "a legend is always present for 2+ series" rule.
- **`views/BillingSuccessView.vue`** — route `/app/billing/success`, the
  page Stripe Checkout redirects back to after a successful Pro
  subscription or credit-pack purchase.
