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

**Known limitation, unchanged by the pivot:** real Perplexity calls with
`web_search` grounding routinely take 15-20s, sometimes longer. proof-script
runs the full 10 prompts x 4 models = 40 calls (prompts grew from 3 to 10 on
2026-08-09 at a live user's request — see `shared/aivis-core.mjs`'s
`PROMPT_TEMPLATES` comment; models grew from 2 to 4 on 2026-08-13, after a
briefly-reverted attempt at 6 on 2026-08-09 — see the `MODELS` comment for
the full history). The hosted site's `run-scan-background.mts` uses a
**5-prompt slice** of the same `PROMPT_TEMPLATES` array (20 calls, not 40)
— see "Async scan execution" below for why. Each call has a 60s per-call
timeout. This used to force the whole `/scan` request to stay synchronous
and tightly timeout-budgeted — that constraint is gone since Milestone 5
made scans asynchronous (see "Async scan execution" below).

Also changed 2026-08-09, after a live user flagged the original
fire-everything-via-`Promise.all` approach as a real risk once call counts
grew: `run-scan-background.mts` runs calls through a concurrency-limited
worker pool (`runWithConcurrency` in `aivis-core.mjs`) instead of all at
once, and every call shares one scan-wide `SCAN_DEADLINE_MS` via a single
`AbortController` — this is what actually bounds worst-case scan latency as
prompt/model count grows, since otherwise each call gets its own full retry
budget regardless of how long the batch had already run. Calls still in
flight when the scan deadline fires are aborted and counted as failed, same
as any other failure. **The concurrency limit and deadline value have
changed twice since, most recently to 1 / 600000ms (10 min) — see "Update
2026-08-13" below; don't trust a specific number in older prose without
checking `run-scan-background.mts` directly.** `callModelWithRetry` uses 3
attempts with a rate-limit-aware escalating backoff between them (longer for
HTTP 429 specifically than other failures) — the backoff exists specifically
to avoid re-hammering a live rate limit rather than to guard against generic
flakiness.

**Update 2026-08-12 (Milestone A of `PLAN_NEXT_PHASE.md`, shipped):**
per-check failure detail (which prompt/model failed, and why) is now
persisted — a `failures jsonb` column on `scans`, populated by
`aggregateProspect`'s return value and rendered in `ScanDetail.vue` in
place of the old "isn't currently recorded" note. This resurrects a feature
that briefly existed (commit `522eb63`) and was accidentally deleted the
next day during an unrelated refactor (`74afa41`) — diagnosing which calls
failed no longer needs the Netlify function logs. A `total_tokens integer`
column on `scans` was added the same migration, DB-only (not surfaced in
any UI), so real per-scan Perplexity cost can be queried directly via Neon
MCP — this exists to inform report/subscription pricing, not as a product
feature.

Also fixed the same milestone: `isAmbiguousBrandName()`
(`shared/aivis-core.mjs`) used to flag **any** single-word brand name of 4
characters or fewer as ambiguous and skip detection entirely, regardless of
whether it was an actual common word — a real bug, not a design choice,
that gave real brands (ASML, TSMC, NRC, IBM, SAP) a false `0/100 —
Invisible` score. Ambiguity is now driven only by `COMMON_WORD_STOPLIST`
membership. Competitor-name ambiguity (which previously failed silently,
indistinguishable from "never mentioned") now sets a per-competitor
`ambiguous` flag surfaced in `ScanDetail.vue`'s scoreboard.

**Update 2026-08-13 (Milestone C1 of `PLAN_NEXT_PHASE.md`, shipped):**
`MODELS` grew from 2 to 4 (`anthropic/claude-haiku-4-5`, `xai/grok-4.6`
added, both live-smoke-tested first — see `shared/aivis-core.mjs`'s
`MODELS` comment). Anthropic models need an explicit `max_output_tokens` in
the request body that the other providers don't (`callModel` now sends it
conditionally). The same smoke-testing pass found something bigger than the
model additions: **Perplexity's real per-key concurrency limit is ~1**, not
the 4 this file previously documented — bursts of 2-4 concurrent calls,
including across different providers, failed 50-83% of the time with HTTP
429, while fully sequential calls succeeded 100%. `CONCURRENCY_LIMIT` is
now `1` (fully sequential) and `SCAN_DEADLINE_MS` is `600000` (10 min) —
see `run-scan-background.mts`'s `CONCURRENCY_LIMIT` comment for the full
incident writeup (this is the second retune the same day; an earlier
same-day fix for a *worse* incident, concurrency=10 causing 16-18/20 calls
to fail, had already dropped it to 4 — which turned out to still be wrong).
Sequential-only means wall-clock time scales directly with call count, so
the hosted site's scan was cut to a 5-prompt slice of `PROMPT_TEMPLATES`
(20 calls total, same as before the model expansion) rather than growing to
40 — proof-script keeps the full 10-prompt set since it isn't
latency-constrained by a live browser tab. A scan now takes several minutes
end to end; a Pro-plan monthly fair-use cap (`PRO_PLAN_MONTHLY_SCAN_LIMIT`,
`_shared/plan.mts`) was added the same change since per-scan Perplexity
cost also went up with the pricier model mix. A scan-complete email
notification was also added the same day (`_shared/email.mts`,
`sendScanCompleteEmail`, called from `run-scan-background.mts` after every
scan finalizes, success or failure) via Resend's plain HTTP API — best-
effort, a failed send is logged but never changes the scan's own
already-persisted status. Sends from `scans@notifications.dizid.com` — this
domain is registered and **DNS-verified with Resend** (`region: eu-west-1`;
DKIM/MX/SPF records live on `dizid.com`'s Netlify-managed DNS zone),
confirmed working end-to-end with a real delivered test email to a
non-owner address the same day, not just the sandbox-restricted
`onboarding@resend.dev` address.

`RESEND_API_KEY`/`RESEND_FROM_EMAIL` are set on the Netlify site (see
"Deployment" below) — `RESEND_API_KEY` is reused from an existing personal
Resend account (also used by other unrelated Dizid projects), not a new
account created for Foreground specifically.

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
  2026-08-13, scan-complete email, sending domain DNS-verified same day —
  see "Update 2026-08-13" note above). `SCAN_PASSPHRASE` was removed
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

