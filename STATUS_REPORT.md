# Status report — doc reconciliation pass, 2026-08-20

Written after auditing every top-level `.md` file against the actual
shipped state of the code (git log, `shared/CLAUDE.md`,
`netlify/functions/CLAUDE.md`) and fixing what had drifted. No source code
was touched — this was a documentation-only pass. Nothing here is
committed; all changes are in the working tree for review.

## What was already in flight (found, not caused, by this pass)

A `/doctor`-style split of the root `CLAUDE.md` was sitting uncommitted
when this pass started: the long "Update 2026-08-12"/"Update 2026-08-13"
scan-mechanics history was cut from root `CLAUDE.md` and migrated into
`shared/CLAUDE.md` and `netlify/functions/CLAUDE.md`, with `README.md`,
`WISH_LIST.md`, and `PLAN_NEXT_PHASE.md` updated to point at the new
location. Verified this migration is complete and internally consistent —
every fact that was cut (concurrency-tuning history, the `failures`/
`total_tokens` columns, the `isAmbiguousBrandName` fix, the scan-complete
email) actually landed in one of the two nested files, and no doc still
points at the old, now-deleted location. No action needed here; left as-is.

## Gaps found and fixed this pass

1. **`PLAN_NEXT_PHASE.md` — Milestone F was documented as "not started."**
   It shipped in two parts: citation-URL attribution (2026-08-15) and the
   sentiment judge, on-demand-only at first (2026-08-15), then extended to
   auto-run on every scan (2026-08-20, commit `afcd14a`). Updated both the
   status table and the milestone section to reflect this, with the
   auto-judge history and reasoning cross-referenced from `shared/CLAUDE.md`.

2. **`README.md` — the manual test walkthrough predated the last two
   shipped features.** It never mentioned the Overview/Details tab split or
   the secondary Harmonia technical/SEO score (both 2026-08-19), or
   automatic sentiment classification (2026-08-20). Rewrote step 4 and
   added a new step 5 covering both; renumbered the remaining steps.

3. **`TODOS.md` — no journal entry existed for the most recent shipped
   commit.** Every prior feature has a `## STATUS <date>: ... — SHIPPED`
   entry at the top of this file; 2026-08-20's auto-judge sentiment work
   (`afcd14a`) had none yet. Added one, and used it to also log
   `QA-FIXES-PLAN.md`'s existence — a real, researched handoff plan sitting
   untracked at the repo root, not yet implemented (see below).

4. **`DASHBOARD.md` — the score formula section was stale and not flagged
   as such.** The doc already had one section explicitly marked "STALE as
   of 2026-08-03" (the no-accounts/no-history description, reversed by the
   SaaS pivot), but the score-formula section right above it still
   presented the **original** `timesRankedFirst + 0.4×timesBeatenButMentioned`
   formula as current fact. The real formula was overhauled to a
   rank-weighted × query-intent-weighted calculation (see
   `shared/CLAUDE.md`'s "Score" entry) — this doc was never updated when
   that shipped. Flagged the section stale, summarized the real current
   formula inline, noted the Harmonia secondary score's existence, and kept
   the original formula below as historical record — same pattern the
   doc's other stale section already uses, not a rewrite.

## Files not changed, and why

- **`GEMINI-PLAN.md`** (untracked) — a plan Marc pasted in from Gemini
  during the Harmonia work; already referenced and reconciled in
  `TODOS.md`'s 2026-08-19 entry as historical context for how the Harmonia
  scope was negotiated down. No update needed; it's a point-in-time
  artifact, not living documentation.
- **`QA-FIXES-PLAN.md`** (untracked) — a fresh handoff doc (written
  2026-08-20) for an unimplemented mobile QA pass. Left untouched (it's
  already a complete, self-contained plan) but now cross-referenced from
  `TODOS.md` so it isn't an orphaned file nobody's aware of.
- **`REPORTPLAN.md`** — checked; already self-updated when Change 1 shipped
  2026-08-19 ("Change 1 (report clarity) shipped 2026-08-19" in its own
  header). No drift found.
- **`WISH_LIST.md`, `NEXT-STEPS.md`, `TODO-MARKETING.md`, `MIGRATION.md`,
  `V2_SCORING_MODEL.md`, `CLAUDE_HANDOFF.md`, `DEEPSEEK.md`, `DEV.md`** —
  spot-checked for mentions of sentiment/Harmonia/citation-attribution;
  none found any claims contradicted by the recent ships, so left alone
  (`WISH_LIST.md`'s only relevant change — the `CLAUDE.md` split
  cross-reference — was already made before this pass started).

## Current project state (for context, not new work)

- **Uncommitted in the working tree right now**: the `/doctor` CLAUDE.md
  split (found already in progress) + all the fixes from this pass
  (`PLAN_NEXT_PHASE.md`, `README.md`, `TODOS.md`, `DASHBOARD.md`) + the two
  untracked plan docs (`GEMINI-PLAN.md`, `QA-FIXES-PLAN.md`). Nothing has
  been committed — per standing instruction, commits happen only when
  explicitly requested.
- **Open engineering work**, per `QA-FIXES-PLAN.md` and `PLAN_NEXT_PHASE.md`:
  a mobile nav CSS collision bug, a scan-polling UX gap ("Failed to fetch"
  on retry exhaustion), a `how-it-works.html` docs gap about the sentiment
  feature, a demo-section decluttering, and the `gpt-5-mini` direct-OpenAI
  migration (3 of 4 models already migrated off the Perplexity gateway).
  None of these are started yet.
- **Milestone E (monetization)** remains not started; E0 (Marc's manual
  €499 sales test) hasn't run yet and gates E1-E4.

## Suggested next step

Review this diff, then decide whether to commit the doc updates as one
batch (they're all documentation, zero code risk) before picking up
`QA-FIXES-PLAN.md`'s first item (the nav CSS fix — isolated,
`marketing-theme.css` only, per its own suggested shipping order).
