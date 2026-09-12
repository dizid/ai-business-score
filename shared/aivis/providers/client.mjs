// Multi-provider model client — split out of aivis-core.mjs (2026-09-12
// architecture refactor). callModel's dispatch used to be an imperative
// if/switch naming each provider explicitly; it now reads PROVIDER_ADAPTERS
// (registry.mjs) instead, so adding a 5th provider never touches this file.
// This rewrite is a pure restructuring of the dispatch — every branch's
// condition and error message was preserved exactly (see registry.mjs's own
// comment for the asymmetric requireOwnKey behavior this must not flatten),
// and tests/aivis-providers.test.mjs asserts the fallback/missing-key
// behavior specifically to guard against a regression here, since this is
// the code path that spends real API money on every scan.
//
// Until 2026-08-15, every model (regardless of `provider/model` prefix) was
// routed through Perplexity's Agent API gateway — one key, one endpoint,
// one response shape, but meaning every result reflected "what Perplexity
// says GPT-5/Gemini/Claude/Grok would answer," not each provider's own
// product (see how-it-works.html's methodology-disclosure section, added
// the same day this changed). At the CEO's explicit direction, `anthropic/*`,
// `google/*`, and `xai/*` now call each provider's own API directly —
// verified live (not guessed) against each provider's current docs and a
// real smoke-test call with a working key, the same day this shipped. See
// anthropic.mjs/google.mjs/xai.mjs/openai.mjs for each provider's own
// request/response shape detail and shared/CLAUDE.md for the full story.
//
// apiKeys is `{ perplexity, anthropic, google, xai, openai }` — any entry
// can be undefined; a model whose provider has no key throws a clear,
// attributable error (the same "skip and count separately" failure shape
// every other call failure already produces) rather than a confusing
// generic one.
import { withCombinedTimeout } from '../../timeout.mjs';
import { callResponsesShapeApi } from './responsesShapeClient.mjs';
import { PROVIDER_ADAPTERS } from './registry.mjs';

const PPLX_URL = 'https://api.perplexity.ai/v1/responses';

function providerModelId(model) {
  const i = model.indexOf('/');
  return i === -1 ? model : model.slice(i + 1);
}

