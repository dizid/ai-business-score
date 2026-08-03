# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AIVis: checks whether a business shows up when AI search engines (ChatGPT,
Gemini, via Perplexity's Agent API) are asked about their category, and formats
the result as a cold-email hook. Two implementations share one core:

- **`proof-script/`** (Approach A) — a local CLI, run manually by one person
  against a hand-curated prospect list. No server, no DB, no accounts.
- **The repo root** (Approach B) — a hosted version, deployed to Netlify as
  site `aivis-scan`: a founder-facing form (gated by a passphrase, not a real
  auth system) that optionally auto-fills itself from a single URL, then runs
  a live check and redirects to a shareable result page. The result data is
  encoded directly in the result URL's fragment, so viewing a link never
  re-computes or re-calls the API — and every scan is *also* persisted to a
  Netlify Blobs store (see "Persistence" below) so the founder can browse
  past scans without hoarding links. (Lived under a `web/` subdirectory
  until 2026-08-03, when it was flattened to the repo root — `web/` had
  never been a deliberate monorepo layout, just an artifact of `proof-script/`
  existing first; `proof-script/` is the only thing that still needs to stay
  a separate subdirectory.)
- **`shared/aivis-core.mjs`** — the single source of truth for prompt
  templates, models, brand-detection, and the Perplexity API call. Imported
  by `proof-script/index.mjs`, `netlify/functions/scan.mts`/`enrich.mts`,
  and (since the Vite/Vue migration, 2026-07-29) the Vue app under `src/`.
  Deliberately kept as plain untyped `.mjs` at this exact path —
  `proof-script` runs via plain `node index.mjs` with zero deps and zero
  transpilation, so it cannot load a `.ts` file. Converting or moving this
  file would break proof-script outright; if it ever needs real types, give
  proof-script its own build step first.

