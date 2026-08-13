# TODOs

## STATUS 2026-08-13: Model expansion + concurrency fix + Pro fair-use cap (Milestone C1/C2 of `PLAN_NEXT_PHASE.md`) — uncommitted, not yet pushed

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

## STATUS 2026-08-12: Bug-fix phase (Milestones A, B, D3/D4 of `PLAN_NEXT_PHASE.md`) — SHIPPED to master, pushed

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

## STATUS 2026-08-09: Scan coverage + reliability + check-by-check UI — PR open, not yet merged (superseded: merged since, see 2026-08-12 entry above)

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

## STATUS 2026-08-03: SaaS pivot (auth, Neon Postgres, async scans, deep advice, progress chart) — SHIPPED, verified in production

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

## STATUS 2026-08-02: Vite + TypeScript + Vue migration for `web/` — SHIPPED, verified in production

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

## STATUS 2026-07-29 (superseded above): Vite + TypeScript + Vue migration for `web/` — DONE locally, not yet deployed

Rewrote `web/` on branch `vite-vue-migration` per the (corrected)
`MIGRATION.md` plan: added a real build pipeline (Vite, TypeScript,
`vue-tsc`, Tailwind v4) and ported `index.html`/`result.html`/`history.html`
in full to Vue 3 (`web/src/{index,result,history}/App.vue`), each its own
Vite multi-page entry (not a Vue-Router SPA — preserves the native
`<form method=POST action=/scan>` redirect-fragment mechanism). No
placeholder window: all three pages have full parity with the pre-migration
vanilla-JS versions.

Key decisions (see `MIGRATION.md` for full reasoning): `web/shared/
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

## STATUS 2026-07-29: friction-reduction ship (auto-fill + persistence) — DONE, deployed, verified

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

## Add vertical-adjusted prompt templating to AIVis proof script

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
