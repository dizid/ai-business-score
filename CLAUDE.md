# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**2026-08-18: renamed AIVis → Foreground.** "AIVis" collided with several
existing companies in the identical AI-visibility/GEO niche (`aivis.ai`,
`aivis.biz`, `aivis-os.com`, AIVIS Inc.) — discovered post-launch, not at
naming time. Separately, "Spotlight" — the marketing identity that had
just shipped the same day (commit `5f0d0c8`) — also collided, with
`get-spotlight.com`, a direct competitor. "Foreground" was checked against
the same competitor landscape and came back clean. This is a name-and-copy
change only: the product, scoring model, architecture, and the visual
system (dark background, gold accent, Space Grotesk — see `brand/BRAND.md`)
are unchanged, just re-labeled from "spotlight/stage/offstage" language to
"foreground/background" language. Internal identifiers that predate the
rename — the Netlify site `aivis-scan`, the Neon project `aivis`,
`shared/aivis-core.mjs`, the Netlify Blobs store `aivis-scans`,
`package.json`'s `"name": "aivis-web"` — are deliberately left as-is
(renaming them touches every import/deploy path for zero user-visible
benefit) and are not evidence of an incomplete rename. Historical/dated
entries throughout this repo's journal-style docs (`TODOS.md`,
`PLAN_NEXT_PHASE.md`, `DASHBOARD.md`, `NEXT-STEPS.md`, `WISH_LIST.md`,
`MIGRATION.md`, `REPORTPLAN.md`, `V2_SCORING_MODEL.md`, `docs/*`, the
nested `netlify/functions/CLAUDE.md`/`shared/CLAUDE.md`/
`proof-script/CLAUDE.md`) still say "AIVis" where that was the product's
actual name on that date — intentional, not an oversight; only
current-state prose was updated. The site still lives at
`aivis-scan.netlify.app`; a real domain hasn't been registered yet, so
every canonical/OG/JSON-LD/sitemap/robots/llms.txt URL still intentionally
points there, not at a domain nobody owns yet.

## What this is

