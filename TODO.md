# TODO

Quick checklist, split by who it's for. Full context/history for most of
these already lives in `TODO-MARKETING.md`, `REPORTPLAN.md`, and
`PLAN_NEXT_PHASE.md` — this file is just the scannable action list, not a
replacement for those.

**Merged with `TODOS.md` on 2026-08-26** (at the CEO's request) — that file's
full chronological shipped-work/status log now lives below as this file's
"History / status log" section, unchanged, so nothing in either file's
content was lost. `TODOS.md` was initially kept as a one-line pointer here
rather than deleted outright, since it was referenced by name from several
other docs — but during the broader 2026-08-27 markdown consolidation pass
those ~13 references were repointed at this file directly, so `TODOS.md`
was then deleted outright too.

**Before picking anything up: run `git status` and `ListAgents` first.**
This repo regularly has multiple concurrent sessions editing it. The
scan-result clarity + competitor-trend-chart work flagged as mid-edit
earlier on 2026-08-25 has since landed (commit `3d12679`, "Add GEO-report
upgrade") — that warning is resolved, but re-check current state before
assuming nothing else is in flight.

## Marc

- [ ] **Supply a real prospect list (10-15 local businesses)** to unblock
      cold outreach — plumbers/dentists/contractors/HVAC/local law-
      accounting type "who does X near me" categories, per
      `proof-script/OUTREACH.md`'s targeting section: brand, website,
      category, region, 2-3 competitors each. This is the channel Marc
      picked (2026-08-28) as the first push for paying users, now that
      Stripe is live — important, but **explicitly deferred for now**,
      not to be picked up proactively until Marc raises it again.
- [ ] **Read the 4 blog posts** at `/blog` (`content/blog/*.md`) before
      treating them as final — the source drafts were explicitly marked
      "needs Marc's read before posting," and only the format was
      converted, not the substance.
- [x] ~~Decide on Stripe live mode~~ **Done 2026-08-28** — went live on
      Dizid's existing multi-app Stripe account (KYC already done from
      other Dizid projects, no fresh activation flow needed). Same day,
      Marc also decided to simplify pricing to **just Free + Pro** — cut
      the top-up-pack SKU and the never-built $39 Starter pack idea below
      entirely, keeping only the $19 no-account single scan alongside Pro.
      Live-mode Products/Prices created for Pro ($99/mo) and single scan
      ($19 one-time); `STRIPE_SECRET_KEY` is now a **restricted** key
      (scoped to Checkout Sessions: Write only — confirmed by reading the
      code that no other Stripe resource is ever called), not a full
      account key, since this account also holds other Dizid apps' real
      revenue. `STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_ID`/
      `STRIPE_SINGLE_SCAN_PRICE_ID` set to their live values on Netlify.
      **Not done on purpose:** no live Price was created for top-ups —
      `STRIPE_TOPUP_PRICE_ID` was deliberately left pointing at its old
      test-mode value so that checkout path fails closed. See the Claude
      item below for the actual code cleanup this still needs, and a flag
      about a second concurrent session that set a live top-up Price
      anyway before this decision was final.
- [x] ~~Create the GA4 property~~ **Done 2026-08-25** — Marc created it,
      provided `G-HZKLBPKH81`, set live on Netlify, confirmed baked into
      the deployed pages. Still open: no cookie-consent mechanism exists on
      the site, a real gap for EU visitors now that a non-essential
      tracking cookie is in play — flagged, not built.
- [ ] **Netlify function log access**, so QA-FIXES-PLAN #3b (root cause of
      the scan-polling failures — suspected Netlify concurrency ceiling)
      can actually be confirmed instead of guessed at from static code.
- [ ] **Priority call on `REPORTPLAN.md` Change 2** (agency portfolio
      view — summary strip, search/sort/filter, "needs attention first"
      default). Fully scoped, not started — still worth building given
      how much of the userbase is actually multi-company?
- [x] ~~Pricing-tier restructure decision (Phase 3 of the report/roadmap
      plan)~~ **Decided 2026-08-26** — see the Starter-pack item below.

## Claude

- [x] ~~Build the $39 Starter pack (10 scans, one-time)~~ **Cancelled
      2026-08-28** — superseded by the same day's Free/Pro-only
      simplification (see Marc's "Decide on Stripe live mode" entry
      above). Never started, so nothing to unwind in code. The plan this
      pointed at (`~/.claude/plans/read-relevant-md-files-linked-wind.md`)
      is now stale — don't resume it without checking with Marc first.
- [ ] **Remove the top-up-pack purchase path** now that it's cut from the
      pricing (see above): the "buy 10 more scans" CTA in the app, the
      `create-topup-checkout-session.mts` function, `stripe-webhook.mts`'s
      `scan_credit_pack` branch, and the top-up mentions in `index.html`'s
      pricing/FAQ copy and `llms.txt`. Not urgent — with no live
      `STRIPE_TOPUP_PRICE_ID` wired in for most contexts the checkout call
      just fails closed — but it's a dead, half-visible feature until
      this lands. **Also needs reconciling first:** a second, concurrent
      Claude Code session set `STRIPE_TOPUP_PRICE_ID`'s *production*
      value on Netlify to a real live Price (`price_1U9NJJ8gBja0qkMxEmZoQWNJ`)
      at 11:53 on 2026-08-28, ~13 minutes before this decision to cut
      top-ups was finalized — so as of this entry, production is
      inconsistent with every other deploy context (dev/branch-deploy/
      deploy-preview/dev-server still point at the old test-mode Price).
      Check with Marc before touching it: either revert production to
      match (safer, matches the cut decision) or leave it if he's changed
      his mind back.
- [x] ~~Fix the `stripe-webhook.mts` token-in-URL issue~~ **Partially
      fixed 2026-08-31, rest deliberately accepted as residual risk** — the
      scan-receipt email links to `/app/scan?token=...`, flagged by an
      automated security review 2026-08-24 as a referrer/access-log leak.
      The referrer half is closed: `app.html` now sets
      `<meta name="referrer" content="no-referrer">`, so the page never
      leaks its own URL (token included) to GA4 or anything else it loads.
      The originally-proposed fix for the other half — a one-time-
      redemption redirect that rotates/invalidates the token on first
      click — was designed, then rejected before shipping: corporate email
      gateways (Microsoft Safe Links, Proofpoint, etc.) commonly pre-fetch
      every link in an email to scan it, which would silently consume a
      strict single-use token before the actual customer ever clicks it —
      locking a paying customer out of their own $19 receipt, a worse
      failure than the leak it fixes. No cookie/session mechanism exists
      anywhere else in this app either (auth is bearer-JWT only), so that
      part of the original proposal would've also been new infrastructure
      for one edge case. Left as a known, accepted residual risk rather
      than shipping something fragile and unverified against real email
      providers.
