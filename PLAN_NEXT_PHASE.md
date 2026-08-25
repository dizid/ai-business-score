# AIVis — Next Phase: Reliability, Model Coverage, Product Depth & Monetization

## Status (updated 2026-08-13)

| Milestone | Status |
|---|---|
| A — Correctness & trust | **Shipped**, pushed to `master` (`8af2803`). Live scan not yet re-verified due to a sandbox network limitation during testing — see `TODOS.md`'s 2026-08-12 entry. |
| B — Remove leaderboard + multi-URL | **Shipped**, pushed to `master`. |
| C — More models, speed, locale-aware prompts | **C1/C2 shipped 2026-08-13**, confirmed live in production 2026-08-14 via a real end-to-end scan — but that same live scan found a new cascading-timeout reliability gap (15/20 calls lost on one scan), not yet fixed. See `TODOS.md`'s 2026-08-14 entry and Milestone C below. C3 (locale-aware prompts) not started. |
| D — Product depth & trust surfaces | **D3 (footer/legal) and D4 (technical SEO) shipped.** D1 (raw data — likely already satisfied by A3, needs Marc's confirmation) and D2 (competitor click-through) not started. |
| F — Differentiation | **Both picks shipped** (row updated 2026-08-20). Citation-URL attribution shipped 2026-08-15 (Milestone F1). Sentiment-aware judge shipped 2026-08-15 as on-demand-only, then extended 2026-08-20 to auto-run on every scan — see `shared/CLAUDE.md`'s "Sentiment judge" entry for the full history. |
| E — Monetization | **Superseded 2026-08-24** by `~/.claude/plans/we-need-alot-of-transient-floyd.md` — Marc explicitly waived E0 (the manual sales test below never ran) and decided pricing directly ($199/mo Pro, $19 one-time scan) instead. Deep-advice gating (E2/E3 below) and a one-time purchase SKU (E1, though shaped as a $19 single-scan product, not the €499 report this section originally proposed) both shipped 2026-08-24 — see `TODOS.md`'s entry that date. E4 ("book a call" CTA) not built. |
| G — Growth loop | Not started. No longer strictly gated on E0 (waived), but still sensibly gated on a first *real* payment — and `STRIPE_SECRET_KEY` is a test-mode key as of 2026-08-24 (see root `CLAUDE.md`), so no real payment can land yet regardless. |

## Context

Marc reviewed the live app on his phone across 15 annotated screenshots and a
list of typed notes (mixed Dutch/English). The core finding: **the app is
giving wrong answers**. Real, well-known brands (ASML, TSMC) are scoring
`0/100 — Invisible` and NRC (a national newspaper) shows the same, which
undermines trust in the product's entire premise before any of the requested
feature work matters. On top of that, Marc wants to cut scope (leaderboard,
multi-URL — both fully shipped features he now considers unneeded), grow
model coverage, make prompts locale-aware, add missing trust surfaces (raw
data, footer/legal), and turn "deeper advice" — which he considers the real
product — into a paid, sales-assisted offering instead of a free button.

This plan was written after three parallel deep-dive explorations of the
codebase (detection/scan pipeline, leaderboard/multi-URL/raw-data, billing/SEO)
and direct reading of the critical files. All line numbers below were
confirmed against the current `master` (commit `5f47127`, working tree clean).

Three product forks were resolved with Marc before writing this plan (see
"Decisions locked in" below): keep the subscription and add a one-time report
SKU alongside it; keep the Perplexity gateway and add more models through it
rather than building direct-provider integrations this phase; and gate deep
advice behind payment with a "book a call" CTA underneath.

## Competitive landscape (found during an office-hours strategy pass)

AIVis is not entering an empty category. Profound (~$99+/mo, 10+ engines,
reportedly ~68% of Fortune-500 GEO/AI-search-optimization spend), Otterly
($29/mo, SMB-focused), Peec AI (+347% YoY), Rankscale (17+ engines), plus
Scrunch/Ayzeo/RankScope, are already live and growing in "AI visibility /
generative engine optimization" tooling. Matching them on model/engine
breadth isn't realistic on the single-Perplexity-gateway architecture this
phase deliberately keeps (see "Decisions locked in"). The viable wedge,
given a solo founder with no marketing team and an explicit refusal to run
personal social/outbound promotion: product-led simplicity and distribution
loops, not feature-count — see Milestones F and G below.

## Current state (short)

- **Architecture**: Vue 3 SPA (`app.html`) + Netlify Functions + Neon
  Postgres + Neon Auth, async scans via a Background Function. Single source
  of truth for prompts/models/detection/scoring is `shared/aivis-core.mjs`.
- **Scanning**: as of 2026-08-13 (Milestone C1/C2, see below), a 5-prompt
  slice of `PROMPT_TEMPLATES` × 4 models (`openai/gpt-5-mini`,
  `google/gemini-3-flash-preview`, `anthropic/claude-haiku-4-5`,
  `xai/grok-4.6`), all routed through Perplexity's Agent API, fully
  sequential (`CONCURRENCY_LIMIT = 1` — Perplexity's real per-key
  concurrency limit turned out to be ~1). ~5-8 min happy path, hard-capped
  at 10 min (`SCAN_DEADLINE_MS`). Was 10 prompts × 2 models, ~30-45s,
  100s-capped, before this milestone.
- **Enrichment ("Perplexity or scraped?" — screenshot 1)**: it's Perplexity,
  not scraping. `enrich.mts` makes one `web_search`-grounded Perplexity call
  (`openai/gpt-5-mini`) asking the model to research the URL — no HTML
  fetch/parse of the site itself happens anywhere in the app today.
- **Billing**: Stripe subscription is live — Free (1 company/3 scans total)
  vs Pro (unlimited companies, 20 scans/calendar-month fair-use with
  top-up packs available, **$199/month**, price set 2026-08-24 — see
  `TODOS.md`'s 2026-08-24 entry). A $19 one-time single-scan SKU (no
  account required) also shipped 2026-08-24. Deep advice **is now
  plan-gated** (since 2026-08-24) — requires Pro or a matching single-scan
  purchase, returning `402 {upgradeRequired: true}` otherwise.
- **Recently shipped, now unwanted**: a public opt-in leaderboard
  (`companies.is_public`, commit `1b0c7a9`) and multi-URL-per-company
  tracking (`company_urls` table, commit `dd95291`). Both fully committed
  and live, not WIP.
- **Known-good, reused patterns**: the 402 `{error, upgradeRequired, limit}`
  shape (`scan.mts`, `companies.mts`) that the frontend already knows how to
  render as an upgrade CTA; `callModelWithRetry` with shared deadline/abort
  in `run-scan-background.mts`; the `isPro(planTier)` / `FREE_PLAN_*`
  helpers in `_shared/plan.mts`.

## Goals

1. Make scores trustworthy — stop falsely flagging real brands invisible,
   record *why* checks fail instead of hiding it, persist everything a paid
   scan produces (cost accountability).
2. Cut shipped-but-unwanted scope (leaderboard, multi-URL) to simplify the
   product surface.
3. Grow model coverage and speed within the existing Perplexity-gateway
   architecture; make prompts reflect the brand's actual language/market.
4. Deepen the product's value: better competitor insight, a real raw-data
   view, a footer with legal pages, tightened technical SEO.
5. Monetize the actual insight: paid deep advice + a one-time report SKU,
   with a sales-assisted "book a call" path underneath — without breaking
   the subscription that's already shipped.

## Key user flows (current → proposed)

**Create company → first scan.** Today: `onCreate()` in
`CompaniesListView.vue` posts to `/companies` and just closes the create
form, dropping the user back on a list where a brand-new, never-scanned
company shows the same bare `0` a real zero-score brand would show
(screenshot: "no data" for one company but literal `0` for another, no
visual distinction, annotated "DO FIRST SCAN!"). Proposed: after creation,
navigate straight to the new company's detail view and auto-trigger the
first scan (reuse the existing `runNewScan()` logic in
`CompanyDetailView.vue`), so a company is never left in an ambiguous
zero-vs-no-data state.

**Run a scan.** Today: `POST /scan` → pending row → background trigger →
frontend polls every 2s; a network blip during polling permanently abandons
polling (no retry), and any hiccup before the 202 response can surface as a
raw, unstyled `TypeError: Failed to fetch`. Proposed: same architecture, but
`pollScan` retries transient failures a few times before giving up, and
enrichment (a smaller, related flow with the same failure shape — "Couldn't
auto-fill from that URL") gets the same retry treatment already used for
scan calls.

**Deep advice.** Today: any authenticated owner of a completed scan can
click "Generate deeper advice" for free, unlimited times. Proposed: the
button becomes gated — unlocked for Pro subscribers *or* buyers of the
new one-time report for that company; when not entitled, the CTA becomes
"Buy this report" (or "Upgrade to Pro"), reusing the existing
upgrade-required 402 pattern. Directly beneath the (now-gated) advice
content, a persistent "Want us to execute this for you? Book a free
strategy call" link is always shown, regardless of entitlement — the
sales-assisted path Marc described.

## Decisions locked in

| Question | Decision |
|---|---|
| Pricing model | Keep the existing Free/Pro subscription as-is. Add a **new, separate one-time "Full AI Visibility Report" purchase** (Stripe Checkout `mode: payment`) rather than replacing the subscription. |
| Model architecture | Stay on the Perplexity gateway this phase. Grow `MODELS` by adding candidates **one at a time, each live-smoke-tested** before trusting it (same discipline the code comment already documents from the 2026-08-09 revert) — no direct-provider integration work yet. |
| Deep advice monetization | Paid unlock (Pro plan **or** report purchase) + a permanent "book a call" CTA underneath, for the higher-ticket done-for-you path. |

## Root causes confirmed (feeds Milestone A)

| Symptom (screenshot) | Root cause | File |
|---|---|---|
| ASML, TSMC, NRC score `0/100 — Invisible`, "brand name is a common word" | `isAmbiguousBrandName()` flags **any** single-word name **≤4 characters**, unconditionally — not an actual common-word check. ASML/TSMC/NRC/VK/IBM/SAP all get skipped. | `shared/aivis-core.mjs:67-70` |
| "5 additional checks failed... which specific prompt/model failed isn't currently recorded" | This detail **used to exist** (commit `522eb63`) and was accidentally deleted the next day during an unrelated "flatten repo" refactor (`74afa41`) — a restoration, not new design work. | `shared/aivis-core.mjs` (`aggregateProspect`), `run-scan-background.mts:150-164` |
| NRC scan: competitor "VK" reads as mentioned in prose but tally shows 0 | `isAmbiguousBrandName("VK")` is `true` in **both** roles under current code — own-brand gets a domain-alias fallback (`findBrandMention`), competitors get no fallback and no visibility flag when skipped, so an ambiguous competitor silently looks identical to "never mentioned." Needs verifying against the live `companies.competitors` value for NRC, since Milestone A1's fix may resolve this on its own. | `shared/aivis-core.mjs:99-118`, `aggregateProspect` competitor loop |
| "Run new scan" → "Failed to fetch" (NRC, TSMC, Google LLC) | `scan.mts` has no timeouts on its sequential auth/DB/trigger calls; if they stack past Netlify's execution ceiling for a regular (non-Background) function, the connection is torn down before any JSON response — the browser reports the raw `TypeError: Failed to fetch`. `pollScan` has no retry, so one transient blip abandons polling permanently. No function sets CORS headers, a second latent failure mode. | `netlify/functions/scan.mts`, `src/app/views/CompanyDetailView.vue` (`pollScan`) |
| Apple scan: two advice cards both titled "ALSO WORTH NOTING" | Generic reused heading in `selectAdvice`, not a data bug — worth a quick copy fix so distinct insights don't look duplicated. | `shared/aivis-core.mjs` (`selectAdvice`) |
| "Couldn't auto-fill from that URL" | `enrich.mts` uses a single non-retried `callModel()` call (20s timeout) — one transient timeout surfaces immediately as a user-visible failure, unlike scans which already use `callModelWithRetry`. | `netlify/functions/enrich.mts:66` |

## Milestones

Execute in order A → B → C → D → F → E → G; each is an independent,
reviewable checkpoint (per house rule: small batches, verify before moving
on). `npm run build` + `npm run type-check` after every batch; `node
proof-script/index.mjs --dry-run` after any `shared/aivis-core.mjs` change;
a real scan against a short-name brand (ASML/TSMC/NRC) after Milestone A to
confirm the fix actually changes output, not just passes type-checking.

### Milestone A — Correctness & trust (do first) — ✅ SHIPPED 2026-08-12

1. **Fix the ambiguity heuristic** (`shared/aivis-core.mjs:67-70`): remove
   the `words[0].length <= 4` clause entirely; ambiguity should come only
   from `COMMON_WORD_STOPLIST` membership. This alone fixes ASML/TSMC/NRC/
   IBM/SAP false zeroes. Keep genuinely short 1-2 char tokens (e.g. "VK")
   on a case-by-case footing — they're legitimately regex-risky — but don't
   blanket-catch every 3-4 letter acronym.
2. **Give competitor-skip visibility**: in `aggregateProspect`'s competitor
   loop, set a per-competitor `ambiguous` flag when `findMentions` returns
   ambiguous, instead of silently leaving the tally at 0 indistinguishable
   from "not mentioned." Surface it in `ScanDetail.vue`'s scoreboard.
3. **Resurrect per-call failure detail**: add a `failures jsonb` column to
   `scans` (Neon MCP migration: `prepare_database_migration` → verify on
   temp branch → `complete_database_migration`, additive/nullable, no
   backfill needed). `aggregateProspect` returns
   `failures: failed.map(r => ({ model, promptIndex, error: String(r.error).slice(0,300) }))`
   — same shape as the original `522eb63` implementation. Thread it through
   `run-scan-background.mts`'s final `UPDATE`, `_shared/scanRow.mts`, and
   `src/shared/scanPayload.ts`. Render it in `ScanDetail.vue` in place of the
   current "isn't currently recorded" note.
4. **Persist token usage per scan**: `aggregateProspect` already computes
   `totalTokens` but drops it before it reaches the DB. Add a
   `total_tokens` column (same migration as #3) so Marc can compute true
   per-scan cost directly via Neon MCP — this is for his own querying, not
   a UI feature, and directly informs whether the report price ($299-499)
   is set correctly.
5. **Harden against "Failed to fetch"**: make `pollScan`
   (`CompanyDetailView.vue`) retry a transient fetch failure 2-3 times with
   a short backoff before giving up, instead of aborting polling on the
   first network blip. Switch `enrich.mts` from bare `callModel()` to the
   existing `callModelWithRetry` helper (already used by
   `run-scan-background.mts`) so one timeout doesn't immediately read as
   "Couldn't auto-fill." Add basic CORS/OPTIONS handling across functions
   as defensive hardening against the same failure class. Optional
   follow-up if Perplexity-based enrichment keeps failing often even after
   retry: add a last-resort fallback that fetches the page's own `<title>`/
   meta description directly (real scraping, one plain HTTP GET, no LLM)
   to at least pre-fill `brand`/a guessed `category` instead of dropping to
   a fully blank form — only worth building if retry alone doesn't fix the
   failure rate.
6. **Differentiate advice-card headings** in `selectAdvice` so multiple
   distinct insights don't both render as "ALSO WORTH NOTING."
7. **Fix the create-company flow**: after `POST /companies` succeeds,
   navigate to the new company's detail view and auto-trigger the first
   scan, so users never see a bare, ambiguous `0` for an unscanned company.

### Milestone B — Remove leaderboard + multi-URL — ✅ SHIPPED 2026-08-12

Both are fully committed, live features — this is deletion, not abandoning
WIP. Leave the underlying DB columns/tables in place (unused, harmless)
rather than a destructive live migration, unless Marc separately asks for
full cleanup.

1. **Leaderboard**: delete `netlify/functions/leaderboard.mts` and
   `src/app/views/LeaderboardView.vue` entirely. Remove the `/app/leaderboard`
   route (`src/app/router.ts:21-27`), the `is_public` insert
   (`companies.mts:97-107`), the whole `PATCH` handler in `company.mts`
   (`:10, 28-57`, added solely for this), and every `is_public`/leaderboard
   reference in `CompaniesListView.vue` (interface field, form state, nav
   link `:200`, checkbox `:246-249`) and `CompanyDetailView.vue` (interface
   field `:21`, `togglePublic()` `:178-200`, toggle button `:307-310`, CSS).
2. **Multi-URL**: delete `netlify/functions/company-urls.mts`; remove the
   `company_urls` INSERT in `companies.mts` (`:112-120`) and the `urls`
   field in `company.mts`'s GET response; revert `scan.mts`'s `url_id`
   resolution (`:78-100`) back to always using `company.website` directly;
   strip the URL-chip selector, "+ Add URL" form, and `filteredScans`
   logic from `CompanyDetailView.vue`.
3. Update CLAUDE.md's Database schema section so it doesn't re-drift once
   these features are gone from the UI but their columns remain.

### Milestone C — More models, speed, locale-aware prompts — C1/C2 ✅ SHIPPED 2026-08-13, verified live 2026-08-14 (found a new gap, unfixed), C3 not started

**2026-08-14 live verification:** a real end-to-end scan (ASML, via a
throwaway test account) confirmed the score/detection/email pieces below
all work correctly in production, but also lost 15 of 20 calls to a
cascading "scan deadline exceeded" — two `google/gemini-3-flash-preview`
calls each burned their full retry budget (~182s worst case each) under
`CONCURRENCY_LIMIT=1`, leaving no time for the 13 calls still queued
behind them. Two other same-day scans (NRC, De Nara Hotel) lost only 3-4/20
each, so this is a worse-than-typical outlier, not the norm — but it's a
real, reproducible failure mode inherent to fully-sequential execution
with per-call retries this expensive. Full root-cause writeup and fix
candidates: `TODOS.md`'s 2026-08-14 entry. Deliberately not fixed yet —
Marc's call, logged for later prioritization rather than fixed inline.

1. **✅ Shipped.** Grew `MODELS` from 2 to 4, one candidate at a time, each
   live-smoke-tested against a real Perplexity call before being trusted —
   `anthropic/claude-haiku-4-5` and `xai/grok-4.6` added (see
   `shared/aivis-core.mjs`'s `MODELS` comment for the full writeup,
   including the Anthropic `max_output_tokens` fix that was needed).
2. **✅ Shipped, but not the way this item originally proposed** ("Scanning...
   too long" — screenshot 14). ~~Check Perplexity's actual per-key rate
   limit (not just guess) and raise `CONCURRENCY_LIMIT` toward 20 if it
   tolerates that~~ — **this guidance was wrong.** It was written before any
   empirical test; the actual check (done as part of C1's smoke-testing,
   2026-08-13) found Perplexity's real per-key concurrency limit is ~1, not
   20 or even the 4 that was live in production at the time — bursts of
   2-4 concurrent calls, across any provider mix, failed 50-83% of the time
   with HTTP 429, while fully sequential calls succeeded 100%.
   `CONCURRENCY_LIMIT` is now `1`. The "slimmer prompt set for quick/tracked
   scans" fallback this item already anticipated *did* end up being needed,
   just for a different reason (sequential-only means calls-in-scan is the
   direct latency knob, not concurrency) — the hosted site now runs a
   5-prompt slice (20 calls, 4 models) instead of the full 10 (which would
   have been 40 calls, ~13 min sequential); `proof-script` still runs the
   full 10. Net effect: scans now take 5-8 minutes, up from 30-45 seconds —
   slower in raw terms, but the old speed was partly an illusion built on
   top of a large fraction of calls silently failing. A scan-complete
   notification (so a user isn't stuck watching a multi-minute scan) is
   identified as necessary follow-up, not yet built.
3. **Locale-aware prompts**: capture a `language` field at
   enrichment/company-creation time (extend `buildEnrichPrompt` to infer
   it too). Maintain a small set of parallel-translated `PROMPT_TEMPLATES`
   for the languages Marc's customers actually need (start with Dutch +
   English fallback, expand as needed) rather than a live translation call
   per scan — keeps cost/latency down and lets the wording be reviewed for
   quality since these are real queries sent to grounded search.

### Milestone D — Product depth & trust surfaces — D3/D4 ✅ SHIPPED 2026-08-12, D1/D2 not started

1. **Raw data**: Milestone A3 already restores per-prompt/per-model failure
   detail; combined with the existing "check-by-check" `<details>` UI
   (already per-prompt, per-model, full raw text — confirmed in
   `ScanDetail.vue:221-244`), this likely satisfies "I would still like to
   see that." Confirm with Marc once shipped whether anything more (e.g. a
   JSON/CSV export) is wanted, rather than assuming more UI is needed.
2. **Competitor analysis depth**, including fixing the "numbers don't add
   up" confusion (screenshot 10, Apple scan: Samsung 12/13, Microsoft 3/13,
   Google 0/13, with "ranked first in 11, beaten in 2, not mentioned in 0"
   summarized separately). The tallies likely *are* internally consistent —
   the 2 checks where Apple was beaten are almost certainly 2 of Samsung's
   12 mentions — but nothing today lets a user verify that, which reads as
   the numbers not adding up. Fix: make each competitor's tally
   click-through to the specific prompts they appeared in (join
   `competitor_tallies` against `per_prompt_rank`/`raw_responses` by
   index), so "Samsung beat you 2x" links directly to *which* 2 of the 13
   checks. Also add a competitor-mention trend alongside the existing
   score-over-time chart, and surface a representative snippet from
   `raw_responses` near each competitor's mention so the user sees *why*
   that competitor got cited (echoes the deep-advice text that already
   says "worth understanding what makes them citable").
3. **Footer + legal pages**: add a shared footer once, inside
   `src/app/App.vue` (wraps every `/app/*` route already), and extend
   `index.html`'s existing bare-bones `<footer>` (currently just copyright +
   login/signup links). Links: Privacy Policy, Terms of Service, How this
   works, "Made by [Dizid](https://dizid.com)". Additional suggestions:
   a support/contact email, and a short data-handling note (relevant now
   that the app stores company data and takes payments). Simple static
   content, no DB — implement as plain routes in the existing Vue router
   unless "How this works" specifically needs to be crawlable (flag for
   Marc — defaulting to in-app routes for simplicity otherwise).
4. **Technical SEO** on `index.html`: add favicon/apple-touch-icon links
   and a `theme-color` meta tag (both currently absent); add the Pro price
   and the new report SKU to the JSON-LD `Offer` blocks once Milestone E's
   pricing is final (currently deliberately omitted); add sitemap.xml
   entries for any new crawlable pages from #3. `og:image` still needs an
   actual designed asset — flagged, not something this pass can produce.
   Everything else audited (canonical, OG/Twitter tags, robots.txt,
   llms.txt, noindex on `app.html`/`result.html`) is already in good shape.
   *Note: Marc mentioned "John's screenshot" of technical/schema notes that
   wasn't among the 15 images provided — if it has requirements beyond this
   audit, share it and it'll get folded in before this milestone ships.*

### Milestone F — Differentiation (before Milestone E0 — strengthens the report being tested) — ✅ SHIPPED 2026-08-15, extended 2026-08-20

An office-hours pass on this plan (see "Competitive landscape" above) found
the real gap: detection is presence-only regex, and Perplexity's responses
already carry citation data the app captures and throws away. Two picks
from that pass, both shipped:

1. **Citation-URL attribution** — ✅ shipped 2026-08-15. Perplexity's
   `web_search`-grounded responses return source citations; `aggregateProspect`
   now matches cited URLs against the scanned company's own domain into
   `ownSiteCitations`, surfaced in `ScanDetail.vue` as a "Your site, cited"
   section plus a per-check "Sources:" line. See `shared/CLAUDE.md`'s
   "Citation-URL attribution" entry.
2. **Semantic/sentiment-aware citation judge** — ✅ shipped 2026-08-15 as
   **on-demand-only** (a manual "Judge sentiment" button per check,
   calibrated against 5 hand-labeled examples, 5/5 agreement, before
   shipping). **Extended 2026-08-20**: `run-scan-background.mts` now
   auto-judges every mentioned check automatically right after the main
   20-call loop, bounded to whatever's left of `SCAN_DEADLINE_MS`; the
   manual button stays as the fallback for anything the auto-pass misses.
   `ScanDetail.vue`'s Overview tab shows a compact classification-count
   summary. See `shared/CLAUDE.md`'s "Sentiment judge" entry for the full
   history and reasoning (including why auto-judging was deliberately held
   back for 5 days after the manual version shipped).

Both shipped before Milestone E0: a report backed by page-specific,
sentiment-aware findings is a stronger thing to ask €499 for than a
regex-presence count, which directly raises the odds the manual validation
test converts.

*Considered, not selected this round*: a free no-signup single-check tool
(shareable score-card, top-of-funnel virality). Real idea, deliberately
deferred — no point building a growth-loop entry point before Milestone E0
proves anyone pays for what's behind it.

### Milestone G — Growth loop (after Milestone E0 shows at least one real payment) — not started

**Embeddable "AI Visibility Verified" badge**: once a company scores above
a threshold, offer an embed snippet linking back to its result page. This
is the leaderboard's original good idea (public proof, inbound backlinks)
without what got the leaderboard killed — no central directory to curate,
no per-company public/private toggle to maintain; each badge is a static
asset the site owner controls on their own page. Gated on E0 deliberately:
no point building a growth loop around a product nobody's paid for yet.

### Milestone E — Monetization — superseded 2026-08-24

**Update 2026-08-24**: this milestone's actual execution diverged from the
plan below in a few concrete ways, superseded by
`~/.claude/plans/we-need-alot-of-transient-floyd.md` — kept below as
historical record of the original reasoning, not current fact. What
actually shipped: E0 (the manual €499 sales test) was explicitly waived by
Marc rather than run; pricing was decided directly instead ($199/mo Pro,
$19 one-time scan, not the €499/$299 report figure hypothesized below); the
one-time SKU shipped as a $19 **single scan** (bundling deep advice for
that scan), not a separate "Full AI Visibility Report" product layered on
top of an already-completed scan; and E4 ("book a call" CTA) was not
built. E2 (gate deep advice) and E3 (frontend gating) shipped as described
below, mechanically accurate to what was built. See `TODOS.md`'s
2026-08-24 entry for the full shipping log.

**Guardrail — Pro fair-use cap. ✅ SHIPPED 2026-08-13, alongside Milestone
C1.** A CFO-style pass on this plan (not asked for, but worth flagging)
found that raw Perplexity API cost per scan was roughly $0.20-0.60 (20
calls, 2 models) — meaning a €499 one-time report has 99%+ gross margin,
and cost was not the real financial risk. The actual risk was the opposite
direction: the **already-live** Pro subscription's "unlimited scans" had no
usage cap, and Milestone C deliberately grew model count, which raises
per-scan cost roughly linearly (now ~$0.30-0.80/scan — still 20 calls, but
a pricier 4-model mix). A heavy Pro user at a fixed low monthly price could
have produced negative gross margin the moment more models shipped. Fixed
same-day: `PRO_PLAN_MONTHLY_SCAN_LIMIT = 20` (chosen low, per Marc's
explicit instruction, rather than the 50 originally proposed here) added to
`_shared/plan.mts`, reusing the exact counting-query pattern `scan.mts`
already uses for the free-tier limit (`FREE_PLAN_SCAN_LIMIT`) — see
`shared/CLAUDE.md`'s "Update 2026-08-13" note (moved there from root
`CLAUDE.md` on 2026-08-20 via `/doctor`).

