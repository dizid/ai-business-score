# QA-FIXES-PLAN: Foreground mobile QA pass (Aug 19-20 2026)

Handoff doc for later implementation — written by Claude Code after
researching root causes but not yet implemented (another session was
mid-implementation on something else at the time this was written, so
this was deliberately left as a plan rather than started).

## STATUS 2026-08-24: 4 of 6 items resolved, verified against current code

Commit `e2bde88` (2026-08-22) shipped **#1** (mobile nav CSS), **#4**
(how-it-works.html sentiment mention), and the visible half of **#3**
(hides the "No scans yet" empty state when a scan error is showing,
instead of stacking both messages — a narrower fix than #3a's original
ask below, see that item's note). **#2**'s redundancy concern is also
resolved: the hero eyebrow and H1 no longer restate each other (current
text: "No page 1. Just foreground or background." / "AI search gives one
answer, not a results page..."), per that same commit's "tighten the hero
headline/lead."

**#6 (demo declutter) is superseded, not shipped-as-written**: the
`.serp-row` markup this item's fix targeted no longer exists — the demo
section was rebuilt into a `.demo-grid`/`.demo-card` structure (4 cards,
each a short title + one sentence) as part of a later marketing pass. The
underlying complaint (too much text, too little info) reads resolved by
that redesign, but nobody edited `.serp-row` per this item's literal
instructions, since it's gone.

**Still open: #3a's actual ask (the `load()`-before-terminal-error
resync — a scan that completed server-side can still dead-end the UI),
#3b (root-cause confirmation via live Netlify logs), and #5 (gpt-5-mini
direct API migration — confirmed still gateway-routed, no
`OPENAI_API_KEY` exists as of this check).**

## Context

Marc did a mobile QA pass (Android Chrome) over two days (2026-08-19,
2026-08-20) on the Foreground marketing site, the "How this works" page,
and the authenticated app, marking up screenshots in red. This plan covers
all 7 annotated issues, researched via 3 parallel Explore agents plus
direct file reads to confirm root causes before proposing fixes — two
items needed clarification from Marc first (now resolved, folded in
below).

One documentation correction fell out of the research: the "add sentiment
analysis" annotation is not a missing feature — it's a real, shipped,
opt-in per-check feature (`judge-sentiment.mts` / "Judge sentiment" button)
that the how-it-works page simply never mentions.

## Issues & fixes, in suggested shipping order

### 1. [Bug, confirmed] Mobile nav header collision

`index.html`'s `nav.top` (logo "Foreground" + "Log in" + the orange "Get in
the foreground" CTA) has **zero mobile treatment**. The file's only
`@media (max-width:640px)` block (`public/marketing-theme.css:338-342`)
adjusts `.hero`/`section`/`.dissolve-panel`/`.demo-card`/`.plan-card`
padding but never touches `nav.top`/`.logo`/`.links`/`.cta`. `nav.top` is
`display:flex; justify-content:space-between` with no `flex-wrap`
(`marketing-theme.css:99-114`); `.links` has a fixed `gap:22px` and the CTA
carries `padding:9px 18px` around multi-word text. At ~360-412px viewport
widths (typical Android) these can't all fit on one line and visually
collide, exactly as screenshotted twice (2026-08-19 and 2026-08-20 —
unfixed between the two).

**Fix**: add a mobile rule set for `nav.top`/`.links`/`.cta` (allow
wrapping and/or shrink gap/padding/font-size below ~480px). File:
`public/marketing-theme.css` (nav block ~99-114, extend the `@media`
block ~338-342). Note in passing: `nav.top.scrolled-look`
(`marketing-theme.css:107`) is dead CSS — no JS ever applies that class —
worth a one-line cleanup while in this file, not a separate task.

### 2. [Copy] Hero eyebrow/heading — likely resolved by #1, re-check after

