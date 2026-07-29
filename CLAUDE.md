# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AIVis: checks whether a business shows up when AI search engines (ChatGPT,
Gemini, via Perplexity's Agent API) are asked about their category, and formats
the result as a cold-email hook. Two implementations share one core:

- **`proof-script/`** (Approach A) — a local CLI, run manually by one person
  against a hand-curated prospect list. No server, no DB, no accounts.
- **`web/`** (Approach B) — a hosted version: a founder-facing form (gated by a
  passphrase, not a real auth system) that runs a live check and redirects to a
  shareable result page. Still no database — the result data is encoded
  directly in the result URL's fragment, so viewing a link never re-computes or
  re-calls the API. Deployed to Netlify as site `aivis-scan`.
- **`web/shared/aivis-core.mjs`** — the single source of truth for prompt
  templates, models, brand-detection, and the Perplexity API call. Both
  `proof-script/index.mjs` and `web/netlify/functions/scan.mts` import it.
  Physically lives under `web/` (not a project-root `shared/`) because
  Netlify's manual-upload deploy only includes files inside the uploaded
  directory — the function needs it in-tree to bundle correctly.

The full rationale (why Approach A first, what was rejected, what's deferred)
lives in the design doc at
`~/.gstack/projects/ai-business-score/marc-none-no-git-repo-design-20260728-153615.md`
and its eng-review addendum. Read it before proposing scope changes — several
things that look like obvious improvements (a test suite, vertical prompt
templating, a real database) were deliberately deferred based on evidence
gathered there.

**Known limitation (web/ only):** real Perplexity calls with `web_search`
grounding routinely take 15-20s, sometimes longer. The scan function runs 3
prompts x 2 models = 6 calls in parallel with a 20s per-call timeout and a
~20-30s total budget; individual calls that exceed the timeout are counted as
failed (shown honestly on the result page as "N calls failed") rather than
silently dropped or retried. This is real-world variance, not a bug — don't
"fix" it by adding blind retries without checking current failure rates first.

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

**Hosted site** (from `web/`): no local dev command has been set up — changes
are deployed straight to Netlify (site `aivis-scan`, team `dizid`) via the
Netlify MCP tools' `deploy-site` operation, pointed at the `web/` directory.
Env vars (`PERPLEXITY_API_KEY`, `SCAN_PASSPHRASE`) are set on the Netlify site,
not read from any local `.env` in `web/`. `netlify.toml` sets `publish = "."`
and `functions = "netlify/functions"`.

No build step, no lint config, no test framework anywhere in this repo — Node
18+ only (uses native `fetch`; the Netlify function's TypeScript is transpiled
by Netlify's own build, not a local toolchain). No `package.json`, zero npm
dependencies. Formal automated tests were explicitly deferred (see eng-review
in the design doc) in favor of `--dry-run` as the pre-flight check for
`proof-script/` — this started as a same-day, likely-single-use script, not
shipped product code (Approach B has since made it a bit more durable, but the
same low-ceremony bar still applies).

## Architecture

### Shared core — `web/shared/aivis-core.mjs`

The single source of truth, imported by both entry points:

- **Prompt templates** (8, generic brand/competitor substitution only —
  vertical-specific templating was explicitly deferred, see `TODOS.md`) x
  **2 models** (`openai/gpt-5-mini`, `google/gemini-3-flash-preview`).
  `proof-script` uses all 8; `web/` uses only the first 3 (see the timeout
  note above).
- **Perplexity Agent API client** (`callModel`) — calls
  `POST https://api.perplexity.ai/v1/responses` (the OpenAI-SDK-compatible
  alias for `/v1/agent`), routing both OpenAI- and Google-branded models
  through one Perplexity key via `provider/model-name` addressing. Response
  shape is the OpenAI Responses API shape (`output[].content[].text`) —
  confirmed via live smoke test during `/plan-eng-review`. Takes an optional
  `timeoutMs` (via `AbortController`) — unused by `proof-script`, set to 20s
  by `web/` since it runs inside a wall-clock-limited serverless function.
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
  freeform text; the English copy lives in `result.html`'s `ADVICE_COPY`
  lookup. Deliberately synchronous: an AI-generated-advice call would need
  the aggregated results as input, so it couldn't join the `Promise.all`
  batch — it would add a full sequential 15-20s+ on top of an already
  tight function-timeout budget. Don't add one without new empirical
  timeout testing, the same way the 6-call/20s config was arrived at.

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

### `web/netlify/functions/scan.mts` (Approach B)

A Netlify function (TypeScript, V2 format, routed to `/scan` via in-code
`config`). POST-only, gated by `SCAN_PASSPHRASE` (an anti-abuse gate, not real
auth — this is a public URL that costs real money per call). Runs the 6 checks
fully in parallel (`Promise.all`, no retry — a single serverless invocation
doesn't have the CLI's budget for retries), aggregates via the shared core,
computes `score` and `advice` (pure, synchronous, zero added API calls — see
above), then **302-redirects to
`/result.html#d=<base64url-encoded-JSON>`** — the payload includes `brand`,
`website`, `category`, `citedCount`, `completedCalls`, `failedCalls`,
`ambiguousBrandFlag`, `perPromptRank`, `competitorTallies`, `score`, `advice`,
`rawResponses`, `generatedAt`. The result data lives in the URL fragment
itself, so `web/result.html` (plain client-side JS, no framework) decodes and
renders it without ever calling the API again. This is deliberate: two views
of the same link always show the same result, sidestepping the
LLM-nondeterminism/credibility risk that came up during `/plan-eng-review`.
`web/index.html` is the founder-facing input form (plain HTML, native form
POST — not `fetch`, since only a native browser navigation reliably carries a
redirect's URL fragment through).

### `web/result.html` — dashboard rendering

`validatePayload()` extends the same fail-closed pattern for every new field:
`score` bounds-checked 0-100 or `null`; `competitorTallies` capped at 12
entries with cross-field sanity bounds (`mentionCount <= completedCalls`,
`beatBrandCount <= mentionCount`); `advice` capped at 3 entries, `id`/`tone`
checked against fixed enums, and each `params` field re-validated
individually at render time (not trusted blindly) so a malformed-but-schema-
valid advice item degrades gracefully instead of throwing. The payload is
inherently unsigned/forgeable — anyone can craft a `#d=` link — so this
validation is the only thing standing between a hostile link and whatever
renders; extend it, don't bypass it, when adding fields.

Visual design follows the `dataviz` skill's reference palette (chart chrome +
fixed status colors: good/warning/serious/critical), used verbatim, not
re-derived. Score ring: hand-rolled SVG circular meter (`stroke-dasharray`/
`stroke-dashoffset`), track color-independent from fill, banded by
`scoreBand()` (duplicated by hand from `aivis-core.mjs` — this file has no
module import graph by design, see the "no build step" note above; keep the
two in sync manually if the bands ever change). Scoreboard: an **emphasis**
bar chart (brand in accent blue, competitors in a de-emphasis gray — "one
series is the point, rest are context," per the skill's form-choice
guidance), brand always pinned first, competitors sorted by `mentionCount`
descending. Advice cards: status-colored left border + an explicit text tag
(`Priority`/`Watch this`/`Working well`/`Also worth noting`) — never color
alone, matching the skill's status-color rule. `web/index.html`'s palette
mirrors this file's CSS custom properties so the form and result page read as
one product.
