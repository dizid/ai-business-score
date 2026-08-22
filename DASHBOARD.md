# AIVis Dashboard Upgrade — what changed and why

Written 2026-07-29 after upgrading the hosted result page
(`https://aivis-scan.netlify.app`) from a plain text summary into a scored
dashboard with a scoreboard and tailored advice. This doc is a plain-English
reference for later — the technical detail lives in `CLAUDE.md`.

## What you'll see on a result page now

1. **A score, 0-100**, in a colored ring — "how visible is this brand in AI
   search, weighted for being mentioned *first*, not just mentioned at all."
2. **A scoreboard** — your brand vs. the competitors you typed in, as bars
   showing how often each was mentioned across the check. Your brand is
   highlighted in blue; competitors are gray, sorted by how often they beat
   you.
3. **Tailored advice** — 1-3 short cards explaining what the specific result
   means and what to do about it (e.g. "you're invisible," "X is beating
   you," "you're leading"). This is generated from the actual scan numbers,
   not written by an AI on the spot — see "Why rule-based advice" below.
4. Everything from before is still there: the raw AI responses (collapsible,
   for manual review), warnings if the brand name was too generic to detect
   reliably or if some checks failed.

## The score formula — STALE, formula changed since this was written

**This section describes the 2026-07-29 formula, which is no longer what
the app computes.** `computeScore` (`shared/aivis-core.mjs`) was overhauled
to weight each completed call by rank (ranked-1 counts fully, ranked-2 60%,
ranked-3 30%, mentioned-but-unranked 10%) multiplied by that prompt's
query-intent weight (high-intent "buying" prompts count 3x an informational
one) — see `shared/CLAUDE.md`'s "Score" entry for the exact current
formula. The scan also now computes a **separate, secondary "Harmonia"
technical/SEO score** (shipped 2026-08-19, `shared/harmonia.mjs`) — never
blended into the AI Visibility Score below, shown alongside it on the
Overview tab. Kept below as historical record of the 2026-07-29 formula,
not current fact:

```
score = round(100 × (timesRankedFirst + 0.4 × timesBeatenButMentioned) / totalChecksCompleted)
```

- Being mentioned *first* (no competitor named ahead of you) counts fully.
- Being mentioned but *beaten* to the punch (a competitor named first) counts
  for 40% — real signal (AI knows you exist) but weaker than a clean win.
- Never mentioned at all counts for nothing.
- If every check fails (API issue, not your fault), the score shows
  "unavailable," never a fake 0 — a 0 has to mean "genuinely invisible
  across real checks," not "something broke."

## The scoreboard

Built entirely from data the scan already fetches — no extra API calls, no
extra cost, no extra wait. For each of the 6 checks, we now track not just
"were you mentioned" but "was each named competitor mentioned, and did they
beat you to it." That per-competitor detail existed transiently in the code
before this upgrade but was thrown away after computing your rank — now it's
kept and shown.

## Why rule-based advice, not AI-generated

You could imagine asking an AI to write a paragraph of advice after each
scan. We didn't build it that way, on purpose:

- A real Perplexity call takes 15-20 seconds in practice (measured, not
  guessed). The scan already runs 6 of these calls in parallel and is tuned
  right up against the ~20-30 second limit Netlify allows for one request.
  An advice call would have to run *after* the scan finishes (it needs the
  results as input), adding another 15-20 seconds on top — real risk of
  timing out the whole page load.
- It would roughly double the cost per scan.
- A generated paragraph can occasionally say something off, generic, or
  slightly wrong. A templated one, driven by the real numbers, always says
  something true.

Instead, the code picks from a fixed set of scenarios (invisible / beaten by
a named competitor / leading / mixed) based on the actual scan data, and
fills in a pre-written sentence with your real numbers and the real
competitor name. Fast, free, always accurate to what the scan actually
found.

## One thing worth knowing: this reverses an earlier decision

Early in this project (the `/office-hours` planning session), we
specifically decided *against* showing a precise score, because the worry
was: if you send a prospect a cold email saying "you scored 2/16," and they
re-check it themselves and get a different number (AI answers aren't
perfectly consistent between runs), that looks bad and could cost you
credibility with someone you're trying to win over.

That reasoning doesn't really apply here — this is a link you're personally
sharing with a friend to show off a tool you built, not a claim in a cold
sales email to a stranger who might fact-check you. So we're comfortable
showing a real score on this page. The cold-email version (the local
`proof-script/` tool, if you use it later) still deliberately avoids exact
numbers in the email copy itself — that decision wasn't touched.

## What this does NOT include (on purpose) — STALE as of 2026-08-03

**Update 2026-08-03:** everything in this section was reversed by the SaaS
pivot — see `CLAUDE.md` and `TODOS.md`'s 2026-08-03 status entry for the
current architecture (Neon Postgres, Neon Auth accounts, a companies/scans
data model, a score-over-time chart). Kept below as historical record of the
2026-07-29 scope, not current fact.

- No database, no accounts, no login.
- No history — nothing is tracked over time, no "your score last week."
- No leaderboard across different customers/brands — the scoreboard is only
  "your brand vs. the competitors you typed in," for one scan.

If you want any of that later (tracking a score over time, a real
multi-customer product), that's a bigger step — it needs a real database and
was explicitly set aside earlier in this project until there's evidence
people actually want to pay for this. Worth a proper conversation before
building it, not something to bolt on quietly.

## Files touched

- `web/shared/aivis-core.mjs` — the score formula, the advice-scenario
  picker, and the per-competitor tally logic all live here (shared by both
  the website and the local `proof-script/` CLI tool).
- `web/netlify/functions/scan.mts` — passes the new score/scoreboard/advice
  data through to the result page. No change to how the scan itself runs.
- `web/result.html` — the actual dashboard: the score ring, the scoreboard
  bars, and the advice cards, all hand-built (no chart library, nothing to
  install — matches how the rest of this project is built).
- `web/index.html` — the input form got a light visual refresh to match.
