# TODO

Quick checklist, split by who it's for. Full context/history for most of
these already lives in `QA-FIXES-PLAN.md`, `TODO-MARKETING.md`,
`REPORTPLAN.md`, and `PLAN_NEXT_PHASE.md` — this file is just the
scannable action list, not a replacement for those.

**Before picking anything up: run `git status` and `ListAgents` first.**
This repo regularly has multiple concurrent sessions editing it — as of
2026-08-25, another session has `ScanDetail.vue`, `CompanyDetailView.vue`,
`scanDerived.ts`/`scanLabels.ts`/`scanPayload.ts`/`scanReport.ts`,
`shared/harmonia.mjs`/`aivis-core.mjs`, and a new
`CompetitorTrendChart.vue` all mid-edit — looks like the scan-result
clarity + competitor-trend-chart work. Don't duplicate it; check what
landed before starting anything below that touches those files.

## Marc

- [ ] **Read the 4 blog posts** at `/blog` (`content/blog/*.md`) before
      treating them as final — the source drafts were explicitly marked
      "needs Marc's read before posting," and only the format was
      converted, not the substance.
- [ ] **Decide on Stripe live mode.** `STRIPE_SECRET_KEY` is still a
      test-mode key — every checkout to date, including "live" Pro
      signups, has been fake money. Real payments need live mode
      activated on the Stripe account (business details, banking) plus
      live-mode Prices swapped in for all three SKUs.
- [ ] **Create the GA4 property.** Marc chose Google Analytics over the two
      previously-raised options (2026-08-25) — GA4 tracking code is now
      wired into every page (guarded to no-op until configured), Privacy
      Policy updated to disclose it. Claude has no Analytics Admin API
      access or browser/OAuth session to create the property itself — Marc
      needs to create one at analytics.google.com (Admin → Create Property,
      ~2 min) and hand over the Measurement ID (`G-XXXXXXXXXX`), then set
      it as `VITE_GA4_MEASUREMENT_ID` on the Netlify site + redeploy. See
      `CLAUDE.md`'s Deployment section. Also still open: no cookie-consent
      mechanism exists on the site, a real gap for EU visitors now that a
      non-essential tracking cookie is in play — flagged, not built.
- [ ] **Netlify function log access**, so QA-FIXES-PLAN #3b (root cause of
      the scan-polling failures — suspected Netlify concurrency ceiling)
      can actually be confirmed instead of guessed at from static code.
- [ ] **Priority call on `REPORTPLAN.md` Change 2** (agency portfolio
      view — summary strip, search/sort/filter, "needs attention first"
      default). Fully scoped, not started — still worth building given
      how much of the userbase is actually multi-company?

## Claude

- [ ] **Fix the `stripe-webhook.mts` token-in-URL issue** — the
      scan-receipt email links to `/app/scan?token=...`, which can leak
      via referrer/access logs. Flagged by an automated security review
      2026-08-24, still unfixed. Swap for a one-time-redemption flow
      (`/app/scan/claim?token=...` → sets an httpOnly cookie → redirects
      to a clean URL).
- [ ] **Fix the real `pollScan()` gap** in `CompanyDetailView.vue`
      (~line 152) — when retries exhaust, it sets `scanError` directly
      without calling `load()` first, so a scan that actually completed
      server-side can still dead-end the UI with a raw error. (The
      *visible* double-messaging symptom was already fixed in `e2bde88`;
      this is the deeper gap QA-FIXES-PLAN #3a originally asked for,
      still open.)
- [ ] **`gpt-5-mini` direct API migration — code done, blocked on a real key
      to test with** (QA-FIXES-PLAN #5). No `OPENAI_API_KEY` exists in any
      Dizid project's `.env` files (checked contents, not just filenames,
      twice independently). Marc has two keys visible in the OpenAI
      dashboard (`OpenAI001`, `OpenAI-servicekey001`) but the values are
      masked there — can't extract from a screenshot. Written anyway: a new
      `case 'openai'` in `callModel` (`shared/aivis-core.mjs`) calling
      `api.openai.com/v1/responses` directly, falling back to the
      Perplexity gateway automatically if `OPENAI_API_KEY` isn't set — so
      it shipped safely with zero behavior change until the key exists. All
      6 call sites updated (`run-scan-background.mts`, `enrich.mts`,
      `stripe-webhook.mts`, `judge-sentiment.mts`,
      `generate-deep-advice.mts`, `proof-script/index.mjs`). **Not
      live-verified** — needs a real smoke-test call once Marc pastes a key
      value or sets `OPENAI_API_KEY` on Netlify himself, same "verify live
      before trusting" discipline as the other three provider migrations.
- [ ] **Build `REPORTPLAN.md` Change 2** (see Marc's priority-call item
      above — don't start until that's a yes).
- [ ] **Shared header/footer partial** across `index.html`,
      `how-it-works.html`, `privacy.html`, `terms.html` (currently
      duplicated ~220-320 lines each, and the blog pages added 2026-08-24
      duplicate it a 5th time). Deferred during the blog build to avoid a
      collision with concurrent edits on those files — check they're
      quiet before starting.
- [ ] **Reconcile docs once the in-progress scan-clarity work (see repo
      status note above) lands** — `PLAN_NEXT_PHASE.md`, `TODOS.md`, and
      `QA-FIXES-PLAN.md` will all need a status update once that commits,
      same pattern as the blog reconciliation on 2026-08-24.