// timeoutMs is optional — the local proof-script can wait as long as it
// wants, but the hosted scan function (Netlify, hard wall-clock limit) needs
// a bound so one slow web_search call can't blow the whole request. On
// timeout this throws (same shape as any other failure) rather than hanging
// — callers already treat failures as "skip and count separately."
//
// externalSignal (optional, 5th arg) is separate from the internal
// timeoutMs-derived controller: it lets a caller running MANY of these in
// parallel (the hosted scan) impose one shared scan-wide deadline across all
// of them, so a straggler can't drag the whole batch out past a predictable
// bound the way per-call timeouts alone allow (each call gets its own full
// timeoutMs budget regardless of how long the batch has already been
// running). withCombinedTimeout (shared/timeout.mjs) combines both — either
// one aborting aborts the fetch.
export async function callModel(apiKeys, model, prompt, timeoutMs, externalSignal) {
  const { signal, clear } = withCombinedTimeout(timeoutMs, externalSignal);
  const provider = model.split('/')[0];
  const modelId = providerModelId(model);
  try {
    const entry = PROVIDER_ADAPTERS[provider];
    if (entry) {
      const apiKey = apiKeys[provider];
      if (apiKey) {
        return await entry.call(apiKey, modelId, prompt, signal);
      }
      if (entry.requireOwnKey) {
        throw new Error(`No ${entry.keyName} configured for direct call to ${model}`);
      }
      // else: no own key and this provider doesn't require one (currently
      // only 'openai') — falls through to the Perplexity gateway below, so
      // every existing caller that hardcodes `{ perplexity: apiKey }` for
      // 'openai/gpt-5-mini' keeps working unchanged until apiKeys.openai is
      // actually set.
    }
    // Fallback: Perplexity gateway. Reached by any provider with no entry
    // in PROVIDER_ADAPTERS, and by openai/* specifically until
    // apiKeys.openai is configured (see above). Anthropic models called
    // THROUGH Perplexity (legacy path, not used by PROVIDER_ADAPTERS
    // anymore) needed an explicit max_output_tokens; kept here only in case
    // a caller ever passes an anthropic/* model without an apiKeys.anthropic
    // entry and reaches this fallback.
    if (!apiKeys.perplexity) throw new Error(`No PERPLEXITY_API_KEY configured for gateway call to ${model}`);
    return await callResponsesShapeApi(
      PPLX_URL,
      apiKeys.perplexity,
      model,
      prompt,
      signal,
      model.startsWith('anthropic/') ? { max_output_tokens: 2048 } : undefined
    );
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(
        externalSignal?.aborted
          ? `Scan deadline exceeded waiting for ${model}`
          : `Timed out after ${timeoutMs}ms waiting for ${model}`
      );
    }
    throw err;
  } finally {
    clear();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Bounded retry wrapper around callModel — additive, does not change
// callModel itself. proof-script has its own local callWithRetry (1 retry,
// paired with a FailFastTracker circuit-breaker for its long sequential
// prospect list); this is a simpler standalone version for callers that just
// need "try again on failure" without a batch-level circuit-breaker, e.g.
// the hosted site's scan. maxAttempts dropped from 3 to 2 on 2026-08-09 —
// with only 6 calls, losing one to a bad retry chain was a meaningful chunk
// of the data; now that a scan runs many more prompts, each individual call
// matters less to the aggregate score, so it's worth capping the worst-case
// per-call latency (was up to 3 x timeoutMs with zero backoff) instead of
// retrying as aggressively. A short backoff (unlike before) is worth it now
// specifically because firing many calls at once raises the odds that a
// failure is a shared rate-limit response, not isolated flakiness —
// retrying instantly into a live rate limit just compounds it. Skips the
// backoff (and any further attempt) once externalSignal has already fired —
// no point waiting to retry into a deadline that's already passed.
//
// 2026-08-13: live scans (TSMC, Google LLC, Hotel De Nara) were observed
// losing 16-18 of 20 calls to HTTP 429 "request_rate_limit_exceeded" —
// CONCURRENCY_LIMIT's burst of simultaneous calls (see
// run-scan-background.mts) was exceeding Perplexity's actual per-key rate
// limit, and a flat 1s backoff wasn't long enough for that window to clear
// before the retry landed on the same limit again, producing near-total
// scan failure (e.g. a real brand reading as "Invisible / 0" purely from
// rate-limiting, not actual absence). Rate-limit errors now get a longer,
// escalating backoff instead of the flat short one used for other
// failures.
const RATE_LIMIT_BACKOFF_MS = 5000;

// apiKeys: same `{ perplexity, anthropic, google, xai, openai }` shape
// callModel takes — named apiKeys (not apiKey) throughout since 2026-08-15's
// direct-provider migration, see callModel's own comment for the full story.
//
// 2026-08-17: retries are now scoped to HTTP 429 (rate-limit) errors only —
// previously ANY failure, including a plain timeout, got the same up-to-3x
// retry treatment. Under CONCURRENCY_LIMIT=1 (fully sequential, one shared
// scan-wide deadline) that meant a single slow/timed-out call could consume
// up to ~182s (3 attempts x 60s CALL_TIMEOUT_MS + backoff) of the scan's
// budget, starving every other call still queued behind it regardless of
// provider — the exact cascading-timeout gap logged in TODOS.md's
// 2026-08-14 entry, which resurfaced in production via xai/grok-4.6's
// documented 30-50s+ latency running right up against the 60s timeout. A
// timeout is very unlikely to succeed identically on immediate retry the
// way a transient rate-limit response is, so retrying it bought little and
// cost a lot of shared budget. Rate-limit errors still get the full
// escalating-backoff retry treatment, since that's what it was designed for
// and it demonstrably works (see the 2026-08-13 429 incident above).
export async function callModelWithRetry(apiKeys, model, prompt, timeoutMs, maxAttempts = 2, externalSignal) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await callModel(apiKeys, model, prompt, timeoutMs, externalSignal);
      // A recognized-but-empty response (a token-limit cutoff mid web-search
      // tool loop, a content/safety filter, or similar) is not the model
      // genuinely looking and finding nothing — but callers treat any
      // resolved call as a completed check and score it via
      // findBrandMention('', ...), which silently reads as a clean
      // "not-mentioned" and drags the score down for a reason that has
      // nothing to do with real AI visibility. Throwing here routes it
      // through the exact same "skip and count as a failure" path every
      // other error already uses (excluded from completedCalls/
      // perPromptRank, recorded in failures[] with an attributable reason)
      // instead of silently completing. No retry for this, same as any
      // other non-429 failure below — a token cutoff is a property of the
      // prompt/response, not a transient blip an immediate retry would fix.
      if (!result.text || !result.text.trim()) {
        throw new Error(`Model returned an empty response for ${model} — likely a token-limit cutoff or a content/safety filter, not a genuine "not mentioned" result`);
      }
      return result;
    } catch (err) {
      lastErr = err;
      if (externalSignal?.aborted) break;
      if (err.status !== 429) break;
      if (attempt < maxAttempts) {
        await sleep(RATE_LIMIT_BACKOFF_MS * attempt);
      }
    }
  }
  throw lastErr;
}

// Concurrency-limited task runner: a small worker pool (size `limit`) pulls
// from a shared queue instead of firing every task at once via Promise.all.
// Ported from proof-script's local runWithConcurrency (used there to bound
// concurrent calls across its whole prospect list) so the hosted scan can
// use the same pattern to bound concurrent calls WITHIN one scan — added
// 2026-08-09 specifically because firing all of a scan's calls at once (6,
// then briefly 60) is untested against Perplexity's per-key concurrency
// limits and a live user flagged it as a real risk before it was ever
// exercised at the larger count.
export async function runWithConcurrency(tasks, limit, worker) {
  const results = new Array(tasks.length);
  let next = 0;
  async function runner() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await worker(tasks[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, runner));
  return results;
}
