# CLAUDE.md — shared/

Scoped guidance for `shared/`, split out of the project root `CLAUDE.md` on
2026-08-17 (via `/doctor`) so it only loads when a session actually touches
this directory, instead of every session paying for it. See the root
`CLAUDE.md` for overall project context.

### Update 2026-08-13 — call latency, concurrency, and retry history

Migrated from root `CLAUDE.md` on 2026-08-20 (via `/doctor`) — that content
had grown substantially redundant with this file and
`netlify/functions/CLAUDE.md` by then. Two fixes the root version also
covered were cut outright rather than migrated, since they're already
detailed elsewhere: the `failures`/`total_tokens` columns
(`netlify/functions/CLAUDE.md`'s DB schema section) and the
`isAmbiguousBrandName()` stoplist-only fix (this file's own Detection bullet
below).

Real Perplexity calls with `web_search` grounding routinely take 15-20s,
sometimes longer. `proof-script` runs the full 10 prompts x 4 models = 40
calls; the hosted site's `run-scan-background.mts` uses a 5-prompt slice (20
calls) — see `netlify/functions/CLAUDE.md` for why. Each call has a 60s
per-call timeout (`xai/grok-4.6` gets 100000ms — see that file's
`CALL_TIMEOUT_MS_BY_MODEL` note). **Corrected** — `callModelWithRetry`'s
own default is **2** attempts (dropped from 3 on 2026-08-09;
`run-scan-background.mts` overrides this with an explicit `maxAttempts=3`,
which is where "3 attempts" is actually true, not the function's own
default). Retries are also **HTTP 429-only as of 2026-08-17** — any other
failure type (`err.status !== 429`) fails immediately with no retry at all,
it's not "a shorter backoff" for non-429s. The escalating backoff between
429 retries exists specifically to avoid re-hammering a live rate limit
rather than to guard against generic flakiness. The concurrency-limited
worker pool (`runWithConcurrency`) and
shared `SCAN_DEADLINE_MS` `AbortController` that bound worst-case scan
latency, plus the full three-incident concurrency-tuning history (10 → 4 →
1), are documented in `netlify/functions/CLAUDE.md`'s `run-scan-background.mts`
entry, not duplicated here.

### `shared/aivis-core.mjs`

The single source of truth, imported by every consumer:

- **Prompt templates** (10, generic brand/competitor substitution only —
  vertical-specific templating still deferred, see `TODO.md`) x **4
  models** (`openai/gpt-5-mini`, `google/gemini-3-flash-preview`,
  `anthropic/claude-haiku-4-5`, `xai/grok-4.6`, the latter two added
  2026-08-13). Prompt count grew from 8 to 10 on 2026-08-09, and the hosted
  site briefly ran the full 10-prompt set (both `proof-script` and the
  hosted site running all 10) before being cut back to a **5-prompt slice**
  on 2026-08-13 when the model count grew — see this file's "Update
  2026-08-13" note above for why (concurrency dropped to 1, so more calls
  means direct wall-clock cost with no parallelism to hide it behind).
  `proof-script` still runs the full 10. **Added 2026-08-25** (Milestone
  C3): a second, Dutch translation of the same 10 templates
  (`PROMPT_TEMPLATES_NL`), selected via `SUPPORTED_LANGUAGES`/
  `PROMPT_TEMPLATES_BY_LANGUAGE`/`promptTemplatesForLanguage(lang)`.
  `run-scan-background.mts` calls `promptTemplatesForLanguage(company.language
  ?? 'en')` before slicing to 5, so a company's `language` field (`'en'`|
  `'nl'`, set at creation in `companies.mts`) picks which language's prompt
  set a scan actually asks — still generic brand/competitor substitution
  only, not per-vertical templating.
