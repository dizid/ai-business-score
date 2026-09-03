# xai/grok-4.6 scan timeout investigation

Investigation triggered 2026-08-17 by a screenshot of a real production scan
showing all 5 `xai/grok-4.6` checks failing with `Timed out after 60000ms
waiting for xai/grok-4.6`. This doc captures the root-cause research and the
candidate solutions discussed, for continuation on another machine.

## Root cause

`run-scan-background.mts:147` sets one flat `CALL_TIMEOUT_MS = 60000` shared
by all four models in `MODELS` (`shared/aivis-core.mjs`). `aivis-core.mjs`'s
own `MODELS` comment documents that `xai/grok-4.6` is structurally slower
than the other three — "30-50s+ typical, versus single-digit-to-teens
seconds for Anthropic/Google" — because Grok does agentic multi-round web
search rather than a single lookup. Its typical latency already sits right
against the 60s ceiling, so a meaningful fraction of calls tip over it. In
the screenshot, all 5 of that scan's xai calls did.

This is not a new bug — it's the second half of an already-diagnosed
problem tracked in `TODO.md`:

- **2026-08-14**: a live scan lost 15/20 calls because one slow call could
  retry 3x at 60s each (~182s worst case), fully serialized under
  `CONCURRENCY_LIMIT=1`, starving every other queued call before the shared
  10-minute `SCAN_DEADLINE_MS` fired. Logged, deliberately not fixed at the
  time ("log it, decide later").
- **2026-08-17** (already shipped, confirmed live in the code): two
  containment fixes landed —
  1. `callModelWithRetry` (`shared/aivis-core.mjs`) now retries only on HTTP
     429 (rate-limit) errors — a timeout is no longer retried, capping one
     stuck call's cost at ~60s instead of ~182s.
  2. `run-scan-background.mts`'s task queue is now built model-major (all
     of model A's prompts, then all of model B's, ...) instead of
     prompt-major. `MODELS`' existing order already puts `xai/grok-4.6`
     last, so a slow xai run now only eats into xai's own remaining checks
     instead of starving openai/google/anthropic checks queued behind it.

That fix worked — it stopped xai from taking down other providers' checks.
**It never addressed why xai times out in the first place.** The
screenshot that triggered this investigation is exactly that remaining gap:
containment succeeded (only xai failed), but xai itself still fails
consistently because a flat 60s cutoff is too short for a model whose own
documented normal-case latency brushes or exceeds it. `TODO.md`'s
2026-08-17 entry itself notes the live re-verification scan to confirm this
was never run — this screenshot is that missing data point.

## Solution options considered

### Option 1 — give xai/grok-4.6 its own longer per-call timeout

Change `callModel`/`callModelWithRetry` (`shared/aivis-core.mjs`) to accept
a per-model timeout instead of one flat value shared by every provider.
Keep `CALL_TIMEOUT_MS = 60000` as the default in `run-scan-background.mts`,
but give `xai/grok-4.6` something like `100000` (100s) — enough margin over
its documented 30-50s+ range.

**Needs verification before trusting**: with `CONCURRENCY_LIMIT=1` and
model-major queueing, xai's 5 calls run last, against whatever's left of
the 600000ms (10 min) `SCAN_DEADLINE_MS` after the 15 faster calls finish.
No real timing data exists yet for how much budget that actually leaves —
needs a live timed scan, not an assumption. `SCAN_DEADLINE_MS` may need a
modest bump too (Background Functions allow up to 900000ms) if the first
change alone isn't enough — but that's a second knob, matching this
codebase's own "one knob at a time, verify live before trusting"
discipline (see the 2026-08-15 and 2026-08-17 entries in `TODO.md`), so
only pull it if live data shows it's needed.

**Deliberately not doing, at least not first**: re-touching
`CONCURRENCY_LIMIT` (unrelated to this specific failure, already a
separate flagged follow-up), or reintroducing retry-on-timeout scoped to
xai only (would partially undo the fix that just shipped 2026-08-17 for a
documented reason).

### Option 2 — drop grok-4.6, add a different/faster model

Discussed as an alternative to tuning timeouts around a structurally slow
model. Candidates researched (via public docs/search — **none of these are
live-verified**, see caveat below):

1. **`perplexity/sonar`** — Perplexity's own native fast-search model,
   routed through the exact gateway/key already in use
   (`PERPLEXITY_API_KEY`), zero new provider integration, zero new secret.
   Documented as built for low-latency grounded answers, with tunable
   search depth (low/medium/high) to trade thoroughness for speed. Lowest
   risk of the candidates: no new code path in `callModel`'s provider
   switch.
2. **`xai/grok-4-1-fast-non-reasoning`** — if this exact ID is real and
   live on the existing `XAI_API_KEY`, a same-provider drop-in for
   `xai/grok-4.6`: a "fast, non-reasoning" tier that skips the heavy
   multi-round agentic search that's the actual root cause of Grok's
   slowness, while keeping xAI as one of the 4 AI surfaces (no diversity
   lost). Zero code change beyond the model string.