Foreground: checks whether a business shows up when AI search engines (ChatGPT,
Gemini, via Perplexity's Agent API) are asked about their category. Two
implementations share one core:

- **`proof-script/`** (Approach A) — a local CLI, run manually by one person
  against a hand-curated prospect list. No server, no DB, no accounts. Still
  the tool for hand-curated outbound (see `TODOS.md`'s GTM notes) — untouched
  by the SaaS pivot below.
- **The repo root** (Approach B) — a hosted, self-serve, multi-tenant SaaS
  deployed to Netlify as site `aivis-scan`: users sign up, add companies they
  want to track, run scans against them, and watch a score-over-time trend.
  This **was** a single-operator, passphrase-gated stateless-link tool until
  2026-08-03, when the CEO confirmed a deliberate pivot to self-serve
  multi-tenant SaaS (see memory `aivis-saas-pivot-2026-08-03` and the
  executed plan at `~/.claude/plans/cheerful-leaping-dragon.md` for the full
  milestone-by-milestone history). `result.html` — the old stateless
  shareable-link page — is kept alive indefinitely alongside the new
  authenticated app so links shared before the pivot never break; it is
  otherwise frozen and receives no new traffic.
- **`shared/aivis-core.mjs`** — the single source of truth for prompt
  templates, models, brand-detection, scoring, and the Perplexity API call.
  Imported by `proof-script/index.mjs`, every `netlify/functions/*.mts` that
  needs it, and the Vue app under `src/`. Deliberately kept as plain untyped
  `.mjs` at this exact path — `proof-script` runs via plain `node index.mjs`
  with zero deps and zero transpilation, so it cannot load a `.ts` file.
  Converting or moving this file would break proof-script outright. Every
  export added since the SaaS pivot (`buildDeepAdvicePrompt`,
  `parseDeepAdviceResponse`) follows this same constraint and is additive
  only — nothing existing has been removed or renamed.

The full rationale for the *original* stateless-link design (why Approach A
first, what was rejected, what's deferred) lives in the design doc at
`~/.gstack/projects/ai-business-score/marc-none-no-git-repo-design-20260728-153615.md`
and its eng-review addendum — still useful history, but read it knowing the
"no database, no accounts" scoping it documents was reversed on 2026-08-03,
not just the earlier "add a Blobs store" reversal it already describes.
Vertical prompt templating is still deliberately deferred per that doc's
original reasoning (see `TODOS.md`).

**Scan pipeline mechanics** — prompt/model counts, per-call timeouts, the
concurrency-limit incident history, retry/backoff behavior, DB schema, and
the scan-complete email — live in `shared/CLAUDE.md` (the `aivis-core.mjs`
single source of truth) and `netlify/functions/CLAUDE.md`
(`run-scan-background.mts` + DB schema). Read those when touching the scan
pipeline; this always-loaded root file no longer restates that detail
(trimmed 2026-08-20 via `/doctor` — it had grown substantially redundant
with both nested files by then).

## Deployment

- **Netlify site:** `aivis-scan`, site ID `70e29675-6562-4245-831a-7a3392e51980`,
  team `dizid`. Git-connected CI — pushing to `master` triggers a build.
- **Neon project:** `aivis`, project ID `square-snow-36406551`, org
  `org-raspy-sound-58493566` ("Marc de"), database `neondb`, branch `main`
  (`br-little-queen-axuj51in`). Created 2026-08-03 specifically for this
  app — do not confuse with the org's ~16 other unrelated Neon projects.
- **Neon Auth (Better Auth 1.4.18):** base URL
  `https://ep-polished-flower-axm1d600.neonauth.c-4.us-east-2.aws.neon.tech/neondb/auth`,
  JWKS at `.../auth/.well-known/jwks.json`. `https://aivis-scan.netlify.app`
  is in Neon Auth's `trusted_origins` (was empty at provisioning time —
  required for browser sign-up/sign-in to work from the deployed site, not
  just `localhost`).
- Env vars on the Netlify site (all non-secret, per standing rule):
  `PERPLEXITY_API_KEY`, `DATABASE_URL` (Neon pooled connection string),
  `NEON_AUTH_JWKS_URL`, `RESEND_API_KEY`/`RESEND_FROM_EMAIL` (added
  2026-08-13, scan-complete email — see `netlify/functions/CLAUDE.md`'s
  `run-scan-background.mts` entry for the Resend/DNS-verification detail;
  `RESEND_API_KEY` is reused from an existing personal Resend account also
  used by other Dizid projects, not a new account created for Foreground).
  `SCAN_PASSPHRASE` was removed
  2026-08-03 (Milestone 8 cleanup) once nothing in code referenced it
  anymore. `ANTHROPIC_API_KEY`/`GOOGLE_API_KEY`/`XAI_API_KEY` added
  2026-08-15 for the direct-provider migration (see "Multi-provider model
  client" under `shared/aivis-core.mjs` below) — all three are personal
  keys reused from other Dizid projects (found under `/home/marc/DEV`),
  same reuse pattern already established for `RESEND_API_KEY`, not new
  accounts created for Foreground specifically. No `OPENAI_API_KEY` exists
  anywhere — `openai/gpt-5-mini` stays on the Perplexity gateway.
  `GOOGLE_PAGESPEED_API_KEY` added 2026-08-19 for Harmonia's Core Web
  Vitals pillar (`shared/harmonia.mjs`) — a **dedicated new GCP project**
  (`GOOGLE_API_KEY`'s existing project doesn't have the PageSpeed Insights
  API enabled, confirmed live via a 403), unlike every other key above.
  Live-verified against the real API before being set, then a fresh manual
  deploy triggered (via Netlify MCP) to make sure this specific deploy's
  function config actually includes it, not just an assumption from the
  next auto-deploy.

## Commands

**Local script** (from `proof-script/`):

```bash
node index.mjs --dry-run                       # sanity-check the pipeline, no network calls, no cost
node index.mjs --prospects prospects.json       # the real run (needs PERPLEXITY_API_KEY in .env)
node index.mjs --prospects prospects.json --concurrency 4 --out results
node index.mjs --help
```

Setup: copy `proof-script/.env.example` to `proof-script/.env` and set
`PERPLEXITY_API_KEY`. Copy `proof-script/prospects.example.json` to
`prospects.json` and fill in real prospects (schema: brand, website,
competitors, category, use_case, region, customer_segment).

**Hosted site** (from the repo root):

```bash
npm install       # from the repo root, after any dependency change
npm run dev       # Vite dev server on :5173, @netlify/vite-plugin emulates
                   # functions/blobs/env vars locally (no netlify dev needed)
npm run type-check  # vue-tsc --noEmit (covers netlify/functions/**/*.mts too, not just src/)
npm run build     # vue-tsc --noEmit && vite build -> dist/
```

Deploys go through **git-connected Netlify CI** (site `aivis-scan`, team
`dizid`) — pushing to `master` triggers Netlify to run `npm run build` and
publish `dist`. `netlify.toml` sets `command = "npm run build"`,
`publish = "dist"`, `functions = "netlify/functions"`,
`node_bundler = "esbuild"`, plus a `[[redirects]]` rule rewriting `/app/*` to
`/app.html` for the SPA (see below).

No lint config, no test framework anywhere in this repo — `proof-script/`
stays zero-dep, plain `node index.mjs`, no build step. The hosted site's
Netlify Functions are bundled independently by Netlify's own esbuild
function bundler at deploy time — they import `../../shared/aivis-core.mjs`
directly and are unaffected by the frontend's Vite build (both are now
type-checked by the same `npm run type-check`, though — `tsconfig.json`'s
`include` covers `netlify/functions/**/*.mts` since Milestone 0 of the
pivot, fixing a real gap where those files were never type-checked before).
Formal automated tests were explicitly deferred in favor of `--dry-run` as
the pre-flight check for `proof-script/` and `vue-tsc`/manual browser
verification for the hosted site — this constraint predates the pivot and
wasn't revisited by it.

## Architecture

Subsystem-specific detail moved out of this always-loaded root file on
2026-08-17 (via `/doctor`) into nested `CLAUDE.md` files that load
automatically only when a session touches that directory: `shared/CLAUDE.md`
(the `aivis-core.mjs` single source of truth), `netlify/functions/CLAUDE.md`
(DB schema, auth, billing, and the function-by-function breakdown),
`src/app/CLAUDE.md` (the authenticated app shell),
`src/shared/CLAUDE.md` (`scanPayload.ts` + `ScanDetail.vue`), and
`proof-script/CLAUDE.md`. Nothing was deleted, just relocated.

### `vite.config.ts` — two entries

- **`result.html`** — the pre-pivot shareable result page, kept alive
  indefinitely so old links never break. Thin Vite shell; `src/result/App.vue`
  decodes a `#d=` URL fragment client-side (`b64urlDecode` +
  `validatePayload` from `scanPayload.ts`) and renders via
  `<ScanDetail :payload="data" />`. Never calls the API. `allowDeepAdvice`
  is not set here, so the deep-advice button never shows on old links (no
  auth system on this page at all).
- **`app.html`** — the real product: a full **vue-router SPA**
  (`src/app/router.ts`, `history` mode). Safe as a client-side-routed SPA
  specifically because its data comes from authenticated API calls fetched
  by ID, not a URL fragment a route change would drop — the opposite of why
  the pre-pivot pages were deliberately *not* a SPA (see below).
  `netlify.toml`'s `[[redirects]]` rule (`/app/* → /app.html`, 200) makes
  direct navigation/refresh on nested routes like `/app/companies/123`
  resolve correctly.

`index.html` and `history.html` (the old passphrase-gated scan form and
history list) were **retired** in Milestone 5 once the authenticated app
shell covered the same ground — deleted along with their
`src/index`/`src/history` Vue apps and the then-fully-redundant
`netlify/functions/history.mts` (superseded by `GET /companies` +
`GET /companies/:id`). If you're looking for the "why not a SPA" reasoning
that used to live here, it only ever applied to those retired pages and
`result.html` — read `src/app/router.ts`'s own comment for why `app.html`
doesn't have that constraint.