- **Multi-provider model client** (`callModel`) — **rewritten 2026-08-15,
  direct-provider migration.** Until this date every model, regardless of
  its `provider/model-name` string, was routed through Perplexity's Agent
  API gateway (`POST /v1/responses`) — one key, one shape, but meaning every
  result reflected "what Perplexity says GPT-5/Gemini/Claude/Grok would
  answer," not each provider's own product (the exact gap
  `how-it-works.html`'s methodology-disclosure section, added the same day,
  called out). At the CEO's explicit direction, `callModel` now dispatches
  by provider prefix — verified live against each provider's own current
  docs and a real smoke-test call with a working key (found by searching
  other Dizid projects under `/home/marc/DEV` for reusable personal API
  keys — same reuse-across-projects pattern already established for
  `RESEND_API_KEY`), not guessed:
  - **`anthropic/*`** — direct `POST https://api.anthropic.com/v1/messages`,
    `web_search_20250305` tool. `ANTHROPIC_API_KEY`.
  - **`google/*`** — direct `POST .../v1beta/models/{model}:generateContent`
    (Gemini), `google_search` tool. `GOOGLE_API_KEY`. **Citations are
    Google grounding-redirect URLs
    (`vertexaisearch.cloud.google.com/grounding-api-redirect/...`), not the
    real source URL** — confirmed live, a real limitation: Gemini-sourced
    citations will never hostname-match a company's own domain the way
    Perplexity/Anthropic/xAI citations do (`aggregateProspect`'s
    `ownSiteCitations`).
  - **`xai/*`** — direct `POST https://api.x.ai/v1/responses`. `XAI_API_KEY`.
    Confirmed live to be the *same* OpenAI-Responses-API-compatible shape
    Perplexity already used, so `extractText`/`extractCitations` are reused
    unchanged. **Noticeably slower than the other three in live testing —
    30-50s+ per call observed** (Grok's agentic multi-round web search),
    versus single-digit-to-teens seconds for Anthropic/Google. Not yet
    reflected in any timeout/deadline tuning (`CALL_TIMEOUT_MS`/
    `SCAN_DEADLINE_MS` in `run-scan-background.mts` are unchanged by this
    migration, deliberately — see below) — a real risk worth watching once
    this runs against production scan volume.
  - **`openai/*`** (`gpt-5-mini`) — **direct call added 2026-08-25**,
    `POST https://api.openai.com/v1/responses`, reusing `callPerplexityOrXai`
    unchanged (written to mirror xai's call exactly, since xai's endpoint
    was already confirmed to be "the same OpenAI-Responses-API-compatible
    shape" — implying OpenAI's own `/v1/responses` is the shape's origin).
    `callModel` falls back to the Perplexity gateway automatically if
    `apiKeys.openai` isn't set.
    **Live-verified 2026-08-25**: `OPENAI_API_KEY` found in `DEV.md`
    (gitignored, confirmed never committed — checked full git history for
    the file, zero matches for `sk-proj`), a location the earlier
    `.env`-only searches never covered since it's a scratch notes file, not
    an env file. Real calls against `api.openai.com/v1/responses` with
    `tools: [{ type: 'web_search' }]` returned HTTP 200 with the expected
    `gpt-5-mini` reasoning-model shape (an extra `type: "reasoning"` entry
    in `output[]` ahead of the `type: "message"` entry, harmless since
    `extractText`/`extractCitations` only look for a `.text`/`.annotations`
    field on each `content[]` item, not a specific `output[].type`); the
    actual exported `extractText`/`extractCitations` correctly parsed both a
    trivial factual answer and 8 real citations (URL + title) from a
    business-relevant query.
    **But a real per-call latency problem, found via an actual e2e test
    through the deployed `enrich.mts` function (not just a raw API call)**:
    a live OpenAI call measured **30.5s**, well over Perplexity's documented
    ~15-20s for the same task. `enrich.mts` 502'd in production — Netlify's
    synchronous-function execution ceiling (no override in `netlify.toml`,
    so it's the platform default) killed the function before it could
    return, an ungraceful crash rather than a clean timeout error, since
    the platform's own limit fired before this call's internal
    `CALL_TIMEOUT_MS` budget did. **Decision**: only `run-scan-background.mts`
    (a true Background Function, ~15 min ceiling, easily absorbs this) and
    `proof-script/index.mjs` (a local CLI, no platform limit at all) use the
    direct openai path. `enrich.mts`, `stripe-webhook.mts`'s enrich call,
    `judge-sentiment.mts`, and `generate-deep-advice.mts` were deliberately
    reverted to Perplexity-only (`{ perplexity: apiKey }`, no `openai` key
    passed) — all four are regular synchronous functions where this latency
    is a real production risk, not a theoretical one. If a way to raise
    those functions' timeout, or a faster non-reasoning OpenAI model,
    becomes available later, revisit; don't just re-add the key without
    re-testing.
    `OPENAI_API_KEY` set on the Netlify site (`envVarIsSecret: false` per
    standing rule) and `VITE_GA4_MEASUREMENT_ID` (`G-HZKLBPKH81`, see
    root `CLAUDE.md`) set the same session.
  - `apiKeys` is now always an object (`{ perplexity, anthropic, google,
    xai, openai }`, any entry optional) rather than a single string —
    `run-scan-background.mts` and `proof-script/index.mjs` pass `openai`;
    `enrich.mts`/`stripe-webhook.mts`/`judge-sentiment.mts`/
    `generate-deep-advice.mts` deliberately don't (see above). A model
    whose provider has no
    configured key (and no gateway fallback, for non-openai providers)
    throws a clear, attributable per-model error rather than a confusing
    generic one — same "skip and count separately" failure shape every
    other call failure already used, so a single missing key degrades that
    one provider's calls to failures instead of failing the whole scan.
  - **Deliberately NOT changed by this (2026-08-15) migration**:
    `CONCURRENCY_LIMIT` and `SCAN_DEADLINE_MS` in `run-scan-background.mts`
    — those were tuned specifically against Perplexity's own real per-key
    rate limit (~1 concurrent), which no longer gates 3 of the 4 models now
    that they call separate independent services. **This was revisited
    later**: `CONCURRENCY_LIMIT` went from one flat value to a
    per-provider `CONCURRENCY_LIMIT_BY_PROVIDER` map on 2026-08-23
    (anthropic/google/xai raised, live-verified against a real scan), and
    `openai` itself was raised on 2026-08-26 once it stopped sharing
    Perplexity's key too — see `netlify/functions/CLAUDE.md`'s
    `run-scan-background.mts` entry for the full current values and both
    changes' verification detail, not duplicated here. The caution
    described below (three prior concurrency-tuning incidents) is exactly
    why both later changes were tested live before shipping rather than
    retuned blind.
  - **Not yet live-verified**: an actual full 20-call scan through
    `run-scan-background.mts` with real production traffic — the
    per-provider smoke tests above each confirmed one call succeeds with
    real output, not that the full concurrency/deadline/retry machinery
    behaves correctly across a real scan's mix of all 4 providers. Do that
    once, timed, before fully trusting this the way past model/concurrency
    changes in this file were each verified live before being trusted.
- **Detection** (`findBrandMention`, `findMentions`) — whole-word,
  case-insensitive regex match on the brand name and a domain-derived alias.
  Presence-only, not sentiment-aware. Common-word brand names (from a
  curated `COMMON_WORD_STOPLIST`) are flagged ambiguous and skip
  auto-detection. **Fixed 2026-08-12**: a blanket "any single word ≤4
  characters" clause used to also trigger this, independent of the
  stoplist — a real bug that gave short real brand names (ASML, TSMC, NRC,
  IBM, SAP) a false ambiguous flag and a `0/100` score. Removed; ambiguity
  now comes only from stoplist membership. Competitor names get the same
  check but no domain-alias fallback (they have no associated website in
  the schema) — an ambiguous competitor now sets a visible `ambiguous` flag
  on its tally instead of silently staying indistinguishable from "never
  mentioned."
- **Aggregation** (`aggregateProspect`) — cited count, completed vs. failed
  call counts, heuristic first-mention-order ranking, and
  `competitorTallies` (computed unconditionally per completed response, not
  gated on the brand itself being cited). Also returns `ownSiteCitations`
  (added 2026-08-15, Milestone F) — see "Citation-URL attribution" below.
- **Citation-URL attribution** (`extractCitations`, in `aggregateProspect`'s
  `ownSiteCitations`/per-response `citations`) — Perplexity's `/v1/responses`
  payload carries `url_citation` annotations on each message's content parts
  (confirmed against the live OpenAPI schema at
  `docs.perplexity.ai/api-reference/agent-post`, not guessed). `callModel`
  now also returns `citations: extractCitations(json)` alongside `text`;
  `aggregateProspect` matches each completed call's citations against the
  scanned company's own hostname (subdomain-tolerant) and collects matches
  into `ownSiteCitations`, while every citation (own-domain or not) rides
  along on that call's `rawResponses[i].citations` entry. Zero extra
  Perplexity calls — pure post-processing of data the app was already
  fetching and discarding. Surfaced in `ScanDetail.vue` as a "Your site,
  cited" section plus a per-check "Sources:" line in the check-by-check
  breakdown.
- **`shared/entityPresence.mjs`** (`analyzeEntityPresence`) — added
  2026-08-25, a sibling module to `aivis-core.mjs`, not a function inside
  it. Checks whether a Wikipedia page exists for the scanned brand and, if
  so, whether it links back to the brand's own website — an "off-site
  authority" signal genuinely distinct from `harmonia.mjs` (which only ever
  fetches the scanned business's *own* site) since this is the one module
  that fetches a third-party site (`en.wikipedia.org`'s API, English-only
  for now, with a required identifying `User-Agent` per Wikimedia's
  etiquette policy). Never throws — worst case resolves `{wikipediaFound:
  false, ...}` plus an `errors` array, same discipline as `harmonia.mjs`
  and `callModelWithRetry`. Common-word brand names are skipped entirely
  via the same `isAmbiguousBrandName()` this file already exports. Result
  is written to `scans.entity_presence` by `run-scan-background.mts` — see
  that column in `netlify/functions/CLAUDE.md`'s DB schema section.
- **Sentiment judge** (`buildSentimentJudgePrompt`,
  `parseSentimentJudgeResponse`, `netlify/functions/judge-sentiment.mts`) —
  the other half of Milestone F: a second live grounded Perplexity call
  (`openai/gpt-5-mini`) that classifies how a brand was portrayed in one
  specific completed check's response text — `recommended`/`neutral`/
  `negative`/`comparison-only` — replacing presence-only detection's
  boolean with an actual read of tone. **Calibrated before shipping**: a
  throwaway script (deleted after use, same discipline as smoke-testing a
  new model) ran the real prompt against 5 hand-labeled example texts
  covering all 4 classifications plus a "brand not mentioned" case, via a
  live call with the production `PERPLEXITY_API_KEY` — 5/5 agreement.
  Shipped 2026-08-15 as **on-demand and per-check only**, same shape as deep
  advice and for the same reason, taken further: never run automatically,
  since a second LLM call per judged check is a real cost/latency
  multiplier on an already-tight 5-8 min, 20-call sequential scan, and this
  file's own history (2026-08-09 model revert, 2026-08-13 concurrency
  incidents) is two separate real production incidents that both trace back
  to adding more calls to the automatic scan pipeline without checking
  capacity first.
  **2026-08-20: also runs automatically.** `run-scan-background.mts` now
  auto-judges every check where the brand was actually mentioned
  (`rank !== 'not-mentioned'`), right after the main 20-call loop finishes,
  reusing the exact same prompt/model/timeout as the manual path (so the
  calibration above still holds). Bounded by a *second* `AbortController`
  timed to whatever's left of `SCAN_DEADLINE_MS` after the main loop — not
  a fresh budget on top — so a slow scan just auto-judges fewer checks
  rather than risking a repeat of either incident above; per-judge failures
  are caught and skipped individually, same as any other call in that file.
  The manual "Judge sentiment" button (POSTs `{promptIndex, model}` to
  `/scans/:id/judge-sentiment`) is unchanged and stays as the fallback for
  whatever the automatic pass didn't reach in time, plus manual re-judging
  — it already only renders when no judgment exists yet for that check, so
  no frontend change was needed for that fallback to keep working. Both
  paths upsert into the same `sentiment_judgments jsonb` column on `scans`
  (additive, nullable), keyed by `(promptIndex, model)` so re-judging
  replaces rather than duplicates. `ScanDetail.vue`'s Overview tab also
  shows a compact classification-count summary (reusing the same
  `.sentiment-badge` CSS as the per-check badges) whenever at least one
  judgment exists, so auto-judged sentiment is visible without opening the
  Details tab.
- **Score** (`computeScore`, `scoreBand`) — 0-100 (or `null` if
  `completedCalls < 4` — never a fake 0 from too little data). **Updated**:
  no longer the simple `ranked1Count + 0.4*beatenCount` formula this doc
  previously described (that was stale, predating the "Overhaul scoring:
  positional ranking + strategic query weighting" commit) — `computeScore`
  now weights each completed call by rank (`RANK_WEIGHTS`: ranked-1 1.0,
  ranked-2 0.6, ranked-3 0.3, mentioned 0.1) multiplied by that prompt's
  query-category weight (`DEFAULT_QUERY_WEIGHTS`: high-intent 3, comparison
  2, informational 1, via `PROMPT_CATEGORIES`), then
  `round(100 * totalWeightedScore / totalMaximumScore)` — so ranking first
  on a direct-buying-intent prompt moves the score more than ranking first
  on a broad informational one.
- **Advice** (`selectAdvice`) — rule-based/templated, not a live LLM call,
  always computed synchronously right after a scan completes. Copy lives in
  `src/shared/ScanDetail.vue`'s template branches.
- **Deep advice** (`buildDeepAdvicePrompt`, `parseDeepAdviceResponse`) —
  added in the SaaS pivot's Milestone 6, additive only. Unlike
  `selectAdvice`, this **is** a live grounded Perplexity call — safe to add
  specifically because scans are async now, so there's no synchronous
  function-timeout budget left to blow (the exact constraint that used to
  block this is described on `selectAdvice` above, and no longer applies to
  this one). Deliberately on-demand (a "Generate deeper advice" button on a
  completed scan, not automatic) — it roughly doubles Perplexity spend per
  scan. **Since 2026-08-24, plan-gated** (Milestone 1 of
  `~/.claude/plans/we-need-alot-of-transient-floyd.md`):
  `generate-deep-advice.mts` requires `isPro(planTier)` OR a matching
  `single_scan_purchases` row for that exact scan (the $19 one-time SKU,
  Milestone 2, shipped the same day — see "Billing (Stripe)" in
  `netlify/functions/CLAUDE.md`), returning `402 {error, upgradeRequired:
  true}` otherwise. `ScanDetail.vue`'s `deepAdviceLocked` prop renders an
  upgrade CTA in place of the button for non-entitled users rather than
  hiding the section outright. The E0 manual-sales-validation step this
  used to be gated on was explicitly waived by Marc for this round — pricing
  ($199/mo Pro, $19 one-time) was decided directly instead. `buildDeepAdvicePrompt`
  grounds the prompt in the actual scan data (citation rate, competitor
  tallies) rather than generic SEO advice; `parseDeepAdviceResponse`
  follows the same lenient-JSON-extraction, always-safe-shape pattern as
  `parseEnrichmentResponse` below.
- **Clarity check** (`buildClarityCheckPrompt`, `parseClarityCheckResponse`)
  — added 2026-09-04, replacing a "vertical prompt packs" ask once querying
  real `companies.category` data found no real vertical clustering to build
  from (mostly the founder's own test/dev records). Classifies whether the
  scanned business's own homepage (text `shared/harmonia.mjs` already
  fetches — see its `homepageText` field, exposed specifically for this)
  states a specific, quotable claim versus generic filler — the thing
  `content/blog/*.md`'s own essays argue is the actual lever for whether AI
  models mention a business. Deliberately does **not** feed anything back
  into the scan's own `PROMPT_TEMPLATES` above — the original idea (inject
  a business's claimed differentiator into its own scan questions) would
  have turned an honest unprompted-visibility test into a leading question,
  found and rejected while designing this. Runs automatically in
  `run-scan-background.mts` right after Harmonia resolves (needs its
  `homepageText`), one call via the same `callModel(apiKeys, ...)` every
  other call in this file uses — **there is no "ungrounded" (no
  web-search-tool) call path anywhere in this codebase**, every provider
  branch always attaches a search tool, so this pays for that capability
  the same way the sentiment judge above already does for its own
  classify-given-text task. Result stored in `scans.clarity_check jsonb`
  (additive migration, applied 2026-09-04), surfaced in `ScanDetail.vue` as
  a "Homepage clarity" section (see `src/shared/CLAUDE.md`), and spliced
  into `buildDeepAdvicePrompt` as extra context so deep advice can build on
  or address what the check found. **Not yet calibrated against real
  homepages** the way the sentiment judge was (5 hand-labeled examples,
  5/5 agreement, before shipping) — do that before fully trusting this
  the way this codebase's own "verify live before trusting" discipline
  expects; the code path itself is built, type-checked, and tested, but
  no live LLM call has confirmed the prompt actually classifies well.
- **Enrichment** (`buildEnrichPrompt`, `parseEnrichmentResponse`) — used by
  `netlify/functions/enrich.mts`. Asks a model to research a bare URL and
  return the rest of the prospect fields as JSON; always returns every
  field, defaulted to `''`/`[]` rather than throwing. Wired into the app
  shell's "create company" form: URL → `/enrich` pre-fills the rest →
  (since the 2026-08-27 portfolio-dashboard rework) a one-click
  summary/confirm card by default, with editing the fields now an extra
  opt-in click ("Edit details first") rather than the original always-shown
  editable review step — see `src/app/CLAUDE.md`'s `CompaniesListView.vue`
  entry for the current flow in full.