No CSS overlap bug exists here — the eyebrow (`index.html:159`, "No page 1.
Just foreground or background.") and the H1 below it (`index.html:160`)
use plain positive margins, no negative margins/absolute
positioning/z-index found. The "design error" annotation most likely reads
as broken because of #1's collision directly above it in the same
viewport. Real, separate issue worth a look regardless: the eyebrow line
and the H1 say almost the same thing back to back ("foreground or
background" / "in the foreground, or it isn't there at all") — mild
redundancy.

**Action**: ship #1 first, re-screenshot the hero at 375px/412px width,
and only then decide whether the eyebrow copy still needs tightening
(either drop it or make it complement rather than restate the H1).

### 3. [Bug, root cause partially confirmed] "Run new scan" → "Failed to fetch"

Traced the full path: `POST /scan` (`netlify/functions/scan.mts`) already
succeeded — it created a `pending` scans row and returned a `scanId` —
before the UI ever shows an error. The failure is in the **subsequent
polling** (`GET /scans/:id`, `pollScan()` in
`src/app/views/CompanyDetailView.vue:107-139`), which already has a 3-try
backoff (2s/4s/8s, shows "Connection hiccup, retrying…") that's exhausting
and surfacing the raw `TypeError: Failed to fetch` message. Once retries
exhaust, the UI never re-syncs with the server — `load()` (which would
reveal the scan that likely now exists server-side) is only called from
`pollScan()` on `status === 'completed'`, so the page keeps showing the
stale "No scans yet" empty-state even though a `pending`/`running` row may
already exist.

Timing correlation worth noting: the bug screenshot is dated 2026-08-19,
the same day commit `c4103e5` added a "Harmonia" site-audit sub-task to
`run-scan-background.mts` (3 extra outbound fetches to the scanned
website + PageSpeed Insights). Checked `shared/harmonia.mjs` directly —
every one of those fetches has its own `AbortController` timeout
(8s/5s/5s/40s), so it can't hang indefinitely; this rules out "Harmonia
hung the background function forever" but does **not** rule out a
Netlify function-concurrency ceiling on this site's plan (`nf_team_dev`,
per code comments) being pressured by a longer-running background
invocation while lightweight polling requests compete for capacity.
Confirming that needs live Netlify function logs correlated to the actual
failure timestamp, not more static analysis.

**Fix, two parts**:
- **a) Frontend resiliency (ship now, independent of root cause)**: in
  `pollScan()`, when retries exhaust, call `load()` before setting
  `scanError` so a scan that actually exists/completed server-side shows
  up instead of a dead-end error, and replace the terminal error state
  with a manual "Check again" action rather than requiring a full page
  reload. File: `src/app/views/CompanyDetailView.vue` (~lines 107-139).
- **b) Root-cause confirmation (needs live access)**: reproduce with a
  real scan and watch Netlify function logs (`scan`,
  `run-scan-background`, `scan-status`) around the failure window. This
  needs either the Netlify MCP connector (unauthenticated as of this
  writing — authorize via claude.ai's connector settings) or CLI/dashboard
  access. Flagging as a distinct step rather than guessing further.

### 4. [Docs only] Mention the sentiment-judge feature on how-it-works.html

Not a build task — sentiment classification already ships
(`netlify/functions/judge-sentiment.mts`, "Judge sentiment" button per
check in `ScanDetail.vue`, opt-in and on-demand). `how-it-works.html`'s
"presence detection, not sentiment analysis" paragraph
(lines ~165-177) is accurate for the *automatic* scan pipeline but never
mentions the separate opt-in feature exists.

**Fix**: add 1-2 sentences noting per-check sentiment classification is
available on demand. Mirror the same addition into the JSON-LD `HowTo`
block (~line 82) per the file's existing documented convention of keeping
JSON-LD verbatim-matched to the visible section.

### 5. [Feature, confirmed by Marc] Direct OpenAI API for gpt-5-mini

Currently gpt-5-mini is the only one of 4 models still routed through
Perplexity's gateway rather than a direct provider API — confirmed
accurate, not stale docs (`shared/aivis-core.mjs` `callModel`, no
`OPENAI_API_KEY` exists anywhere). Marc confirmed: migrate it to match
anthropic/google/xai's already-established direct pattern.

**Fix**:
- Add `OPENAI_API_KEY` as a Netlify env var (`envVarIsSecret: false` per
  standing project rule), reused from another Dizid project under
  `/home/marc/DEV` if one exists — same reuse pattern already used for
  `ANTHROPIC_API_KEY`/`GOOGLE_API_KEY`/`XAI_API_KEY`/`RESEND_API_KEY`
  rather than provisioning a new account. Redeploy after setting it.
- New `callModel` branch in `shared/aivis-core.mjs` for `openai/*`: direct
  `POST` to OpenAI's API with a web-search tool, verified against OpenAI's
  **current** docs and a real smoke-test call before trusting it — same
  discipline the anthropic/google/xai migrations were each held to
  (per `shared/CLAUDE.md`'s migration history — each was live-tested, not
  guessed).
- `apiKeys` already supports arbitrary per-provider keys
  (`{ perplexity, anthropic, google, xai }`) — add `openai` alongside.
- Update `how-it-works.html`'s "Limitations, honestly stated" section (and
  the "How a scan works" section, and the JSON-LD mirror) to drop the
  "routed through Perplexity's gateway, no direct account" language once
  live.