3. Un-integrated providers (Mistral, Cohere) with web-search tools exist
   but would need new API keys and a new `callModel` branch — more risk,
   lowest priority unless #1/#2 don't pan out.

**Caveat, stated plainly because this codebase has been burned by exactly
this before**: these model ID strings came from web search, not a live
call — the same failure mode behind the 2026-08-09 incident (4 model IDs
sourced from a changelog turned out wrong, reverted the same day). Nothing
here should be trusted until it's actually called once with a real key.

## Why competitors look instant (context, not confirmed research)

Raised alongside the above: informed inference about how this class of
tool typically achieves apparent-instant results, not research into any
specific named competitor (none were named). Likely mechanisms:

1. **Pre-computed, not on-demand** — scan a panel of brands/queries on a
   schedule in the background, serve a cached result instantly on lookup,
   the way SEO tools show "instant" data that was actually crawled
   earlier. This app's design is the opposite: a live grounded call at
   request time.
2. **Real parallelism** — this app is forced to `CONCURRENCY_LIMIT=1`
   because of one low-tier Perplexity key's ~1 concurrent-call limit
   (confirmed via live burst-testing, see `TODO.md`'s 2026-08-13 entry). A
   higher-tier key or provider-native keys with real rate limits allow
   parallel dispatch, so wall time is the slowest single call, not the sum
   of 20 sequential ones.
3. **Cheaper/non-agentic calls** — a plain "does the model already know
   this brand" query without live web-search tool use is inherently fast;
   agentic grounding (what this app relies on for accuracy, and what makes
   Grok slow specifically) trades speed for a real-time answer.

## Smoke-test script (throwaway, not committed)

A disposable Node script was written to test the Option 2 candidates
against real API keys, one call each, timed, following this codebase's own
established pattern ("a throwaway script, deleted after use, calling
`callModel` directly"). No API keys were available in the session that
produced this doc, so it was handed off unrun. Reconstruct it as follows if
needed (imports `callModel` directly from `shared/aivis-core.mjs`, does not
touch the app or get committed):

```js
// Throwaway smoke test for Grok-replacement candidates — delete after use.
// Run: PERPLEXITY_API_KEY=... XAI_API_KEY=... node smoke-test-models.mjs
import { callModel } from '../shared/aivis-core.mjs'; // adjust path as needed

const apiKeys = {
  perplexity: process.env.PERPLEXITY_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  google: process.env.GOOGLE_API_KEY,
  xai: process.env.XAI_API_KEY,
};

// None of these IDs are confirmed real — that's what this script is for.
const candidates = [
  'perplexity/sonar',
  'perplexity/sonar-pro',
  'xai/grok-4-1-fast-non-reasoning',
  'xai/grok-4-fast',
  'xai/grok-4.6', // baseline for comparison
];

const prompt = "What's the best CRM software for small businesses?";

for (const model of candidates) {
  const start = Date.now();
  try {
    const result = await callModel(apiKeys, model, prompt, 90000);
    const ms = Date.now() - start;
    console.log(
      `OK   ${model.padEnd(32)} ${String(ms).padStart(6)}ms  citations=${result.citations?.length ?? 0}  ` +
        `text="${result.text.slice(0, 80).replace(/\n/g, ' ')}..."`
    );
  } catch (err) {
    const ms = Date.now() - start;
    console.log(`FAIL ${model.padEnd(32)} ${String(ms).padStart(6)}ms  ${err.message}`);
  }
}
```

## Next steps

**RESOLVED, same day (2026-08-17)** — Option 1 was taken: `run-scan-background.mts`
now defines `CALL_TIMEOUT_MS_BY_MODEL`, giving `xai/grok-4.6` 100000ms
instead of the shared 60000ms `CALL_TIMEOUT_MS` (per `TODO.md`'s
2026-08-17 entry, matching step 3 below). The steps below are kept as the
investigation's original record, not a still-open decision.

1. Run the smoke-test script above (or similar) with real API keys against
   the Option 2 candidates — confirm which model IDs are actually valid and
   how fast they really are, before writing any code that depends on them.
2. Based on results, either:
   - Implement Option 1 (per-model timeout for `xai/grok-4.6`) if keeping
     it is preferred, plus a live timed scan to confirm the remaining
     `SCAN_DEADLINE_MS` budget after the other 3 models finish is enough; or
   - Implement Option 2 (swap `xai/grok-4.6` for a verified faster
     candidate) in `MODELS` (`shared/aivis-core.mjs`), adjusting
     `CALL_TIMEOUT_MS` if the replacement's real latency differs from the
     default.
3. Log whichever path is taken in `TODO.md`, matching the dated
   `STATUS`-entry pattern already used for every prior tuning change in
   this file.