**Adjacent, unplanned, but shipped — Pro scan top-up packs. ✅ SHIPPED
2026-08-23.** Not part of this milestone's original scope and not gated on
E0 (triggered instead by a CEO screenshot of a Pro user hitting the
fair-use cap above with no CTA at all) — but worth flagging here since it
reuses this milestone's exact E1 shape (a new one-time Stripe Price, a new
additive purchases table, a new webhook case) for a different product: a
$19/10-scan pack, extending `PRO_PLAN_MONTHLY_SCAN_LIMIT` rather than
unlocking a report. See `netlify/functions/CLAUDE.md`'s "Billing (Stripe)"
section for the implementation and `scan_credit_purchases` for the schema.
**Does not fulfill or replace E0-E4 below** — the one-time report SKU and
deep-advice gating remain not started, still gated on the same manual
sales test.

**E0 — Validate before building (do this first, before E1-E4).** A quick
office-hours pass on this plan surfaced the one real gap: the €499/$299
one-time report and the paid deep-advice unlock are inferred from Marc's
notes, not from anyone asking to pay — by his own honest answer, "it's a
hypothesis, no outbound test run yet." Building E1-E4 (a new Stripe SKU, a
`report_purchases` table, paywall logic, landing-page copy) is real
engineering time spent on an untested bet. Before writing any of that code:
hand-run a scan (via the app or `proof-script`) for 3-5 real prospects from
the existing outbound list, send each the report + advice directly, and ask
for €499 via a plain Stripe Payment Link (zero code — created directly in
the Stripe dashboard). If nobody pays, the cost was an afternoon, not a
sprint, and E1-E4 either get rescoped (different price, different
packaging) or dropped. **E1-E4 are gated on this test producing at least
one real payment.** Milestones A-D are independent of this and should ship
regardless of the outcome.

