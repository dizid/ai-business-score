# Next steps — resume here

Written 2026-08-09. Picking up after the SaaS pivot (shipped 2026-08-03,
see `TODOS.md`) and a round of post-ship bug fixes (see recent `git log`:
company_urls fix, scan reliability, mobile clipping, JWT auto-refresh, bare
domain redirect).

## Where this stands

- **AIVis** (this repo, `aivis-scan.netlify.app`) is built, deployed, and
  working. Not the revenue product itself — `plan_tier` on `user_profiles`
  exists but pricing is unresolved and unused.
- **The actual close is Site Improver** (Dizid's website-rebuild offer).
  AIVis is the cold-outreach hook: proof a prospect's business is invisible
  to AI search, then pitch the rebuild that fixes it. Full sequence in
  `proof-script/OUTREACH.md` (5 touches over ~18 days, subject lines,
  merge fields, all written).
- **The gap: no real prospect has gone through the pipeline yet.**
  `proof-script/prospects.json` doesn't exist — only `prospects.example.json`.
  Every row in `proof-script/tracking.csv` and every file in
  `proof-script/results/` is the "Example Co" test run. Zero real leads
  qualified, zero emails sent.

## Blocker to resume on

Need a real prospect list from the CEO: 10-15 local businesses (plumbers,
dentists, contractors, HVAC, local law/accounting — "who does X near me"
categories, per `OUTREACH.md`'s targeting section) — brand, website,
category, region, 2-3 competitors each. Once that exists as
`proof-script/prospects.json`:

1. `node index.mjs --prospects prospects.json` (proof-script root)
2. Qualify: only keep prospects who are actually invisible/beaten — drop
   anyone who already ranks #1 (see `OUTREACH.md` step 1.2)
3. Re-run each qualified prospect as a scan in the CEO's own AIVis account
   for a real screenshot (score ring + scoreboard) — the visual asset for
   the email
4. Draft Touch 1 using the "Directional email draft" section of each
   prospect's `results/<slug>.md` — don't hand-write the claim

Also confirm `proof-script/.env`'s `PERPLEXITY_API_KEY` is still live before
running — it's set but wasn't re-verified this session.

## Open risk flagged by the CEO — needs attention before/alongside outreach

**2026-08-09, CEO's own words: not happy at all with Site Improver's
results — delivered "improved" sites were mediocre at best.**

This matters directly for the plan above: the entire AIVis outreach hook
exists to sell Site Improver. If the rebuild it closes into isn't actually
good, the hook works (gets replies) but the close damages reputation with
real prospects instead of building it. Worth a real look at what Site
Improver has been producing and why, before ramping outreach volume — not
something to fix quietly later once prospects are already mid-sequence.
