# TODOs

## STATUS 2026-08-09: Scan coverage + reliability + check-by-check UI — PR open, not yet merged

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
