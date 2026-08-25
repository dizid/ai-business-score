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

**Privacy Policy / Terms of Service (`privacy.html`, `terms.html`):**
shipped 2026-08-11 as deliberate drafts carrying a "Draft — have this
reviewed before relying on it for compliance" banner. That banner was
removed 2026-08-24 after Marc requested finalizing the pages, alongside a
founder-led hardening pass — added an operator-identity line ("operated
by Dizid Web Development"), an international-data-transfer note, a
Cookies section (Neon Auth's one essential session cookie, no
tracking/ads), and fixed a real gap where Resend (scan-complete email)
was missing from the "who we share it with" list. **This is not a
substitute for formal legal counsel** — no lawyer has reviewed either
page; ask before assuming these pages are compliance-verified if that
matters for a future decision (e.g. entering a new jurisdiction, an
enterprise deal requiring a DPA).

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
  accounts created for Foreground specifically. **`OPENAI_API_KEY`** — was
  genuinely absent from every Dizid project's `.env` files (checked twice),
  but turned up in `DEV.md` (gitignored scratch notes, never committed —
  a location the `.env`-only searches never covered). **Set on Netlify
  2026-08-25** (`envVarIsSecret: false`) — direct-call code for
  `openai/gpt-5-mini` (see `shared/CLAUDE.md`'s "Multi-provider model
  client" entry) is live-verified, not just written, **and deliberately
  only wired into `run-scan-background.mts`/`proof-script`** — a real
  30.5s-per-call latency (GPT-5 mini's reasoning overhead) 502'd
  `enrich.mts` in production before this was caught by an actual e2e test
  and reverted for the four synchronous-function callers; see that entry
  for the full detail.
  `GOOGLE_PAGESPEED_API_KEY` added 2026-08-19 for Harmonia's Core Web
  Vitals pillar (`shared/harmonia.mjs`) — a **dedicated new GCP project**
  (`GOOGLE_API_KEY`'s existing project doesn't have the PageSpeed Insights
  API enabled, confirmed live via a 403), unlike every other key above.
  Live-verified against the real API before being set, then a fresh manual
  deploy triggered (via Netlify MCP) to make sure this specific deploy's
  function config actually includes it, not just an assumption from the
  next auto-deploy. `STRIPE_SECRET_KEY`/`STRIPE_PRICE_ID`/
  `STRIPE_WEBHOOK_SECRET` (Pro subscription billing, shipped commit
  `5f47127`) were missing from this list until now — a pre-existing doc gap
  backfilled here, not a change to the vars themselves.
  **`STRIPE_SECRET_KEY` is a Stripe *test-mode* key
  (`sk_test_...`), confirmed 2026-08-24** — every Checkout/subscription
  this app has ever completed, including the "live in production" Pro
  plan, has been fake money. Nobody can pay a real dollar until this
  switches to a live-mode key (requires activating live mode on the Stripe
  account — business details, banking — then re-creating live-mode
  equivalents of every Price below and swapping them in). Not done as part
  of this session; a deliberate CEO decision, not an oversight.
  **`STRIPE_PRICE_ID` corrected 2026-08-24**: a direct Stripe API check
  found the existing Price actually charged **$29/month**, not the
  intended amount — a stale placeholder from whenever the subscription
  checkout was first built. Stripe Prices are immutable, so a new Price
  (`price_1U7s8r8gBja0qkMxwx4bqoSD`) was created at the now-decided
  **$199/month** and the env var swapped to it (verified live via a direct
  curl to `create-checkout-session`'s sibling function pattern — see
  `netlify/functions/CLAUDE.md`'s "Billing (Stripe)" section).
  **`STRIPE_TOPUP_PRICE_ID`** (added 2026-08-23) — **created and set
  2026-08-24**: `price_1U7s9K8gBja0qkMx9TV9czH4`, $19/10 scans.
  **`STRIPE_SINGLE_SCAN_PRICE_ID`** (new 2026-08-24, Milestone 2 of
  `~/.claude/plans/we-need-alot-of-transient-floyd.md`) — `price_1U7s9C8gBja0qkMxi4bLhk3X`,
  $19 one-time. All three Price creations and the env var updates were
  followed by a fresh manual deploy (`netlify build && netlify deploy
  --prod`) and verified live: curled all three checkout-session functions
  post-deploy (none 500 anymore), and for the single-scan one, completed a
  full valid anonymous request and fetched the resulting Checkout session
  back from Stripe's API to confirm `amount_total: 1900` and the correct
  webhook-matching metadata shape.
  **`VITE_GA4_MEASUREMENT_ID`** (new 2026-08-25, Google Analytics) — Marc
  created the GA4 property himself (Claude has no Analytics Admin API
  access or browser/OAuth session to do this) and provided the Measurement
  ID, `G-HZKLBPKH81`, **set on Netlify 2026-08-25**. GA4 tracking code is
  wired into every page (`index.html`, `how-it-works.html`, `privacy.html`,
  `terms.html`, `app.html`, and `scripts/build-blog.mjs`'s blog template),
  guarded to no-op safely if this var is unset or doesn't start with `G-`.
  `router.ts`'s `afterEach` sends a manual `page_view` on every
  client-side route change inside `app.html` (gtag's automatic pageview
  only fires once on initial load). `privacy.html` was updated the same
  day to disclose Google Analytics as a data processor and its cookie use
  — see its "Cookies" section. **Deploy gotcha found the same day**: the
  Netlify MCP's `deploy-site` operation caches by git commit, not by the
  local `deployDirectory` contents — repeated manual deploys after setting
  this var kept re-publishing the same stale pre-var build ("all files
  already uploaded by a previous deploy with the same commits") until a
  real new commit forced a genuine git-triggered rebuild. If an env var
  change ever seems not to be taking effect on this site, push a real
  commit rather than trusting a manual redeploy call to pick it up.
  **Known gap, not built**: no cookie-consent mechanism exists anywhere on
  the site, which is a real question mark for EU visitors now that a
  non-essential tracking cookie is in play, same spirit as the
  privacy/terms hardening pass's own disclaimer.

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

### `vite.config.ts` — six entries (corrected 2026-08-24; this section had
drifted out of date since the marketing-push pivot re-added `index.html`
under a different role than the paragraph below used to describe)

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
- **`index.html`, `how-it-works.html`, `privacy.html`, `terms.html`** — plain
  static HTML/CSS, not Vue mounts, sharing `public/marketing-theme.css`.
  `index.html` was retired in Milestone 5 (the passphrase-gated scan form,
  described below) but **reintroduced later as a different page** for the
  monetization/marketing push: the public landing page at `/`, since
  several major AI crawlers (GPTBot, PerplexityBot, ClaudeBot) don't
  execute client-side JS and the pitch has to exist as real HTML.
  `how-it-works.html`/`privacy.html`/`terms.html` were converted from
  `app.html` SPA routes to static entries the same way, for the same
  crawlability reason — see `vite.config.ts`'s own header comment for the
  full per-file rationale, which is more current than this file on this
  specific point.

The old passphrase-gated scan form and history list (the original,
different `index.html` + `history.html`) were **retired** in Milestone 5
once the authenticated app shell covered the same ground — deleted along
with their `src/index`/`src/history` Vue apps and the then-fully-redundant
`netlify/functions/history.mts` (superseded by `GET /companies` +
`GET /companies/:id`). If you're looking for the "why not a SPA" reasoning
that used to live here, it only ever applied to those retired pages and
`result.html` — read `src/app/router.ts`'s own comment for why `app.html`
doesn't have that constraint.

### `/blog` — a seventh, non-Vite content mechanism (added 2026-08-24)

Not a `vite.config.ts` entry — `scripts/build-blog.mjs` runs as a
**post**-`vite build` step (`package.json`'s `build` script:
`vue-tsc --noEmit && vite build && node scripts/build-blog.mjs`), reading
markdown+frontmatter from `content/blog/*.md` and writing plain static
`dist/blog/<slug>/index.html` pages plus `dist/blog/index.html`, styled by
the new `public/blog-theme.css` (extends `marketing-theme.css`'s tokens,
no new palette). Folder+`index.html` output means Netlify serves clean
`/blog/<slug>/` URLs with zero `netlify.toml` redirects needed, unlike the
four pages above. Also appends each post's URL into `dist/sitemap.xml` at
build time. **Important operational gap**: because this only runs as part
of `npm run build`, `/blog` is NOT served by `npm run dev` — testing it
locally means building and serving `dist/` with a static file server, not
the usual dev-server workflow. `content/blog/*.md` are repurposed,
web-article versions of the original `content/articles/*.md` drafts
(LinkedIn/Substack + X-thread format, still there unchanged for social
posting) — the blog versions drop the X-thread section and swap the
"link in the comments" sign-off for direct on-site links. **The essay
content itself was still marked "needs Marc's read before posting" in the
source drafts** — building the pipeline and converting the copy doesn't
imply the content has been reviewed.