- **Confirm before implementing broadly**: `generate-deep-advice.mts`,
  `judge-sentiment.mts`, and `enrich.mts` also hardcode
  `openai/gpt-5-mini` outside the main scan loop — worth a quick check
  with Marc on whether those should move too (likely yes, for
  consistency) or stay on the gateway (lower urgency, they're one-off
  calls not part of the 20-call sequential scan).

Files: `shared/aivis-core.mjs`, Netlify env vars, `how-it-works.html`.

### 6. [Design, re-scoped per Marc's clarification] Declutter the demo section

Marc's actual ask (clarified — the handwritten "make more" was not "add
more cards"): the existing 3 example result cards are **"too much text,
too little useful info... clutter."** All 3 are hardcoded markup
(`index.html:170-198`, `.serp-row` blocks with title + URL + a full
descriptive snippet sentence each), not data-driven, so this is a direct
edit.

**Fix**: cut the snippet line from each of the 3 cards — keep just the
bold title + domain, drop the sentence-long description — so the "many
blue links vs. one clear answer" contrast reads at a glance instead of
requiring the visitor to read three paragraphs of fake SERP copy. Adjust
`marketing-theme.css`'s `.dissolve*` rules (~146-178) if removing the
snippet line leaves awkward card height/spacing.

Files: `index.html` (~170-198), `public/marketing-theme.css` (~146-178).

## Suggested phasing (small batches, per project convention)

1. Nav CSS fix (#1) — isolated, `marketing-theme.css` only.
2. Scan-polling frontend resiliency (#3a) — isolated,
   `CompanyDetailView.vue` only. Root-cause investigation (#3b) runs
   separately once log access is available.
3. how-it-works.html copy additions (#4) — isolated, docs only.
4. Demo section decluttering (#6) — `index.html` + CSS.
5. Hero eyebrow/heading re-check (#2) — after #1 ships, re-screenshot
   first; may turn out to need nothing further.
6. gpt-5-mini direct API migration (#5) — biggest lift (new key, new
   provider branch, smoke test, doc updates); do last since current
   gateway routing works today, this is a consistency upgrade not a bug.

## Verification

- Screenshot `index.html` at 375px and 412px viewport widths (common
  Android sizes) before/after the nav fix and the demo-section edit.
- `npm run build` after every batch (project's mandatory verify-before-
  claiming-fixed rule) — `vue-tsc --noEmit` covers `CompanyDetailView.vue`
  and `netlify/functions/**` too.
- Scan bug: reproduce with a real "Run new scan" click against a test
  company; confirm whether the frontend resiliency fix alone resolves the
  user-visible symptom even before the platform-level cause is fully
  nailed down.
- gpt-5-mini migration: one live smoke-test call with the new key before
  wiring into the full scan loop, then one full real 20-call scan, timed —
  same bar the other 3 provider migrations were held to per
  `shared/CLAUDE.md`.