- [x] ~~Fix the real `pollScan()` gap~~ **Done 2026-08-27** (commit
      `bc7e2e0`) — `CompanyDetailView.vue`'s `pollScan()` now calls
      `load()` before setting a terminal `scanError` when retries exhaust,
      so a scan that actually completed server-side shows up instead of
      dead-ending the UI (QA-FIXES-PLAN #3a). Also added a "Check again"
      action and real test coverage (`tests/aivis-core.test.mjs`) for the
      retry/concurrency logic behind it. This item was left open here by
      mistake — verified directly against the current code.
- [x] ~~`gpt-5-mini` direct API migration~~ **Done, live-verified, and
      deliberately scoped down 2026-08-25** (QA-FIXES-PLAN #5). Key was in
      `DEV.md` (gitignored scratch notes, missed by the `.env`-only
      searches). An actual e2e test through the deployed `enrich.mts`
      (real signup, real JWT, real HTTP call — not just a raw API smoke
      test) caught a real problem: a live OpenAI call takes ~30.5s
      (GPT-5 mini's reasoning overhead), which 502'd `enrich.mts` — it's a
      regular synchronous Netlify Function, not a Background Function, and
      Netlify's platform execution ceiling killed it before it could
      return. Only `run-scan-background.mts` (Background Function, ~15 min
      ceiling) and `proof-script` use the direct path now.
      `enrich.mts`/`stripe-webhook.mts`/`judge-sentiment.mts`/
      `generate-deep-advice.mts` were reverted to Perplexity-only on
      purpose — re-verified `enrich.mts` works again after reverting.
- [ ] **Build `REPORTPLAN.md` Change 2** (see Marc's priority-call item
      above — don't start until that's a yes).
- [x] ~~Shared header/footer partial~~ **Done 2026-08-26** — new
      `partials/*.html` (favicon, fonts, marketing-theme-link, ga4, nav,
      footer) plus `scripts/html-includes.mjs`, wired into all 6 places via
      a small Vite plugin (`order: 'pre'`, required so it runs before
      Vite's own `%VITE_...%` substitution) and reused directly by
      `scripts/build-blog.mjs`. Verified the composed `dist/` output is
      byte-identical to before for all 5 Vite-built pages via a
      before/after diff; only the blog's GA4 line changed (quote style +
      an inert guard clause, now matching the other 5 pages exactly).
- [ ] **Reconcile docs once the in-progress scan-clarity work (see repo
      status note above) lands** — `PLAN_NEXT_PHASE.md` will need a status
      update once that commits, same pattern as the blog reconciliation on
      2026-08-24.

---

## History / status log

Everything below this line is the former `TODOS.md`, moved here verbatim
(headings demoted one level) as part of the 2026-08-26 merge. Newest first.

### STATUS 2026-08-26: openai-lane concurrency raised 1 → 3 — SHIPPED, live-verified against the direct API, not yet against a full production scan

**Trigger:** Marc asked for a competitive-analysis deep-research pass (started
from a ChatGPT conversation reviewing Foreground vs. Brand Armor), then asked
to turn its "concurrency re-test" idea into an actual implementation plan. See
`docs/improvement-roadmap.md`'s "Concurrency re-test" section for the full
history this continues — that section's original ask (re-test anthropic/
google/xai now that they call direct APIs) turned out to already be shipped
and live-verified 2026-08-23 (`CONCURRENCY_LIMIT_BY_PROVIDER = {openai: 1,
anthropic: 3, google: 3, xai: 2}`, real scan completed in 233.5s, down from
5-8 min). What was actually still open: the `openai` lane was left at 1
because it used to share Perplexity's fragile shared-gateway key — but since
2026-08-25, `OPENAI_API_KEY` is live and `gpt-5-mini` calls OpenAI's own API
directly (see `shared/CLAUDE.md`'s multi-provider client entry), so that
lane's `1` cap was never re-examined against the new routing.

**What shipped:** A throwaway script (`callModel` direct, real
`OPENAI_API_KEY` sourced from `DEV.md`, deleted after use, not committed)
tested burst sizes 1/2/3 against the live OpenAI API — 16/16 calls succeeded
(100%), including 9/9 at burst size 3, with no latency degradation (each call
still ~25-40s). `CONCURRENCY_LIMIT_BY_PROVIDER.openai` raised from 1 to 3 in
`netlify/functions/run-scan-background.mts` (matching anthropic/google),
comment block extended in place with the test result and rollback condition.

**Verified:** `npm run build` clean before and after the change.
**Not yet verified:** a full 20-call production scan's `scans.failures` —
the burst test hit the raw OpenAI endpoint directly, not the whole scan
pipeline (DB writes, Harmonia, sentiment judge, the other 3 provider lanes
running concurrently alongside it). Trigger one real scan post-deploy and
check `scans.failures` for a 429 (or any new failure) before treating this as
fully settled — roll back to `openai: 1` immediately if one appears, same
discipline as every prior concurrency change in this file's history.

### STATUS 2026-08-24: On-site `/blog` pipeline — SHIPPED, content not yet reviewed

**Trigger:** Marc asked for a plan to make the app "best of breed" (easier
to use, clearer scan results, more SEO). Full plan at
`~/.claude/plans/ethereal-waddling-globe.md` — 4 phases (quick fixes,
scan-result clarity, on-site blog, lower-priority cleanup). **Only the
blog phase shipped this round** — the scan-result clarity phase was
deferred because another live session was concurrently editing
`ScanDetail.vue`/`CompanyDetailView.vue`/`company.mts` for the single-scan
SKU above; re-check `git status` before picking that phase up.

**What shipped:** `scripts/build-blog.mjs`, a post-`vite build` Node step
that renders `content/blog/*.md` (frontmatter + markdown) into static
`dist/blog/<slug>/index.html` pages + a `/blog` index, styled by new
`public/blog-theme.css`, and appends the new URLs into `dist/sitemap.xml`.
Four posts, repurposed from the pre-existing `content/articles/*.md`
LinkedIn/Substack drafts (which are untouched — still there for social
posting). See `CLAUDE.md`'s new "`/blog` — a seventh, non-Vite content
mechanism" section for the technical detail, including the "not served by
`npm run dev`" gap.

**Not done:** the shared header/footer partial `index.html`/
`how-it-works.html`/`privacy.html`/`terms.html` still duplicate (blog
pages match that existing duplication rather than fixing it). **Most
importantly: the essay content itself is still Marc's original draft**,
explicitly marked "needs Marc's read before posting" in the source
frontmatter — the pipeline and format conversion are done, the actual
read-through is not, regardless of whether this entry says "shipped."

**Update (later same day):** the `/blog` nav link was added to all four
static pages' footers, `scripts/build-blog.mjs`'s own template, and
`src/app/App.vue`'s authenticated-app footer — the "not done" nav-link gap
above is closed. The duplicated-markup gap and the content-review gap are
still open.

> **Editor's note (2026-08-26 merge):** the "duplicated-markup gap" above
> is now closed too — see the "Shared header/footer partial" item in the
> Claude checklist above, done the same day as this merge.

### STATUS 2026-08-24: Deep-advice gating + $19 single-scan SKU + real Pro pricing — SHIPPED and live

**Trigger:** Marc asked for a full monetization + marketing/PR/sales plan
("we need alot of improvements to monetize and market this app"). Full plan
at `~/.claude/plans/we-need-alot-of-transient-floyd.md` — reconciles a
prior monetization draft against the actual current code, decides pricing
directly with Marc ($199/mo Pro, $19 one-time scan) rather than waiting on
the never-run E0 manual sales test from `PLAN_NEXT_PHASE.md` (explicitly
waived this round), and adds a marketing/PR/sales section (positioning,
analytics gap, repointing `proof-script/OUTREACH.md` at Foreground itself,
a PR angle, the growth-loop badge — none of the marketing-side items are
built yet, only planned).

**Milestone 1 — deep advice gating, shipped:**
`generate-deep-advice.mts` now requires `isPro(planTier)` (or a matching
`single_scan_purchases` row, once Milestone 2 landed same day), returning
`402 {error, upgradeRequired: true}` instead of generating for free —
previously any authenticated owner of a completed scan could generate it
unlimited times. `ScanDetail.vue` gained a `deepAdviceLocked` prop
rendering an upgrade CTA in place of the button instead of hiding the
section outright; `company.mts`'s `GET /companies/:id` gained a missing
`profile` field so `CompanyDetailView.vue` can compute the gate from the
real `plan_tier`.

**Milestone 2 — $19 one-time single-scan SKU, shipped:** a new purchase
path serving both an anonymous lead-gen visitor (email+website → Stripe
Checkout → webhook enriches the site via the same helpers `enrich.mts`
wraps, creates an ownerless `companies`+`scans` row, emails a claim link)
and a logged-in free-tier user out of scans who doesn't want to subscribe.
New `single_scan_purchases` table (doubles as the deep-advice entitlement
record, the free-cap-bypass record, and — for anonymous buyers — the
pending-claim record); `companies.owner_user_id` is now nullable
(explicitly signed off by Marc — doesn't reopen the 2026-08-03 "single
owner per company" decision, a company is just transiently ownerless until
claimed). New public routes: `/app/scan` (`PublicScanView.vue`),
`single-scan-status.mts`, `claim-single-scan.mts`,
`create-single-scan-checkout-session.mts` (the one function in this repo
with *optional* auth). A landing form on `index.html` posts directly to
the checkout function via a small inline `<script>` — the only interactive
JS on that otherwise-static page.

**Pricing sync, shipped:** `index.html` (pricing cards + JSON-LD `Offer`s +
FAQ), `llms.txt`, `README.md`, `terms.html` (new single-scan billing
terms), and both nested `CLAUDE.md` files updated from the old "One flat
price /month" placeholder to the real $199/$19 numbers.

**Stripe/ops, shipped same day (previously flagged as needing Marc's
action, done directly instead once asked):** a direct Stripe API check
found the existing `STRIPE_PRICE_ID` actually charged **$29/month**, not
the intended amount — corrected by creating a new Price at $199/mo and
swapping the env var (Stripe Prices are immutable, can't edit in place).
Also created and set `STRIPE_TOPUP_PRICE_ID` (unblocking the 2026-08-23
top-up pack, previously 500ing) and the new
`STRIPE_SINGLE_SCAN_PRICE_ID`. All three verified live post-deploy via
direct curl to the checkout-session functions (no more "Server
misconfigured" 500s), and the single-scan one additionally verified by
completing a real anonymous Checkout-session request and confirming the
resulting Stripe session's `amount_total`/metadata match what the webhook
expects. **Real finding, not yet acted on**: `STRIPE_SECRET_KEY` is a
test-mode key (`sk_test_...`) — every Checkout this app has ever
completed, including the previously-"live" Pro plan, has been fake money.
Going live needs Stripe live-mode activation (business/banking details)
plus live-mode equivalents of all three Prices — a bigger step, Marc's
call, not done this session.

**Verified:** `npm run build` clean throughout (multiple passes across the
session). Manual DB-backed browser verification of Milestone 1 was
attempted but blocked by this specific sandbox's local dev-DB-proxy
connectivity (same class of environment limitation as this file's own
2026-08-12 entry) — worked around for Milestone 1 by inserting synthetic
test data directly via Neon MCP and confirming the code path by trace; a
throwaway test account/company/scan from that pass (`claude-test-m1-...@example.com`)
is still sitting in the live DB, cleanup deferred to Marc's call. Milestone
2's Stripe-level verification (above) is real and live, not synthetic —
no live end-to-end webhook-triggered scan was run (would spend real
Perplexity money; deliberately not done without asking first).

**Not done this session, open for a follow-up**: the marketing/PR/sales
side of the plan (Part B) — pricing copy is synced, but analytics still
doesn't exist anywhere on the site, `proof-script/OUTREACH.md` still
targets Site Improver rather than Foreground, no PR outreach has happened,
and the growth-loop badge (Milestone G of `PLAN_NEXT_PHASE.md`) is still
unbuilt. Engineering Milestones 3 (scheduled rescans) and 4 (team/agency
access) from the same plan are also unbuilt.

> **Editor's note (2026-08-26 merge):** analytics is no longer missing —
> GA4 shipped 2026-08-25 (see the Marc checklist item above).

### STATUS 2026-08-23: Pro scan top-up packs — SHIPPED, but not yet live (Stripe Price not created)

Triggered by a CEO screenshot: a Pro user hitting the 20-scans/month
fair-use cap saw a dead end, no CTA at all (`scan.mts`'s Pro branch never
set `upgradeRequired`, since there was nothing to upsell to). Shipped same
session, commit `cad4a34`: a one-time $19/10-scan top-up pack, Pro-only,
deliberately kept generic (no agency/team-specific segment — CEO explicitly
scoped that out). New `scan_credit_purchases` table (insert-only, rolling
2-calendar-month credit window, no decrementing balance), new
`create-topup-checkout-session.mts` (`mode: payment`, capped at 3
packs/user/month as a shared-infrastructure guardrail on the
single-concurrency Perplexity lane), a new webhook branch in
`stripe-webhook.mts`, and a "Buy more scans" CTA + purchase-return banner
in `CompanyDetailView.vue`. Also fixed four places where "Pro = unlimited
scans" copy had gone stale since the cap shipped 2026-08-13 (`index.html`
x3, `terms.html`, `BillingSuccessView.vue`, `llms.txt`) — `terms.html`
also gained language covering top-up non-refundability and
forfeiture-on-downgrade, which it previously said nothing about. Full
design record: `~/.claude/plans/analyze-this-we-need-radiant-token.md`.
Doc detail: `netlify/functions/CLAUDE.md`'s "Billing (Stripe)" section and
the `scan_credit_purchases` schema entry; cross-referenced from
`PLAN_NEXT_PHASE.md`'s Milestone E (this is *not* that milestone — the
still-unbuilt one-time report SKU and deep-advice gating are unaffected).

**Not yet live**: `STRIPE_TOPUP_PRICE_ID` doesn't exist yet — needs a new
$19 one-time Stripe Price created (test mode first) and set as a Netlify
env var before "Buy more scans" does anything but 500. No real test-mode
Checkout has been run end-to-end. See root `CLAUDE.md`'s Deployment
section.

> **Editor's note (2026-08-26 merge):** this Price was created and set the
> next day — see the 2026-08-24 entry above.

### STATUS 2026-08-20: Auto-judge sentiment on every scan — SHIPPED; mobile QA pass documented, fixes not yet built

**Shipped:** the sentiment judge (Milestone F of `PLAN_NEXT_PHASE.md`, live
since 2026-08-15 as an on-demand per-check button) now also runs
automatically. `run-scan-background.mts` auto-judges every check where the
brand was actually mentioned right after the main 20-call loop finishes,
bounded to whatever's left of `SCAN_DEADLINE_MS` (not a fresh budget) so a
slow scan just auto-judges fewer checks rather than repeating either of the
two past concurrency incidents. The manual "Judge sentiment" button is
unchanged and stays as the fallback for whatever the automatic pass didn't
reach, plus manual re-judging. `ScanDetail.vue`'s Overview tab gained a
compact sentiment-classification summary row so this is visible without
opening the Details tab. See `shared/CLAUDE.md`'s "Sentiment judge" entry
for the full detail; `PLAN_NEXT_PHASE.md`'s Milestone F is now marked
shipped.

**Not shipped, documented as a handoff plan:** Marc ran a mobile QA pass
(Android Chrome) over 2026-08-19 and 2026-08-20 on the marketing site,
`how-it-works.html`, and the authenticated app, marking up screenshots. The
7 annotated issues were researched (root causes traced, two items
clarified directly with Marc) and written up as `QA-FIXES-PLAN.md`
(untracked at repo root) — deliberately left as a plan rather than
implemented, since another session was mid-implementation on unrelated work
when this was written. Headline items: a real mobile nav-collision CSS bug
on `index.html` (`nav.top` has zero `@media` treatment below ~640px); a
"Failed to fetch" error on "Run new scan" that's a frontend polling
UX gap in `CompanyDetailView.vue`'s `pollScan()` (retries exhaust without
re-syncing to the server, root cause needs live Netlify log access to fully
confirm); a docs gap where `how-it-works.html` doesn't mention the
sentiment-judge feature exists; and a confirmed follow-up to migrate
`gpt-5-mini` off the Perplexity gateway onto a direct OpenAI API key,
matching the anthropic/google/xai pattern. Full detail, root-cause tracing,
and suggested shipping order in `QA-FIXES-PLAN.md` itself.

### STATUS 2026-08-19: Harmonia (technical/SEO audit) + report Overview/Details tabs — SHIPPED

**Trigger:** Marc asked for "massive improvements" — technical/SEO analysis
of scanned websites (schema.org/JSON-LD checks) plus a clearer, more
scannable report ("harmonica bars"), with the AI Visibility Score staying
the main thing. Mid-conversation Marc pasted in a Gemini-authored plan
(`GEMINI-PLAN`) proposing a much larger scope — a single blended
"Harmonia Score" (Technical 40% + On-Page 30% + Content/AI-Readability
20% + UX 10%) that would have replaced the AI Visibility Score as the
headline metric, plus AI-based E-E-A-T/entity-salience scoring and
per-element Core Web Vitals diagnosis via Lighthouse. Reconciled directly
with Marc rather than silently picking a side: AI Visibility Score stays
the sole headline/moat metric (confirmed twice); the new "Harmonia Score"
is a separate, secondary score, never blended in; the AI-heavy/Lighthouse
items were deferred to a follow-up phase, not built this round. Full plan:
`~/.claude/plans/ping-spicy-oasis.md`.

**Shipped:**
1. **`shared/harmonia.mjs`** (new file) — `analyzeHarmonia(prospect, psiApiKey)`.
   One homepage fetch + regex HTML parsing (no cheerio/jsdom — zero new
   dependency), `/robots.txt` + `/sitemap.xml` reachability, JSON-LD
   structural validation (hand-rolled, not Google's Rich Results Test —
   no public API exists for that) + rule-based (not LLM) schema
   opportunity suggestions with copy-paste starter snippets, security
   headers, and a PageSpeed Insights call (mobile strategy) for Core Web
   Vitals. Never throws — every step degrades to null/empty on failure,
   same discipline as `callModelWithRetry`. Computes 4 pillar scores
   (Technical SEO 40%, On-Page SEO 30%, Content Structure 20%, UX Signals
   10%) and a weighted `harmoniaScore`, renormalized across whichever
   pillars actually computed if one fails (e.g. PSI down → UX Signals
   pillar excluded, not zeroed).
2. **`scans.harmonia jsonb`** — new nullable/additive column (Neon MCP
   migration, verified on a temp branch first), same pattern as
   `own_site_citations`/`sentiment_judgments`. `run-scan-background.mts`
   kicks off `analyzeHarmonia()` in parallel with (not serialized into) the
   sequential 20-call LLM loop — it's a plain fetch chain with no
   Perplexity-rate-limit interaction, and its own ~60s internal budget
   finishes well inside the LLM loop's 5-8 minute typical runtime, so it
   adds no measurable wall-clock time to the scan.
3. **`ScanDetail.vue` Overview/Details tabs** — implements `REPORTPLAN.md`'s
   Change 1 (approved 2026-08-18, never built), extended with a new
   `CollapsibleSection.vue` accordion component for the Details tab's
   sections instead of one flat list. See `src/shared/CLAUDE.md` for the
   full breakdown. `REPORTPLAN.md`'s Change 2 (agency portfolio view) is
   unrelated to this request and remains unbuilt.
4. Live-verified: `shared/harmonia.mjs` against real sites (stripe.com —
   correct schema detection, opportunity suggestions, graceful PSI
   failure with a bad key) before wiring into the pipeline; the full
   report UI via `browse` against synthetic payloads (populated Harmonia
   data, `harmonia: null` legacy-scan fallback, mobile viewport) — see
   the plan doc's verification section for specifics.

**Resolved same day:** `GOOGLE_API_KEY`'s GCP project (used for
`google/gemini-3-flash-preview`) does **not** have the PageSpeed Insights
API enabled — confirmed live (403, "PageSpeed Insights API has not been
used in project 746072244237 before or it is disabled"). Marc provisioned
a dedicated GCP project + key with PSI enabled; live-verified against the
real API (HTTP 200, real performance score/LCP/CLS returned) before being
set as `GOOGLE_PAGESPEED_API_KEY` on Netlify, followed by a fresh manual
deploy (via Netlify MCP `deploy-site`) to make sure that specific deploy's
function config includes it rather than assuming the next auto-deploy
would. Also fixed the same day, flagged by an automated security review of
the initial commit: `harmonia.mjs`'s three direct site fetches
(homepage/robots.txt/sitemap.xml) had no restriction on target address — a
company's fully user-controlled `website` field could point at an internal
service or cloud metadata endpoint (SSRF). Added a `safeFetch()` guard:
rejects non-http(s) schemes, DNS-resolves the hostname and refuses
loopback/private/link-local/metadata addresses, and re-validates on every
redirect hop instead of trusting `fetch`'s default auto-follow. PageSpeed
Insights itself is deliberately not covered — that fetch runs on Google's
infrastructure, not ours.

### STATUS 2026-08-17 (continuing same day): Grok timeout root cause + streaming scan progress — SHIPPED, not yet live-verified

**Trigger:** `docs/grok-timeout-investigation.md` and
`docs/improvement-roadmap.md` (written earlier the same day, branch
`claude/delays-root-cause-solution-ofveu8`) — the investigation doc
root-caused the entry directly below (`xai/grok-4.6` timing out) one level
deeper: the 2026-08-17 patch below stopped a slow xai call from starving
other providers, but never addressed why xai itself keeps timing out — a
flat 60s `CALL_TIMEOUT_MS` shared by all 4 models is simply too tight a
margin over Grok's own documented 30-50s+ typical latency
(`aivis-core.mjs`'s `MODELS` comment). The roadmap doc's top follow-up
(re-testing `CONCURRENCY_LIMIT` now that 3 of 4 models call independent
providers) and its "stream scan progress" UX candidate are the other two
items addressed here.

**Shipped:**
1. **Per-model call timeout** (`run-scan-background.mts`) — `xai/grok-4.6`
   now gets 100000ms instead of the shared 60000ms `CALL_TIMEOUT_MS`
   (`CALL_TIMEOUT_MS_BY_MODEL`), Option 1 from the investigation doc. Chose
   this over Option 2 (swap Grok for a different/faster model) since the
   candidate replacement IDs in that doc are explicitly unverified against
   a live call (no `XAI_API_KEY` available in this environment either) and
   swapping xAI out changes the product's "4 major AI assistants" story —
   a bigger, less reversible call than widening one timeout.
2. **`SCAN_DEADLINE_MS`** 600000 → 720000 (10 → 12 min) — a longer xai
   timeout without more overall room would shrink the deadline's margin for
   xai's own 5 calls (queued last), not grow it. Stays well under
   Background Functions' 900000ms platform ceiling.
3. **Streaming scan progress** — new nullable `scans.progress jsonb` column
   (`{completed, total, currentModel}`, additive migration via Neon MCP,
   same pattern as `failures`/`own_site_citations`/`sentiment_judgments`),
   written incrementally by `run-scan-background.mts` before each call
   starts. `scan-status.mts` now returns it; `CompanyDetailView.vue`'s
   polling UI shows "Running checks: 12/20 done — checking
   anthropic/claude-haiku-4-5…" instead of a static "Running checks (~5-8
   min)…" for the whole wait. `completedCount` is a plain JS counter, not
   an atomic SQL increment — safe only because `CONCURRENCY_LIMIT` is 1; if
   concurrency is ever raised this needs to change too (noted inline).

**Deliberately NOT done, matching this file's own established caution
around this specific knob:**
- **`CONCURRENCY_LIMIT` re-test** (roadmap doc's #1 priority item) — still
  blocked. This environment has only `PERPLEXITY_API_KEY` available
  locally (checked `proof-script/.env`); the re-test needs
  `ANTHROPIC_API_KEY`/`GOOGLE_API_KEY`/`XAI_API_KEY` too, none of which are
  present. `CONCURRENCY_LIMIT` has been mistuned three times already
  (2026-08-09 10→4, 2026-08-13 4→1, both from live incidents) — not
  something to guess at without the live burst-test data the roadmap doc's
  own throwaway script is designed to produce. Whoever next has all 4 keys
  locally should run that script first.
- **Grok replacement (Option 2 / candidate models)** — not attempted, for
  the same reason: the candidate IDs (`perplexity/sonar`,
  `xai/grok-4-1-fast-non-reasoning`, etc.) are sourced from web search, not
  a live call, and this file's own 2026-08-09 entry is a direct precedent
  for what happens when unverified model IDs ship anyway.

**Next steps:** a live timed scan (needs all 4 provider keys) to confirm
the new 100s xai timeout and 12-minute deadline actually behave as
reasoned above rather than assumed — this patch passed `npm run build` and
`npm run test:run` but nothing here has touched a real provider API. Once
someone has real keys: run the roadmap doc's concurrency-test script too,
in the same session, and log the result here.

> **Editor's note (2026-08-26 merge):** the concurrency re-test above did
> eventually happen, in stages — see the 2026-08-23 and 2026-08-26 entries
> above.

### STATUS 2026-08-17: Cascading-timeout gap (2026-08-14 entry below) — fixed with a targeted patch

**Trigger:** Marc reviewed annotated screenshots of two real production
scans (NRC, De Nara Hotel) showing `11/20` and `7/20` checks failed, with
failure detail pointing at `xai/grok-4.6` timing out repeatedly and then
starving unrelated openai/google/anthropic checks with "Scan deadline
exceeded before this check started." This is the exact gap the 2026-08-14
entry below root-caused and deliberately left unfixed ("log it, decide
later") — now resurfacing via `xai/grok-4.6` specifically, whose documented
30-50s+ typical latency (see aivis-core.mjs's MODELS comment, added
2026-08-15) sits right up against the unchanged 60s `CALL_TIMEOUT_MS`.

**Fix shipped, deliberately the smallest of the three candidates the
2026-08-14 entry listed** (chose this over shortening `CALL_TIMEOUT_MS` or
re-testing `CONCURRENCY_LIMIT` across independent providers, since those are
bigger changes to knobs already mistuned three times in production):

1. `callModelWithRetry` (`shared/aivis-core.mjs`) now only retries on HTTP
   429 (rate-limit) errors. A timeout was previously retried the same as
   any other failure — up to 3 attempts x 60s `CALL_TIMEOUT_MS`, ~182s
   worst case for one stuck call, all of it serialized under
   `CONCURRENCY_LIMIT=1`. A timeout is very unlikely to succeed on
   immediate retry the way a transient rate-limit response is, so this
   drops the worst case for a genuinely stuck call to ~60s (one attempt, no
   retry) without touching the rate-limit backoff path that's demonstrably
   working (see the 2026-08-13 429 incident below).
2. `run-scan-background.mts`'s task queue is now built model-major
   (`[allPrompts x model1, allPrompts x model2, ...]`) instead of
   prompt-major. Doesn't reduce total sequential time, but changes which
   calls get starved if the deadline does fire: `MODELS`' existing order
   already puts `xai/grok-4.6` last, so a slow xai run can now only eat
   into xai's own remaining checks instead of blocking whichever
   openai/google/anthropic calls happened to queue right behind it for the
   same prompt — the exact pattern both real scans hit.

**Not changed:** `CONCURRENCY_LIMIT` (still 1), `SCAN_DEADLINE_MS` (still
600000), `CALL_TIMEOUT_MS` (still 60000) — same reasoning as the
2026-08-15 direct-provider migration's own note about not blind-retuning
multiple knobs in one change. Re-testing whether `CONCURRENCY_LIMIT` needs
to be a hard global 1 now that 3 of 4 models call independent providers
(not sharing Perplexity's rate limit anymore) is still a real, plausible
follow-up — just not bundled into this patch, so if something regresses
it's traceable to one change at a time.

**Next steps:** re-run a real scan against a company that previously showed
high failure counts and confirm the failure count drops and any remaining
failures concentrate in `xai/grok-4.6` rather than spreading across
providers — not yet done as of this entry (this patch shipped fixing the
code paths and passing `npm run build`/`proof-script --dry-run`, but a real
end-to-end scan against production Perplexity/provider traffic, the same
kind of live verification the 2026-08-14 entry below did for the model
expansion, is still outstanding).

### STATUS 2026-08-14: Live verification of Milestone C1/C2 — confirmed live, but surfaced a new reliability gap (not fixed, logged for later)

**What was done:** the 2026-08-13 entry below shipped `d43ac1a` (Milestone
C1/C2) but explicitly left "a real end-to-end scan through the actual
hosted app" unverified. That commit was, by this date, already pushed and
deployed to production (confirmed via Netlify: current production deploy
`6a7d8c5567b7ee000839bed9` is built from `d43ac1a`) — the "uncommitted, not
yet pushed" note on that entry's heading below is stale, corrected here.
Ran the missing verification: signed up a throwaway test account (`browse`
skill headless browser), created a company for ASML — the same brand that
hit Milestone A1's false-zero bug pre-fix — let the app's auto-scan
trigger, timed it end to end, and cross-checked against two other real
scans run the same day by someone else on this system (NRC, De Nara Hotel
— found via their scan-complete emails, then confirmed via a direct Neon
query against `scans`).

**Confirmed working:** ASML scored 100/100 — Milestone A1's false-zero-brand
fix holds with the new 4-model mix. The scan-complete email
(`_shared/email.mts`) fired and arrived within ~1s of the scan finishing.
Per-call failure detail rendered correctly in `ScanDetail.vue`, exactly as
Milestone A3 designed it — a specific model/prompt/error per failed check,
not the old generic "isn't currently recorded" note.

**New problem found — not previously known:** the ASML scan took **9m51s**
(docs/UI say "~5-8 min") and only **5 of 20 calls completed** — 15 failed,
almost all `"scan deadline exceeded"` (either "before this check started"
or "waiting for X"). Root cause, traced through
`run-scan-background.mts`/`shared/aivis-core.mjs`: two
`google/gemini-3-flash-preview` calls each hit the full 60s per-attempt
timeout (`CALL_TIMEOUT_MS`), and `callModelWithRetry`'s 3 attempts (worst
case ~182s per call: 60s + 1s backoff + 60s + 1s + 60s) ran fully
serialized under `CONCURRENCY_LIMIT = 1` — those two slow calls alone
consumed roughly half the 10-minute `SCAN_DEADLINE_MS`, so the 13 calls
still queued behind them in the strictly-sequential run never got a turn
before the deadline fired. Same-day comparison, via Neon (`scans.failures`
array length): NRC lost 4/20, De Nara Hotel lost 3/20 — within the range
this design already tolerates. ASML's 15/20 is a worse outlier, but it's
exactly the failure mode `run-scan-background.mts`'s own comment already
named as a risk ("up to 180s for one bad call") — sequential-only
execution means a couple of slow/flaky calls to any one model can cascade
into losing most of a scan, since nothing else can run while one call is
mid-retry.

**Not fixed — deliberately.** Asked Marc how to handle it; he chose "log
it, decide later," so no code changed this session. Candidate fixes for
whoever picks this up next: shorten `CALL_TIMEOUT_MS` so one stuck call
can't eat ~182s; cap further retries scan-wide once a model has already
timed out repeatedly in the same scan; or re-test whether
`CONCURRENCY_LIMIT` needs to be a hard global 1 across every provider — the
2026-08-13 burst-test that produced that number tested same-provider
bursts, not whether one in-flight OpenAI call + one in-flight Anthropic
call hit the same edge limit at Perplexity as two same-provider calls did.

**Immediate next steps:** none scheduled — known, documented gap, not an
active task, until Marc prioritizes it.

### STATUS 2026-08-13: Model expansion + concurrency fix + Pro fair-use cap (Milestone C1/C2 of `PLAN_NEXT_PHASE.md`) — SHIPPED, deployed to production (see 2026-08-14 entry above for live-scan verification, which found a new gap)

**Trigger:** Marc reviewed annotated screenshots showing a live production
incident — TSMC/Google LLC/Hotel De Nara scans losing 16-18 of 20 calls to
HTTP 429, one real brand (Google LLC) reading as a false "Invisible / 0"
purely from rate-limiting — plus an explicit ask to check more AI models
than just OpenAI/Gemini ("WE NEED MORE MODELS" per an earlier screenshot,
tracked as Milestone C1 in `PLAN_NEXT_PHASE.md`).

**What shipped, in order:**
1. **429 incident fix, part 1** (same session, before the model work):
   `CONCURRENCY_LIMIT` 10 → 4, `SCAN_DEADLINE_MS` 100000 → 120000, added a
   rate-limit-aware escalating backoff in `callModelWithRetry`
   (`shared/aivis-core.mjs`) and bumped retry attempts 2 → 3
   (`run-scan-background.mts`).
2. **Model candidates identified.** Live-queried Perplexity's `GET
   /v1/models` (42 models across openai/google/anthropic/xai/perplexity) to
   find real, current model IDs rather than guessing from a changelog like
   the reverted 2026-08-09 attempt did. Marc picked `anthropic/claude-haiku-4-5`
   + `xai/grok-4.6` (over Claude-only or a broader 5-model set).
3. **Smoke-tested both, per the established one-at-a-time discipline** — a
   throwaway Node script (deleted after use), calling `callModel` directly.
   `xai/grok-4.6` worked immediately. `anthropic/claude-haiku-4-5` failed
   with HTTP 400 "max_output_tokens is required when using Anthropic
   models" — fixed by having `callModel` send that field, but only for
   `anthropic/*` models.
4. **Bigger finding from the same smoke-testing pass:** a deliberate
   concurrency burst test (bursts of 2, 3, 4 concurrent calls, including
   across different providers simultaneously) found Perplexity's real
   per-key concurrency limit is **~1**, not the 4 that had just been shipped
   in step 1 — every burst above size 1 failed 50-83% of the time with
   HTTP 429; fully sequential (no overlap) succeeded 100%. This means the
   step-1 fix, while a real improvement over concurrency=10, was **still
   silently dropping a large fraction of calls** in production. Confirmed
   with Marc before proceeding rather than guessing again (this is exactly
   the mistake the original incident and the 2026-08-09 model revert both
   already punished).
5. **Retuned for real:** `CONCURRENCY_LIMIT = 1` (fully sequential),
   `SCAN_DEADLINE_MS = 600000` (10 min, up from 120000). Sequential-only
   means wall-clock time scales directly with call count, so growing
   `MODELS` from 2 to 4 while keeping the full 10-prompt set would have
   pushed a scan to ~13 minutes — instead, `run-scan-background.mts` now
   uses a 5-prompt slice of `PROMPT_TEMPLATES` (20 calls total, same as
   before the model expansion). `proof-script` keeps the full 10 prompts
   (not latency-constrained by a live browser tab).
6. **Pro fair-use cap added**, per Marc's explicit instruction ("usage cap
   ON! at low limit"): `PRO_PLAN_MONTHLY_SCAN_LIMIT = 20` in
   `_shared/plan.mts`, a new monthly-count branch in `scan.mts` for Pro
   users (calendar-month, vs. the free tier's lifetime cap), 402 with a
   plain error message and no `upgradeRequired` (Pro is already the top
   tier). Confirmed no frontend changes needed — `CompanyDetailView.vue`'s
   existing generic error display already handles it.
7. **Doc/comment sweep**: `CLAUDE.md`, `README.md`, `PLAN_NEXT_PHASE.md`,
   `WISH_LIST.md`, `brand/BRAND.md`, `src/app/views/HowItWorksView.vue`
   updated to reflect 4 models / 20 calls (5-prompt slice, not 10) instead
   of the old 2 models / 20 calls (10 prompts). `CompanyDetailView.vue`'s
   "Running checks (~20-60s)…" status text updated to "~5-8 min".

**Also shipped, same session:** Marc asked for a scan-complete notification
(email and/or phone alert) so nobody has to sit and watch a 5-8 minute scan
run live. Scoped to email-only. `_shared/email.mts`
(`sendScanCompleteEmail`) sends via Resend's HTTP API, called from
`run-scan-background.mts` after every scan finalizes (success or failure),
best-effort (a failed send is logged, never blocks/fails the scan itself).
Sends from `scans@notifications.dizid.com` — registered with Resend, DNS
records (DKIM/MX/SPF) added to `dizid.com`'s Netlify-managed DNS zone,
verified, and confirmed working with a real delivered test email to a
non-owner address. `RESEND_API_KEY` reused from an existing personal Resend
account (shared with other unrelated Dizid projects) rather than a new
account created for AIVis.

**Verification done:** `npm run type-check`, `npm run build`,
`node proof-script/index.mjs --dry-run` all clean. Real-money smoke tests
(model verification + concurrency burst tests) run live against Perplexity,
total spend well under $1. **Not yet verified:** a real end-to-end scan
through the actual hosted app (would cost real money per the new 4-model
mix and take 5-8 min) — recommend doing this once, timed, before trusting
`SCAN_DEADLINE_MS`'s margin in practice. Also not yet committed/pushed.

### STATUS 2026-08-12: Bug-fix phase (Milestones A, B, D3/D4 of `PLAN_NEXT_PHASE.md`) — SHIPPED to master, pushed

**Trigger:** Marc reviewed the live app on his phone (15 annotated
screenshots) and found real brands scoring a false `0/100 — Invisible`
(ASML, TSMC, NRC), plus reliability complaints ("Failed to fetch" on scan,
scans feeling slow, failed checks not explained) and scope-cut requests
(kill the leaderboard, kill multi-URL tracking). Full plan, root-cause
table, and screenshot-to-fix traceability live in `PLAN_NEXT_PHASE.md` —
not duplicated here.

**What shipped, in order (7 commits, `1b0c7a9..8af2803`, pushed to
`origin/master`):**
1. Deleted the leaderboard entirely (route, `leaderboard.mts`,
   `LeaderboardView.vue`) — it was fully committed/live (`1b0c7a9`), not
   WIP; Marc decided it was unwanted scope.
2. Three parallel agents (isolated git worktrees, merged back with one
   manual conflict resolution in `router.ts`):
   - **detection-core**: fixed `isAmbiguousBrandName()`'s false-positive
     bug (see `CLAUDE.md`'s Detection section for the root cause), added a
     per-competitor `ambiguous` flag, resurrected per-call `failures`
     detail + `total_tokens` (new Neon migration, verified on a temp
     branch), fixed duplicate "ALSO WORTH NOTING" advice headings.
   - **company-flow**: removed multi-URL-per-company tracking and
     `is_public`/leaderboard plumbing, added retry-with-backoff to
     `pollScan()` and `enrich.mts`, added a shared CORS helper, fixed the
     create-company flow to auto-navigate + auto-scan instead of leaving
     an ambiguous bare `0` on the list.
   - **product-surfaces**: added a footer (Privacy/Terms/How-it-works/
     Dizid attribution) to the app shell, three real content pages (not
     filler — Privacy/Terms carry an explicit "have this reviewed" notice;
     How This Works accurately describes the actual scoring mechanism),
     a favicon, theme-color, sitemap entries.
3. Verified: `npm run build` clean after every merge, `proof-script
   --dry-run` clean, hand-traced the ambiguity fix for ASML/TSMC/NRC/IBM/
   SAP/VK, and a live browser pass (real signup, footer/legal pages, and
   confirmed `/app/leaderboard` no longer resolves to any route).

**What that verification pass could NOT confirm, and why:** creating a
company and running a live scan requires a Netlify Function to reach Neon
Postgres, and the sandboxed shell this session ran in can't complete that
outbound connection (confirmed environment-level, not a code bug — `curl`
reaches the same Neon host fine; Node's own fetch from the same container
times out). **The actual "does a short-name brand score correctly now"
scan has not been run live yet.** Do that first, on the real deployed site
or Marc's own machine, before treating Milestone A as fully proven — the
code fix is verified by direct trace + build, not by a live scan result.

**Deliberately not attempted this round** (see `PLAN_NEXT_PHASE.md` for
full reasoning): Milestone F's semantic/sentiment citation judge (needs a
calibration pass, shouldn't be rushed), Milestone C's model expansion
(needs one-at-a-time live smoke-testing per this file's own 2026-08-09
entry's lesson), Milestone E/G (monetization — gated on Marc's manual
€499 outbound sales test, Milestone E0, actually landing a payment first).

**Immediate next steps:**
1. Run one real scan against a short-name brand (ASML/TSMC/NRC) on the
   deployed site to confirm Milestone A1's fix live, not just by trace.
2. Milestone E0 (sales task, not engineering): hand-run scans for 3-5 real
   prospects, send the report, ask for €499 via a plain Stripe Payment
   Link. Do this in parallel with more engineering, not after.
3. Pick up Milestone C (more models) one candidate at a time once A is
   confirmed live.

### STATUS 2026-08-09: Scan coverage + reliability + check-by-check UI — PR open, not yet merged (superseded: merged since, see 2026-08-12 entry above)

**Where things stand:** all work is on branch `claude/url-brand-checks-analysis-e7hwc4`,
already pushed, with **open PR https://github.com/dizid/ai-business-score/pull/2**
(base `master`). CI (Netlify's redirect/header/pages checks) is green, deploy
preview is live at `https://deploy-preview-2--aivis-scan.netlify.app`, no
unresolved review comments, `mergeable_state: clean`. **Not merged yet —
that's a deliberate pause, not a blocker**: the PR is fully working, just
waiting on the user to review/test before merging. To resume from a fresh
session (this one resumed, or a new one on another machine): `git fetch
origin claude/url-brand-checks-analysis-e7hwc4 && git checkout
claude/url-brand-checks-analysis-e7hwc4`, then read this entry, `WISH_LIST.md`,
and PR #2's description/comments for full context — a fresh session has none
of this conversation's memory otherwise.

**What shipped on this branch, in order (5 commits):**
1. Check-by-check breakdown in `ScanDetail.vue` — every completed call now
   shown grouped by prompt template with a per-model outcome badge
   (mentioned-first/beaten/not-mentioned) and expandable raw text, replacing
   the old flat "Raw AI responses" dump. `PROMPT_LABELS` exported from
   `aivis-core.mjs` for this (shared with deep-advice grounding).
2. `PROMPT_TEMPLATES` grew from 8 to 10 (added a criteria-based and a
   switcher-intent prompt) and the hosted site switched from running just
   the first 3 to the full set — a live user's feedback that the original
   3-prompt subset read as too generic.
3. `MODELS` briefly grew from 2 to 6, then was **reverted back to 2**
   same day: the 4 additions were sourced from a web search of Perplexity's
   changelog (never live-verified — `docs.perplexity.ai` is unreachable
   through this network's egress policy), and combined with the 10-prompt
   expansion pushed one scan to 60 concurrent calls, which the same user
   flagged as a real risk before it ever ran for real.
4. Added real safeguards for the resulting call volume: a concurrency-
   limited worker pool (`runWithConcurrency`, limit 10, replacing a bare
   `Promise.all`), a hard scan-wide deadline (`SCAN_DEADLINE_MS`, 100s, one
   shared `AbortController`) so a straggler can't drag the whole scan out
   the way it could before, and `callModelWithRetry` dropped from 3 attempts
   to 2 with a 1s backoff between them.
5. Corrected two stale doc claims in `CLAUDE.md`/`TODOS.md` — both said
   `enrich.mts`'s URL auto-fill wasn't wired into the "create company" form;
   it already was (shipped earlier in `dd95291`, already on `master`). Caught
   by checking the actual code before re-doing already-done work.

**Verified each step:** `npm run type-check`, `proof-script --dry-run`
(confirms the real call count — 20 now, was 6), full `npm run build`, a
standalone script exercising `runWithConcurrency`'s concurrency cap plus
`callModelWithRetry`'s backoff timing and pre-aborted-signal short-circuit
against a mocked `fetch`, and a Playwright screenshot of the rendered
check-by-check UI in dark mode. Never ran a real scan against production
Perplexity — that still needs doing before fully trusting the 20-call
volume and the 2 live-verified models in practice.

**Two things found while testing PR #2's deploy preview that are NOT
regressions from this branch** (pre-existing gaps, now in `WISH_LIST.md`
items #6-7): sign-up/login fails with "Invalid origin" on any PR preview
URL because Neon Auth's `trusted_origins` only lists production — expected
behavior given the config, not new breakage, and the "Chrome forgot my
password" symptom was the same root cause (different origin, no saved
credentials for it). No password-reset flow exists anywhere in the app
(confirmed by reading the code, not just missing UI). **Both need Neon
console access to fix — no Neon MCP connector is available to attach in
this session; try from an interactive session (`claude mcp`) or the Neon
console directly.** Production login (`https://aivis-scan.netlify.app`)
was never confirmed broken — only the preview URL was tested.

**Immediate next steps, in likely order:**
1. Test this PR's actual changes (the scan itself, check-by-check UI) via
   production login, since preview-URL auth is a known dead end.
2. Merge PR #2 once satisfied.
3. Run one real scan in production to confirm the 20-call volume behaves
   as designed (verifies `WISH_LIST.md` item #5's open question).
4. Pick up whichever `WISH_LIST.md` item matters most — #1 (persisting
   failed-call detail) is flagged there as the one that makes several of
   the others faster to iterate on.

**Full backlog of deferred ideas:** see `WISH_LIST.md` — not duplicated
here since it's the dedicated place for this, per the user's request this
session to stop losing ideas to chat scrollback.

### STATUS 2026-08-09: `NEXT-STEPS.md` GTM resume-point — folded in here 2026-08-27, mostly superseded

**Retired as a standalone file during the 2026-08-27 markdown consolidation
pass** — every point it made was already marked superseded in-line by later
dates, pointing back at this file and `PLAN_NEXT_PHASE.md`. Kept here only
for the two facts that are still true and not written down elsewhere:

- **Cold outreach never actually ran.** `proof-script/prospects.json` was
  never created (only `prospects.example.json` exists) — zero real
  prospects qualified, zero emails sent, as of 2026-08-09. Unknown whether
  this has changed since; check `proof-script/tracking.csv` before assuming
  either way.
- **Open risk, never explicitly marked resolved:** the CEO said on
  2026-08-09 he was "not happy at all" with Site Improver's delivered
  results ("mediocre at best"). This mattered because the outreach sequence
  in `proof-script/OUTREACH.md` was written to close on Site Improver. That
  close target has since moved — `TODO-MARKETING.md`'s 2026-08-24 entry
  says outreach is now planned to close on Foreground itself (Pro/$19
  scan) instead, partly *because* of this unresolved quality concern — but
  `OUTREACH.md` itself hasn't been rewritten yet, and the underlying Site
  Improver quality question was never revisited or closed out.

### STATUS 2026-08-03: SaaS pivot (auth, Neon Postgres, async scans, deep advice, progress chart) — SHIPPED, verified in production

The CEO reviewed an external draft plan proposing user accounts, a real
database, async scans, and progress-over-time dashboards, and confirmed this
was a deliberate pivot from "single-operator internal tool" to a self-serve
multi-tenant SaaS — not scope creep (see memory `aivis-saas-pivot-2026-08-03`).
Executed as 8 checkpointed milestones (plan file:
`~/.claude/plans/cheerful-leaping-dragon.md`), each built, deployed, and
verified live (curl + a real headless browser via the `browse` skill) before
starting the next. `CLAUDE.md`'s Architecture section now describes the
result in full; this entry is the shipping log.

**What shipped, in order:**
1. Confirmed Netlify Background Functions actually work on this site's plan
   (`nf_team_dev`) via a throwaway spike before committing the async-scan
   design to it — 202 in 0.47s, background work observably completed ~5s
   later. Also fixed a real gap: `netlify/functions/*.mts` was never covered
   by `npm run type-check` (`tsconfig.json`'s `include` was `src/**` only).
2. Provisioned a new Neon project (`square-snow-36406551`) + Neon Auth
   (Better Auth) + initial schema (`user_profiles`/`companies`/`scans`) —
   Neon MCP wasn't authorized when Blobs was chosen back on 2026-07-29; it
   is now.
3. Replaced `SCAN_PASSPHRASE` with Neon Auth JWT verification on
   `history.mts`/`enrich.mts` first (backend-only, curl-verified before any
   frontend existed).
4. One-off backfill of the pre-pivot `aivis-scans` Blobs store into
   Postgres (4/4 records imported, idempotent, `is_legacy_import=true`) —
   run against a throwaway test account; **still needs re-running against
   whichever account the CEO actually uses**, see `backfill-legacy-scans.mts`.
5. Built the authenticated app shell: `app.html` + `vue-router` SPA
   (`src/app/`), login/signup, companies list/detail, `companies.mts`/
   `company.mts` endpoints. Verified end-to-end in a real browser: signup,
   session persistence across reload, company creation, deep-link auth-guard
   redirect preservation, sign-out.
6. Rewrote `/scan` for async execution (Background Function + status
   polling), retired `index.html`/`history.html` and the now-redundant
   `history.mts` — the native-form-POST mechanism those pages depended on
   is gone along with them. `result.html` is untouched, stays up
   indefinitely. Verified live: 202 in 0.9s, `pending → running →
   completed` over ~21s with real Perplexity calls.
7. Added on-demand deep advice (`buildDeepAdvicePrompt`/
   `parseDeepAdviceResponse` in `aivis-core.mjs`, additive-only —
   `proof-script --dry-run` re-verified clean) — a "Generate deeper advice"
   button, not automatic, since it doubles Perplexity spend per scan and
   pricing isn't decided yet.
8. Added `CompanyProgressChart.vue` (hand-rolled SVG, dataviz-skill
   guidance) — caught and fixed a real edge-clipping bug on the date labels
   by screenshotting the live rendered chart, not just reading the code.
   Cleaned up: removed `SCAN_PASSPHRASE` from Netlify env vars (confirmed
   zero remaining code references first) and the temporary `db-health.mts`
   verification function; docs updated.

**Open follow-ups, not yet done:**
- Re-run `backfill-legacy-scans.mts` against the CEO's real production
  login once they have one (it currently only has the throwaway test
  account's 4 imported scans).
- ~~`enrich.mts`'s URL auto-fill isn't wired into the new app shell's
  "create company" form yet~~ — done as part of the "URL-first onboarding"
  work (see `dd95291`, already on `master`): `CompaniesListView.vue`'s
  create form is now URL-first with an editable enrichment pre-fill. This
  bullet sat stale in both `TODOS.md` and `CLAUDE.md` after that shipped —
  caught 2026-08-09 when about to re-do it from the stale description
  instead of checking the actual code first.
- Pricing/plan-tier gating for deep advice is unresolved — `plan_tier`
  column exists on `user_profiles` for this, unused so far.
- No pagination anywhere yet (`/history`-equivalent queries cap at
  `LIMIT 50`) — fine at current volume, revisit if it changes.

### STATUS 2026-08-02: Vite + TypeScript + Vue migration for `web/` — SHIPPED, verified in production

Merged `vite-vue-migration` into `master` (fast-forward, `7005ae2`) and
confirmed the site is live on the new build.

The Netlify site (`aivis-scan`) turned out to already be Git-linked to
`dizid/ai-business-score`, but its build settings had base directory `/`
with no build command/publish directory set — it had no way to find
`web/netlify.toml`, since the repo root never had one (the site was always
deployed via manual `dist` upload before). Fixed by adding a one-line root
`netlify.toml` (`[build]\n  base = "web"`) — Netlify's documented monorepo
pattern: it cd's into `web/` and picks up the existing config there, so
nothing needed to change inside `web/netlify.toml` itself.

**Auto-deploy root cause, found and fixed:** two pushes to `master` right
after linking didn't trigger a build — `currentDeploy` never moved. Root
cause was a **duplicate Netlify project**: `ai-score11` (same team, zero env
vars set) was the one actually receiving the GitHub webhook for this repo,
not `aivis-scan` (which has the real `PERPLEXITY_API_KEY`/`SCAN_PASSPHRASE`).
Confirmed by checking `ai-score11`'s deploy history directly — it had
silently auto-built the `netlify.toml` fix commit while `aivis-scan` sat
idle. Any `/scan` on `ai-score11` would have 500'd on the missing API key
before ever touching Blobs, so deleting it was safe (no data at risk).
Fixed by: deleting `ai-score11` in the dashboard, then unlinking and
re-linking the GitHub repo on `aivis-scan`'s own Build & deploy settings
(deleting the duplicate alone did *not* auto-transfer the webhook — a fresh
link was still required). Verified with two trivial commits: the first
(pre-relink) still didn't trigger a build; the second, after re-linking,
deployed automatically in 14s (`deploy 6a6f1c7ace942b0008a3061a`, correct
commit ref, `master--aivis-scan.netlify.app` branch subdomain). Auto-deploy
on push is now confirmed working end-to-end — no more manual `deploy-site`
calls needed for `web/` changes.

Verified for real in production (not just deployed):
- `https://aivis-scan.netlify.app/` serves the new Vite-built `index.html`
  (hashed `/assets/*` bundle, not the old inline-`<style>` vanilla page).
- Ran one real `/scan` (brand "Acme Plumbing", the same example already used
  as UI placeholder text) — 3 of 6 Perplexity calls completed within the 20s
  timeout (3 timed out, consistent with documented real-world variance), got
  a valid 302 redirect with a correctly-shaped payload (score 0, `advice:
  zero-citations`).
- Loaded the resulting `/result.html#d=...` in a real headless browser: score
  ring, "3 of 6 checks failed" warning banner, scoreboard bars, and the
  red-bordered "Priority" advice card all rendered correctly, zero console
  errors.
- Confirmed the scan appears in `/history` (`POST /history` with the
  passphrase) with the correct brand/score, sorted newest-first alongside
  two earlier scans.

### STATUS 2026-07-29 (superseded above): Vite + TypeScript + Vue migration for `web/` — DONE locally, not yet deployed

Rewrote `web/` on branch `vite-vue-migration` per the (corrected)
`MIGRATION.md` plan: added a real build pipeline (Vite, TypeScript,
`vue-tsc`, Tailwind v4) and ported `index.html`/`result.html`/`history.html`
in full to Vue 3 (`web/src/{index,result,history}/App.vue`), each its own
Vite multi-page entry (not a Vue-Router SPA — preserves the native
`<form method=POST action=/scan>` redirect-fragment mechanism). No
placeholder window: all three pages have full parity with the pre-migration
vanilla-JS versions.

Key decisions (see `git log` around this date for the deleted `MIGRATION.md`'s full reasoning): `web/shared/
aivis-core.mjs` stays untouched/unmoved/untyped (proof-script's plain
`node index.mjs` has no way to load a `.ts` file); `@netlify/blobs` kept at
`^8.2.0` (not downgraded); Tailwind v4 CSS-first (`@theme`-style palette in
`web/src/shared/theme.css`, no `tailwind.config.js`); `netlify.toml` now sets
`command = "npm run build"` + `publish = "dist"` and keeps `node_bundler =
"esbuild"`.

Verified locally: `npm run type-check` clean, `npm run build` produces
`web/dist` with all 3 HTML entries, `npm run dev` walked all three pages in
a real headless browser (index step1→step2 native-form check, result.html
rendered from a synthetic `#d=` payload — score ring/scoreboard/advice cards
all matched the pre-migration design, history.html's wrong-passphrase path).
Did not run a live `/scan` (would spend real Perplexity budget) — that's the
one thing still unverified end-to-end.

**Open follow-ups, not yet done:**
- **Not deployed.** Netlify CI builds require the site to be linked to this
  git repo (or a deploy hook) — currently still deploying via the old manual
  `deploy-site` MCP upload. That link-up is a Netlify dashboard step, not
  something scriptable from here without interactive auth.
- Once linked and deployed, do one real `/scan` smoke test in production
  before considering this fully shipped.
- `CLAUDE.md` was updated to describe the new build/deploy reality in the
  same session.

### STATUS 2026-07-29: friction-reduction ship (auto-fill + persistence) — DONE, deployed, verified

Shipped and live on `aivis-scan` (deploy `6a69cf5f59838159b734e2c5`):
`web/netlify/functions/enrich.mts` (URL → guessed fields), `index.html`
two-step form (URL first, editable pre-fill, "skip" escape hatch),
`scan.mts` now writes every result to a Netlify Blobs store `aivis-scans`,
and `netlify/functions/history.mts` + `history.html` list them. Full
architecture detail is in the repo's `CLAUDE.md` (updated same session).

Verified for real (not just deployed): `/enrich` on `netlify.com` returned
sane guessed fields; a full `/scan` run 302-redirected correctly and the
scan showed up in `/history` with the right score/link; step-1 → step-2 UI
transition checked in a real headless browser (no console errors). Not yet
screenshot-checked visually end-to-end (session ended mid-verification —
the remaining unchecked step was just a visual screenshot pass over
`history.html` and the linked `result.html`, not core functionality).

**Open follow-ups, not yet done:**
- No delete/expiry on `aivis-scans` Blobs entries — will grow unbounded.
  Fine at current (manual, low-volume) usage; revisit if that changes.
- Netlify Blobs was used instead of Neon Postgres (this project's usual DB
  default) only because the Neon MCP server needed an interactive OAuth
  authorization that wasn't available in that session. Revisit once Neon is
  authorized if the data model outgrows a flat key-value store — see the
  memory note `aivis-autofill-and-history-2026-07-29` for the full reasoning.
- `SCAN_PASSPHRASE` / `PERPLEXITY_API_KEY` are stored as non-secret Netlify
  env vars on this site (retrievable via the Netlify MCP env-var reader) —
  intentional, not an oversight, so future sessions don't need to ask the
  user to re-paste them.

### Add vertical-adjusted prompt templating to AIVis proof script

**What:** Extend the 8 hardcoded prompts in the manual-proof script (see design doc
`~/.gstack/projects/ai-business-score/marc-none-no-git-repo-design-20260728-153615.md`)
to substitute vertical-specific phrasing per prospect category, instead of fully
generic brand/competitor substitution.

**Why:** Generic prompts ("What's the best [category] for [use case]?") may produce
noisier or less realistic AI responses than a real user in that vertical would
actually ask. Vertical templating should make the "cited/not cited" signal more
representative.

**Pros:** More realistic prompts → more trustworthy citation counts → stronger cold
email claims.

**Cons:** Adds real complexity (a templating system, per-vertical prompt variants)
to what's currently a same-day, single-file script. Premature if the generic
version already produces convincing results.

**Context:** Deferred twice — first during the `/office-hours` design session
(explicit decision: "start with fully generic prompts... add vertical adjustment
only if generic prompts prove too noisy in practice"), then confirmed during
`/plan-eng-review`. Not a bug or gap, a deliberate MVP scope cut. Pick this up only
if a real run shows the generic prompts producing unconvincing/unrealistic AI
responses.

**Depends on / blocked by:** The manual-proof script (Approach A) must actually run
first — this is a response to observed noise, not a pre-emptive build.