1. **One-time report SKU** (only after E0 validates): new Stripe Price (`mode: payment`, one-time).
   New `report_purchases` table (`user_id`, `company_id`, `scan_id`,
   `stripe_payment_intent_id`, `purchased_at`) — per-report, not
   account-wide, so it's additive rather than mutating `plan_tier`. New
   Checkout endpoint mirroring `create-checkout-session.mts`'s pattern (or
   extended with a `type` param), and a webhook case
   (`checkout.session.completed` with the new price ID) that inserts the
   purchase row instead of touching `user_profiles`.
2. **Gate deep advice**: `generate-deep-advice.mts` currently has no
   plan-tier check at all (confirmed). Add: allow if `isPro(planTier)` OR a
   matching `report_purchases` row exists for that scan's company. Reuse
   the exact `{error, upgradeRequired, limit}` 402 shape from
   `scan.mts`/`companies.mts` so the frontend's existing upgrade-CTA
   rendering pattern applies unchanged.
3. **Frontend gating**: `CompanyDetailView.vue`'s `:allow-deep-advice="true"`
   (currently unconditional) becomes a computed based on Pro/purchase
   state; when not entitled, swap the button for a purchase/upgrade CTA
   (reuse `startCheckout()`'s pattern for the new one-time Checkout).
4. **"Book a call" CTA**: add a persistent link beneath the deep-advice
   section — "Want us to execute this for you? Book a free strategy call" —
   shown regardless of entitlement state. Needs a booking link (Calendly or
   similar) from Marc before this ships.
5. Update `index.html`'s pricing copy/JSON-LD once real numbers are chosen
   (currently intentionally blank "One flat price/month"; report SKU has
   no price yet either) — copy change gated on Marc picking numbers, not a
   blocking engineering task.
6. Clean up now-stale doc comments: `aivis-core.mjs`'s note that
   "pricing/plan limits... aren't decided yet" and `TODOS.md`'s "pricing/
   plan-tier gating for deep advice is unresolved" — both resolved by this
   milestone.

## Verification plan

- After every milestone: `npm run build` (covers `vue-tsc --noEmit` +
  `netlify/functions/**/*.mts` type-check + Vite build) and report actual
  output, per house rule — never claim "fixed" without it.
- After any `shared/aivis-core.mjs` change: `node proof-script/index.mjs
  --dry-run` (the standing regression check for that file).
- After Milestone A ships: re-scan a short-name brand (ASML, TSMC, or NRC)
  live and confirm the score is no longer a false zero — reading the code
  fix isn't enough, the actual output has to change.
- After Milestone C's model expansion: time a real scan end-to-end and
  confirm it's still within an acceptable bound before calling it done.
- DB changes always via Neon MCP (`prepare_database_migration` → verify on
  a temp branch → `complete_database_migration`), never a live ad-hoc
  `ALTER TABLE` and never `drizzle-kit push` — consistent with how the
  original schema was provisioned.
- No lint/test framework exists in this repo (confirmed) — `type-check`,
  `build`, `--dry-run`, and manual browser verification are the only gates.

## Screenshot coverage (traceability)

Every one of the 15 annotated screenshots maps to a specific plan item below
— confirming each was individually reviewed, not just the typed notes.

| # | Time | What it shows | Addressed by |
|---|---|---|---|
| 1 | 08:07 | "Looking it up..." enrichment, annotated "Perplexity or scraped? Cause?" | Current-state note (enrichment mechanism answered) |
| 2 | 08:09 | "Couldn't auto-fill from that URL," annotated "FIX SCRAPE" | Milestone A5 |
| 3 | 08:15 | NRC "Run new scan" → "Failed to fetch," annotated "?CAUSE? FIX" | Root causes table; Milestone A5 |
| 4 | 08:18 | "5 additional checks failed... isn't currently recorded," annotated "FIX" | Root causes table; Milestone A3 |
| 5 | 08:20 | NRC scan "Invisible," scoreboard gap, annotated "WHERE?" | Milestone A3 (failure detail) |
| 6 | 08:21 | Deep-advice check-by-check, only 2 models, annotated "WE NEED MORE MODELS" | Decisions locked in; Milestone C1 |
| 7 | 08:22 | NRC scoreboard vs De Volkskrant/Telegraaf/AD | Milestone A1 (NRC's own false-zero fix) |
| 8 | 08:26 | "Vk" test scan, competitor "Fgggg," "9 of 20 checks failed," annotated "FIX" | Root causes table (NRC/VK asymmetry); Milestone A2 |
| 9 | 08:59 | Companies list, Apple "no data" vs NRC "0," annotated "DO FIRST SCAN!" | Milestone A7 |
| 10 | 09:03 | Apple scoreboard, Samsung/Microsoft/Google tallies, annotated "DON'T ADD UP"; duplicate "ALSO WORTH NOTING" headings | Milestone A6 (headings); Milestone D2 (tally traceability) |
| 11 | 09:10 | ASML score 0, annotated "WTF!?" | Root causes table; Milestone A1 |
| 12 | 09:25 | TSMC "Run new scan" → "Failed to fetch," annotated "?!" | Root causes table; Milestone A5 |
| 13 | 09:39 | TSMC score 0, annotated "WHAT WENT WRONG? SERIOUS!!" | Milestone A1 |
| 14 | 10:17 | Google LLC "Scanning...," annotated "TOO LONG" | Milestone C2 |
| 15 | 10:26 | Google LLC "Run new scan" → "Failed to fetch," annotated "FIX" | Root causes table; Milestone A5 |

## The assignment (from an office-hours pass on this plan)

Before any of Milestone E's code gets written: pick 3-5 real prospects from
the existing outbound list, hand-run a scan for each, and send them the
report + advice with a plain Stripe Payment Link asking €499. Do this in
parallel with Milestones A-D, not after — it's a sales task, not an
engineering task, and it's the one piece of this plan that's currently a
guess dressed up as a roadmap item.

## Open items needing Marc's input (non-blocking, but before their specific task executes)

- Exact Pro monthly price and exact one-time report price (both currently
  placeholders).
- Whether "How this works" should be a crawlable static page or a plain
  in-app route (Milestone D3).
- "John's screenshot" of technical SEO notes wasn't in the 15 provided
  images — share it if it has requirements beyond this audit's findings.
- A booking link (Calendly or similar) for the "book a call" CTA
  (Milestone E4).
- **A real fork worth deciding deliberately, not backing into**: Marc's
  notes describe building "a good team ready to execute on the deeper
  advice... mentions, citations, backlinks" for customers who book a call.
  That's agency/services labor cost, not software gross margin — a
  different business than the near-99%-margin report/subscription product
  this plan otherwise assumes. It also sits in tension with Marc's own
  stated refusal to run promotion/outreach himself. Worth an explicit
  decision later (after E0 shows real demand) on whether execution gets
  outsourced, kept deliberately small/high-touch, or dropped in favor of
  advice-only.

## Strategic assessment (office-hours pass, for traceability)

Direct answer to "are we working toward an exceptionally awesome AI ranking
app, or not": as originally scoped (Milestones A-E only), **not yet** — it
makes AIVis correct and sellable, which is necessary but not a moat.
Milestones F and G above are the response: two AI-engine differentiators
picked from an `ai`-agent ideation pass, one growth loop picked from a
`growth`-agent ideation pass (both run as part of this planning session),
plus a CFO-style guardrail on the already-live Pro plan found while
reasoning through unit economics. The one gap a forcing question surfaced
directly: the €499 report is currently a hypothesis with no outbound test
run — hence Milestone E0 gating E1-E4 on a real payment before that code
gets written.
