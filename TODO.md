# TODO

Quick checklist, split by who it's for. Full context/history for most of
these already lives in `QA-FIXES-PLAN.md`, `TODO-MARKETING.md`,
`REPORTPLAN.md`, and `PLAN_NEXT_PHASE.md` — this file is just the
scannable action list, not a replacement for those.

**Before picking anything up: run `git status` and `ListAgents` first.**
This repo regularly has multiple concurrent sessions editing it. The
scan-result clarity + competitor-trend-chart work flagged as mid-edit
earlier on 2026-08-25 has since landed (commit `3d12679`, "Add GEO-report
upgrade") — that warning is resolved, but re-check current state before
assuming nothing else is in flight.

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
