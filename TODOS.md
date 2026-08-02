# TODOs

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

**Caveat:** two pushes to `master` since the repo was linked (the migration
merge, then the `netlify.toml` fix) have **not** triggered an automatic
Netlify build — `currentDeploy` never moved off whatever was last
published. To get the fix live without waiting on an unexplained CI gap, a
manual deploy (`netlify-deploy-services-updater` → `deploy-site`, pointed at
`web/`) was pushed directly — deploy `6a6da6858672bf1d00b9c0a4`, `state:
ready`, correctly built with Vite/vue-tsc, 3 functions (`enrich`, `history`,
`scan`) deployed, 3 pages published. **Follow-up still open:** figure out
why push-triggered auto-deploy isn't firing (check the GitHub webhook under
Site configuration → Build & deploy → Continuous deployment, or try a
manual "Trigger deploy" once to see if that re-establishes it) — until then,
future pushes to `master` will need a manual `deploy-site` call too.

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