The full rationale (why Approach A first, what was rejected, what's deferred)
lives in the design doc at
`~/.gstack/projects/ai-business-score/marc-none-no-git-repo-design-20260728-153615.md`
and its eng-review addendum. Read it before proposing further scope changes —
a test suite and vertical prompt templating are still deliberately deferred
based on evidence gathered there. **The "real database" deferral has since
been reversed** (2026-07-29): the hosted site writes every scan to a Netlify
Blobs store now (see "Persistence" below) — the original reasoning was scoped to
"don't build a DB just to make the stateless-link design work," which still
holds, but it didn't anticipate a second, separate need: a history view the
founder can browse without a database at all wasn't possible, and Blobs was
the lowest-ceremony way to add one (zero external accounts, no connection
string, bundles into the existing Netlify site). Neon Postgres (this
project's usual default per the company CLAUDE.md) was intentionally *not*
used here — provisioning it requires authorizing the Neon MCP connection
interactively, which wasn't available when this was built; revisit if the
data model outgrows a flat key-value store.

**Known limitation (hosted site only):** real Perplexity calls with `web_search`
grounding routinely take 15-20s, sometimes longer. The scan function runs 3
prompts x 2 models = 6 calls in parallel with a 20s per-call timeout and a
~20-30s total budget; individual calls that exceed the timeout are counted as
failed (shown honestly on the result page as "N calls failed") rather than
silently dropped or retried. This is real-world variance, not a bug — don't
"fix" it by adding blind retries without checking current failure rates first.
Each failure's reason (timeout vs. HTTP error vs. malformed response) is
`console.error`'d per-call in `scan.mts` (model + promptIndex + message) —
previously the per-call `error` was captured but discarded, so a real spike
above the expected ~50% rate was undiagnosable from Netlify function logs.
Netlify's synchronous function execution ceiling is not reliably
knowable/configurable from this codebase (docs and support-forum threads
disagree on 10s-default/26s-max vs. a flat 60s — unverified as of
2026-08-02) and there is no `netlify.toml`/in-code config key for it either
way, so `CALL_TIMEOUT_MS` (20000, in `scan.mts`) was deliberately left
as-is rather than bumped speculatively — raising it risks turning a
partial-but-usable result (some calls succeed) into a total function
timeout (zero calls returned), which is a worse failure mode.

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

**Hosted site** (from the repo root): as of the 2026-07-29 Vite/Vue migration,
the hosted site has a real build step:

```bash
npm install       # from the repo root, after any dependency change
npm run dev       # Vite dev server on :5173, @netlify/vite-plugin emulates
                   # functions/blobs/env vars locally (no netlify dev needed)
npm run type-check  # vue-tsc --noEmit
npm run build     # vue-tsc --noEmit && vite build -> dist/
```

Deploys now go through **git-connected Netlify CI** (site `aivis-scan`, team
`dizid`), not the old manual `deploy-site` MCP upload — pushing to the linked
branch triggers Netlify to run `npm run build` itself and publish `dist`.
`netlify.toml` sets `command = "npm run build"`, `publish = "dist"`,
`functions = "netlify/functions"`, `node_bundler = "esbuild"`. Env vars
(`PERPLEXITY_API_KEY`, `SCAN_PASSPHRASE`) are still set on the Netlify site
itself, not read from any local `.env` at the repo root — unaffected by the
build-mechanism change.

No lint config, no test framework anywhere in this repo — `proof-script/`
stays zero-dep, plain `node index.mjs`, no build step (see the aivis-core.mjs
note above for why that constraint is load-bearing). The hosted site's
Netlify Functions (`scan.mts`/`enrich.mts`/`history.mts`) are still bundled
independently by Netlify's own esbuild function bundler at deploy time — they
import `../../shared/aivis-core.mjs` directly and are unaffected by the
frontend's Vite build. Formal automated tests were explicitly deferred (see
eng-review in the design doc) in favor of `--dry-run` as the pre-flight check
for `proof-script/` and `vue-tsc`/manual browser verification for the hosted
site — this started as a same-day, likely-single-use script, not shipped
product code (Approach B has since made it a lot more durable, but the same
low-ceremony bar still applies to test *automation*, not to skipping
verification — see each page's section below for what was actually checked).

## Architecture

### Shared core — `shared/aivis-core.mjs`

The single source of truth, imported by both entry points:

- **Prompt templates** (8, generic brand/competitor substitution only —
  vertical-specific templating was explicitly deferred, see `TODOS.md`) x
  **2 models** (`openai/gpt-5-mini`, `google/gemini-3-flash-preview`).
  `proof-script` uses all 8; the hosted site uses only the first 3 (see the
  timeout note above).
- **Perplexity Agent API client** (`callModel`) — calls
  `POST https://api.perplexity.ai/v1/responses` (the OpenAI-SDK-compatible
  alias for `/v1/agent`), routing both OpenAI- and Google-branded models
  through one Perplexity key via `provider/model-name` addressing. Response
  shape is the OpenAI Responses API shape (`output[].content[].text`) —
  confirmed via live smoke test during `/plan-eng-review`. Takes an optional
  `timeoutMs` (via `AbortController`) — unused by `proof-script`, set to 20s
  by the hosted site since it runs inside a wall-clock-limited serverless
  function.
- **Detection** (`findBrandMention`, `findMentions`) — whole-word,
  case-insensitive regex match on the brand name and a domain-derived alias.
  Presence-only, not sentiment-aware (a negative mention still counts as
  "cited" — both outputs tell the human to skim raw responses before trusting
  the count). Common-word brand names (e.g. "Best") are flagged ambiguous and
  skip auto-detection rather than false-matching everywhere.
- **Aggregation** (`aggregateProspect`) — cited count, completed vs. failed
  call counts (tracked separately so a failed batch doesn't silently read as
  "zero citations"), a heuristic first-mention-order ranking
  (ranked-1 / beaten / not-mentioned) — explicitly labeled as unverified since
  detection is presence-only — and **`competitorTallies`** (per-named-competitor
  `mentionCount`/`beatBrandCount`, computed unconditionally per completed
  response, not gated on the brand itself being cited — a response that
  mentions a competitor while the brand is absent is real scoreboard signal
  and would otherwise be lost).
- **Score** (`computeScore`, `scoreBand`) — 0-100 (or `null` if
  `completedCalls === 0` — never a fake 0; a 0 must mean "genuinely
  invisible," not "the API failed"). Formula: `round(100 * (ranked1Count +
  0.4 * beatenCount) / completedCalls)` — the `0.4` (`SCORE_BEATEN_WEIGHT`)
  is a named, tunable constant giving partial credit for "mentioned but
  beaten." **This reverses an explicit `/office-hours` decision** against
  precise/re-verifiable numeric claims — that reasoning was scoped to
  cold-email copy sent to a skeptical prospect (LLM nondeterminism → a
  re-run showing a different number was a credibility risk); a score shown
  on a link the founder shares with a friend to gauge interest is a
  different audience with no fact-checking motive, so the reversal is
  deliberate, not silent. `proof-script`'s cold-email draft language is
  untouched and stays directional.
- **Advice** (`selectAdvice`) — rule-based/templated, not a live LLM call.
  Returns structured scenario data (`id`, `tone`, small `params`), not
  freeform text; the English copy lives in `src/shared/ScanDetail.vue`'s
  template branches (see below). Deliberately synchronous: an AI-generated-advice call would need
  the aggregated results as input, so it couldn't join the `Promise.all`
  batch — it would add a full sequential 15-20s+ on top of an already
  tight function-timeout budget. Don't add one without new empirical
  timeout testing, the same way the 6-call/20s config was arrived at.
- **Enrichment** (`buildEnrichPrompt`, `parseEnrichmentResponse`) — used only
  by `netlify/functions/enrich.mts` (below), not by `proof-script`.
  `buildEnrichPrompt` asks a model to research a bare URL and return the rest
  of the prospect fields as JSON; `parseEnrichmentResponse` extracts the
  first `{...}` block from the reply (models sometimes wrap it in markdown
  fences) and always returns every field, defaulted to `''`/`[]` rather than
  throwing — a field the model couldn't infer should come back blank for the
  human to fill in, never a parse error that blocks the form.

### `vite.config.ts` — multi-page app, not a Vue-Router SPA

Three independent Vue app instances/entry points (`index.html`, `result.html`,
`history.html`, each with its own `src/<page>/main.ts` + `App.vue`) via
`build.rollupOptions.input` — deliberately not a single-page app with
client-side routing. This preserves the pre-migration URL structure and,
more importantly, keeps `index.html`'s step-2 `<form method="POST"
action="/scan">` a genuine native browser navigation: only that (not a
client-side route change, not `fetch`) reliably carries the `/scan`
redirect's URL fragment through to `result.html`. `src/shared/theme.css`
centralizes the dataviz-skill palette (`--bg`/`--accent`/`--good`/etc.) that
used to be hand-copied into all three pages' `<style>` blocks — page-specific
styles still live in each page's own `App.vue` `<style scoped>`.

### `proof-script/index.mjs` (Approach A)

Adds CLI-specific orchestration on top of the shared core: hand-rolled arg
parser and `.env` loader (no deps), **fail-fast + retry**
(`FailFastTracker`, `callWithRetry` — one retry per call, aborts the whole run
if 3 consecutive calls fail rather than burning through the budget against a
dead key/endpoint), a **concurrency-limited runner** (`runWithConcurrency`,
no `p-limit` dependency), and **output formatting**
(`formatInternalSummary`, `csvRow`) — one Markdown file per prospect in
`results/` (raw responses, a *directional* email draft — deliberately not a
precise re-verifiable number, since LLM responses vary between runs) plus one
row per prospect appended to `tracking.csv` (sent-date/replied/note columns
left blank for manual fill-in). `results/` and `tracking.csv` are gitignored —
run output, not source.

### `netlify/functions/enrich.mts` — auto-fill from a single URL

POST `/enrich`, gated by the same `SCAN_PASSPHRASE` (it also spends real
Perplexity budget: one `web_search`-grounded call). Takes `{ website,
passphrase }` as JSON, asks `openai/gpt-5-mini` to research the site via
`buildEnrichPrompt`, and returns the guessed `brand`/`category`/`use_case`/
`region`/`customer_segment`/`competitors` via `parseEnrichmentResponse`. Two
deliberate choices: (1) it **always returns 200** even when the underlying
call fails (`{ ok: false, error }`) — enrichment failing is never fatal to the
flow, `index.html` just falls through to a blank form, so there's no reason to
make the caller branch on HTTP status *and* a body flag; (2) every returned
field is best-effort and meant to be reviewed, never trusted blindly — this
is a typing-reduction feature, not an auto-submit feature. Nothing here is
persisted; only a completed `/scan` gets saved.

### `netlify/functions/scan.mts` (Approach B)

A Netlify function (TypeScript, V2 format, routed to `/scan` via in-code
`config`). POST-only, gated by `SCAN_PASSPHRASE` (an anti-abuse gate, not real
auth — this is a public URL that costs real money per call). Runs the 6 checks
fully in parallel (`Promise.all`, no retry — a single serverless invocation
doesn't have the CLI's budget for retries), aggregates via the shared core,
computes `score` and `advice` (pure, synchronous, zero added API calls — see
above), then **302-redirects to
`/result.html#d=<base64url-encoded-JSON>`** — the payload includes `id`,
`brand`, `website`, `category`, `citedCount`, `completedCalls`, `failedCalls`,
`ambiguousBrandFlag`, `perPromptRank`, `competitorTallies`, `score`, `advice`,
`rawResponses`, `generatedAt`. The result data lives in the URL fragment
itself, so `result.html` (plain client-side JS, no framework) decodes and
renders it without ever calling the API again. This is deliberate: two views
of the same link always show the same result, sidestepping the
LLM-nondeterminism/credibility risk that came up during `/plan-eng-review`.

**Persistence:** right before redirecting, the same `payload` (plus the
`encoded` string used in the redirect URL) is written to a Netlify Blobs store
named `aivis-scans`, keyed by `payload.id` (a `crypto.randomUUID()`). This
write is wrapped in try/catch and only `console.error`s on failure — it must
never block or fail the redirect the founder is actively waiting on, since the
stateless shareable link already worked without it and shouldn't regress if
Blobs has a bad day. `netlify/functions/history.mts` is the only reader.

`index.html` (thin Vite entry shell, real UI in `src/index/App.vue`)
is the founder-facing input form — a two-step flow: step 1 is just a website
URL (+ passphrase), submitted via `fetch` to `/enrich`; step 2 shows the same
seven fields as before, pre-filled from step 1's response but every field
stays a plain editable `<input>` bound with `v-model`, plus a "skip, fill in
manually" escape hatch that jumps straight to step 2 blank. Step 2's submit
is still a native `<form method="POST" action="/scan">` — the `@submit`
handler updates UI state only and must never call `preventDefault()`, since
only a native browser navigation reliably carries the `/scan` redirect's URL
fragment through (see the `vite.config.ts` note above).

### `src/shared/scanPayload.ts` + `src/shared/ScanDetail.vue`

The result-rendering core, extracted (2026-08-02) out of `result/App.vue` so
`history/App.vue`'s detail pane (below) could reuse it verbatim instead of
hand-copying the score ring/scoreboard/advice-card markup a second time —
the earlier single-copy version was already flagged as a duplication risk
before a second consumer existed.

`scanPayload.ts` holds the types and `validatePayload()`: fail-closed
validation of a scan-result object, extending the same pattern to every
field — `score` bounds-checked 0-100 or `null`; `competitorTallies` capped
at 12 entries with cross-field sanity bounds (`mentionCount <=
completedCalls`, `beatBrandCount <= mentionCount`); `advice` capped at 3
entries, `id`/`tone` checked against fixed enums. `result/App.vue`'s payload
is inherently unsigned/forgeable — anyone can craft a `#d=` link — so this
validation is the only thing standing between a hostile link and whatever
renders; extend it, don't bypass it, when adding fields. `history/App.vue`
runs the same validator over its own (server-authored, not forgeable)
records too, purely for consistency and bounds-safety, not because Blobs
data is untrusted.

`ScanDetail.vue` takes a validated payload as a prop and renders everything
from the brand/website header through the score ring, scoreboard, advice
cards, raw-response `<details>`, and footer. Headline and advice copy render
via Vue template branches (auto-escaping), not raw HTML string
concatenation + `v-html` — removes a whole class of escaping mistakes the
old hand-rolled `esc()` approach depended on getting right every time. Each
`params` field is re-validated individually at render time (not trusted
blindly) so a malformed-but-schema-valid advice item degrades gracefully
instead of throwing. The website link gets an explicit underline (not just
the global `a { color: var(--accent) }` rule) — accent-blue-on-dark alone
wasn't a strong enough tap-target cue on mobile.

### `result.html` — single shareable result page

Thin Vite entry shell; `src/result/App.vue` now only handles decoding
the `#d=` fragment (`b64urlDecode` + `validatePayload` from
`scanPayload.ts`) and the three error states (missing/undecodable/invalid
data) — the actual rendering is `<ScanDetail :payload="data" />`.

### `netlify/functions/history.mts` + `history.html` — master-detail dashboard

POST `/history` (passphrase in the JSON body, not a query string — avoids
leaking it into access logs/browser history) lists every record in the
`aivis-scans` Blobs store, sorted by `generatedAt` descending (plain string
comparison — the field is always an ISO timestamp), and returns each stored
object verbatim (not a projection) — every field `ScanDetail.vue` needs is
already present, no second fetch required.

`history.html` (thin shell; UI in `src/history/App.vue`) is a
passphrase-gated **master-detail dashboard** (rebuilt 2026-08-02 from a flat
link-list): a list pane (search by brand/category, sort by
newest/highest/lowest score — all client-side over the already-fetched
records) and a detail pane rendering the selected scan via the shared
`ScanDetail.vue`. Selecting a row no longer navigates to `/result.html` —
clicking is now in-page state (a `<button>`, not an `<a>`), with a
"Open as shareable link ↗" anchor inside the detail pane for the actual
`/result.html#d=<encoded>` navigation, still replaying the exact `encoded`
string `/scan` persisted rather than re-deriving it. Layout is a CSS grid
two-pane split ≥900px; below that, `.has-selection` toggles which single
pane is visible (list *or* detail, with a "← Back to list" button) — there
is no JS viewport branching, purely a CSS class driven by whether a scan is
selected. The list-row score badge still imports `scoreBand` from
`aivis-core.mjs` rather than re-deriving the 80/50/1 thresholds locally.

Visual design follows the `dataviz` skill's reference palette (chart chrome +
fixed status colors: good/warning/serious/critical), used verbatim, not
re-derived — centralized once in `src/shared/theme.css` (see the
`vite.config.ts` note above). Score ring: hand-rolled SVG circular meter
(`stroke-dasharray`/`stroke-dashoffset`), track color-independent from fill,
banded by `scoreBand()` **imported directly from `aivis-core.mjs`** (no
longer hand-duplicated — the old "this file has no module import graph by
design, keep the two in sync manually" caveat no longer applies now that the
page is a real ES module). Scoreboard: an **emphasis** bar chart (brand in
accent blue, competitors in a de-emphasis gray — "one series is the point,
rest are context," per the skill's form-choice guidance), brand always
pinned first, competitors sorted by `mentionCount` descending. Advice cards:
status-colored left border + an explicit text tag (`Priority`/`Watch
this`/`Working well`/`Also worth noting`) — never color alone, matching the
skill's status-color rule.
