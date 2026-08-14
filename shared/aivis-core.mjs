// Shared AIVis detection + Perplexity API logic — used by both the local
// proof-script (proof-script/index.mjs) and the hosted scan function
// (web/netlify/functions/scan.mjs). Keep this the single source of truth for
// prompt templates, models, brand-detection, and the API call — the two
// callers differ only in orchestration (batch CLI vs. single web request).

// A `category` string is free-typed by the founder (or auto-inferred) and
// isn't guaranteed to read as a clean noun phrase — e.g. "Sport, boxing".
// Splicing that straight into "What's the best {category} for..." produces
// a grammatically broken prompt that confuses the model into asking a
// clarifying question instead of answering (observed live 2026-08-09 with
// category "Sport, boxing" → gpt-5-mini got stuck on "do you mean 'is
// boxing the best sport'?"). Normalizing comma/slash-joined categories into
// a single " / "-joined phrase keeps templates 0 and 2 grammatical either way.
function normalizeCategory(category) {
  return category.split(/[,/]+/).map((s) => s.trim()).filter(Boolean).join(' / ');
}

// ---------- Prompts (10, generic — brand/competitor substitution only) ----------
// Vertical-adjusted templating explicitly deferred, see TODOS.md. Grew from
// 8 to 10 on 2026-08-09 (added 8/9 below) after the hosted site's original
// 3-prompt subset (0-2, the most generically-worded of the set) read as too
// narrow/generic to a live user — rather than rewriting 0-2, the fix is to
// widen the query-intent variety (criteria-based, switcher-intent) and have
// the hosted site run the full set like proof-script always has (see
// run-scan-background.mts).
export const PROMPT_TEMPLATES = [
  (p) => `What's the best ${normalizeCategory(p.category)} option for ${p.use_case}?`,
  (p) => `Compare ${p.brand} vs ${p.competitors[0]} vs ${p.competitors[1] ?? p.competitors[0]}.`,
  (p) => `I need a good ${normalizeCategory(p.category)} option — what do you recommend and why?`,
  (p) => `Top ${p.category} companies in ${p.region}?`,
  (p) => `Is ${p.brand} a good choice for ${p.use_case}? What are the alternatives?`,
  (p) => `What are people saying about ${p.brand} vs ${p.competitors[0]}?`,
  (p) => `Best ${p.category} for ${p.customer_segment}?`,
  (p) => `Who are the leaders in ${p.category}?`,
  (p) => `What should I look for when choosing a ${normalizeCategory(p.category)}, and which brands do that well?`,
  (p) => `I'm looking to switch away from ${p.competitors[0]} — what's a good ${normalizeCategory(p.category)} alternative?`,
];

// ---------- Models (4, cheap tier, live-verified) ----------
// Briefly grew to 6 on 2026-08-09 (4 unverified additions sourced from a web
// search of Perplexity's changelog, since docs.perplexity.ai itself was
// unreachable through this network's egress policy to smoke-test directly)
// — reverted same day after that combined with the 10-prompt expansion to
// push per-scan calls to 60, an untested load. 'openai/gpt-5-mini' and
// 'google/gemini-3-flash-preview' were the only two confirmed against a
// real Perplexity call at that point (see PPLX_URL's comment above —
// live smoke-tested 2026-07-28).
//
// 2026-08-13: grew from 2 to 4, this time smoke-tested one at a time before
// being trusted, per the discipline the 2026-08-09 revert established.
// 'anthropic/claude-haiku-4-5' and 'xai/grok-4.6' were both confirmed live
// against a real single-call smoke test first (a throwaway script, deleted
// after use). The Anthropic call initially failed outright — HTTP 400
// "max_output_tokens is required when using Anthropic models" — fixed by
// having callModel send that field only for anthropic/* models (see below).
//
// The SAME smoke-testing pass also found something much bigger than the
// model additions: Perplexity's real per-key concurrency limit is ~1, not
// the 4 this file's callers were already using. Bursts of 2-4 concurrent
// calls — even across different providers — failed 50-83% of the time with
// HTTP 429, while fully sequential (no overlap) calls succeeded 100%. That
// means the CONCURRENCY_LIMIT=4 shipped earlier the same day (itself a fix
// for an even worse CONCURRENCY_LIMIT=10 incident) was ALSO still silently
// dropping a large fraction of calls to 429 — see
// run-scan-background.mts's CONCURRENCY_LIMIT comment for the resulting
// fix (concurrency dropped to 1, i.e. fully sequential).
export const MODELS = [
  'openai/gpt-5-mini',
  'google/gemini-3-flash-preview',
  'anthropic/claude-haiku-4-5',
  'xai/grok-4.6',
];

// ---------- NEW: Prompt Categorization for Strategic Weighting ----------
export const PROMPT_CATEGORIES = [
  'high-intent',      // 0: Best option for use case
  'comparison',       // 1: Brand vs competitor
  'high-intent',      // 2: General recommendation
  'informational',    // 3: Top companies in region
  'comparison',       // 4: Good choice + alternatives
  'comparison',       // 5: What people are saying (reputation)
  'high-intent',      // 6: Best for customer segment
  'informational',    // 7: Leaders in category
  'high-intent',      // 8: Criteria-based choice
  'high-intent',      // 9: Switching from competitor
];

// ---------- Common-word stoplist for brand-name ambiguity flag ----------
// Design doc: "common-word or ambiguous brand names (e.g. a brand literally
// called 'Best' or 'Prime') get flagged for skip-auto-detection and a manual
// read instead" — a naive string match on a name like "Best" would match
// nearly every response regardless of whether the brand was actually meant.
const COMMON_WORD_STOPLIST = new Set([
  'best', 'prime', 'top', 'first', 'plus', 'pro', 'go', 'now', 'here',
  'home', 'local', 'quick', 'fast', 'easy', 'simple', 'smart', 'the',
  'one', 'you', 'we', 'us', 'it', 'new', 'good', 'great', 'super',
]);

export function isAmbiguousBrandName(name) {
  const words = name.trim().toLowerCase().split(/\s+/);
  return words.length === 1 && COMMON_WORD_STOPLIST.has(words[0]);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Accepts either a bare domain ("acme.com") or a full URL
// ("https://acme.com/path") and normalizes to a full clickable URL.
export function normalizeUrl(input) {
  const trimmed = input.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// Full URL or bare domain -> bare hostname, no protocol/www/path.
// "https://www.acmeplumbing.example.com/path" -> "acmeplumbing.example.com"
export function hostnameOf(input) {
  const url = normalizeUrl(input);
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return input.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
  }
}

// "acmeplumbing.example.com" -> "acmeplumbing"
export function domainAlias(website) {
  return hostnameOf(website).split('.')[0];
}

export function findMentions(text, name) {
  if (isAmbiguousBrandName(name)) {
    return { ambiguous: true, mentioned: null, firstIndex: -1 };
  }
  const pattern = new RegExp(`\\b${escapeRegex(name)}\\b`, 'i');
  const match = text.match(pattern);
  return { ambiguous: false, mentioned: !!match, firstIndex: match ? match.index : -1 };
}

// Brand match with a fallback: if the brand name itself is too ambiguous to
// auto-detect (e.g. "Best"), try the domain-derived alias instead, which is
// far less likely to collide with common English words.
export function findBrandMention(text, prospect) {
  const primary = findMentions(text, prospect.brand);
  if (!primary.ambiguous) return primary;
  const alias = domainAlias(prospect.website);
  const aliasMatch = findMentions(text, alias);
  if (!aliasMatch.ambiguous) return aliasMatch;
  return primary; // both ambiguous — genuinely needs manual read
}

// ---------- Perplexity Agent API client ----------
// Endpoint + provider/model-name addressing verified against live docs AND a
// live smoke-test call during /plan-eng-review, 2026-07-28. Uses the
// /v1/responses OpenAI-SDK-compatible alias — response shape confirmed live:
// output[].content[].text.
const PPLX_URL = 'https://api.perplexity.ai/v1/responses';

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
// running). AbortSignal.any (Node 20+) combines both — either one aborting
// aborts the fetch.
export async function callModel(apiKey, model, prompt, timeoutMs, externalSignal) {
  const controller = timeoutMs ? new AbortController() : undefined;
  const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  const signals = [controller?.signal, externalSignal].filter(Boolean);
  const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
  try {
    const requestBody = {
      model,
      input: prompt,
      tools: [{ type: 'web_search' }],
    };
    // Anthropic models reject the request outright without this (confirmed
    // live, 2026-08-13: HTTP 400 "max_output_tokens is required when using
    // Anthropic models") — the other providers don't need it and default
    // sensibly, so it's only added for that one provider rather than always.
    if (model.startsWith('anthropic/')) {
      requestBody.max_output_tokens = 2048;
    }
    const res = await fetch(PPLX_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(`HTTP ${res.status} from ${model}: ${body.slice(0, 300)}`);
      // Attached so callModelWithRetry can back off harder specifically on
      // 429 (rate limit) instead of treating it the same as any other
      // failure — see that function's comment.
      err.status = res.status;
      throw err;
    }

    const json = await res.json();
    return { text: extractText(json), usage: json.usage ?? null };
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
    if (timer) clearTimeout(timer);
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
const RETRY_BACKOFF_MS = 1000;
const RATE_LIMIT_BACKOFF_MS = 5000;

export async function callModelWithRetry(apiKey, model, prompt, timeoutMs, maxAttempts = 2, externalSignal) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callModel(apiKey, model, prompt, timeoutMs, externalSignal);
    } catch (err) {
      lastErr = err;
      if (externalSignal?.aborted) break;
      if (attempt < maxAttempts) {
        const backoff = err.status === 429 ? RATE_LIMIT_BACKOFF_MS * attempt : RETRY_BACKOFF_MS;
        await sleep(backoff);
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

// Defensive extraction: try the confirmed-live OpenAI-Responses-API shape
// first, then chat-completions-style as a fallback, then fail loudly rather
// than silently returning garbage into a cold email or a public result page.
export function extractText(json) {
  if (typeof json.output_text === 'string') return json.output_text;
  if (Array.isArray(json.output)) {
    const chunks = [];
    for (const item of json.output) {
      if (Array.isArray(item.content)) {
        for (const c of item.content) {
          if (typeof c.text === 'string') chunks.push(c.text);
        }
      }
    }
    if (chunks.length) return chunks.join('\n');
  }
  if (json.choices?.[0]?.message?.content) return json.choices[0].message.content;
  throw new Error(`Could not extract text from response — unexpected shape: ${JSON.stringify(json).slice(0, 300)}`);
}

// ---------- Aggregation ----------
// Shared by both callers: takes prospect + array of { ok, text?, usage?,
// error?, model, promptIndex } and produces cited counts, heuristic ranking,
// per-competitor tallies, and raw responses for the mandatory manual skim.
export function aggregateProspect(prospect, callResults) {
  const completed = callResults.filter((r) => r.ok);
  const failed = callResults.filter((r) => !r.ok);

  let citedCount = 0;
  let ambiguousBrandFlag = false;
  const perPromptRank = [];
  const competitorTallies = prospect.competitors.map((name) => ({
    name,
    mentionCount: 0,
    beatBrandCount: 0,
    ambiguous: false,
  }));

  for (const r of completed) {
    const brandMatch = findBrandMention(r.text, prospect);
    if (brandMatch.ambiguous) ambiguousBrandFlag = true;
    const cited = !brandMatch.ambiguous && brandMatch.mentioned;
    if (cited) citedCount++;

    const allMentions = [];

    if (cited) {
      allMentions.push({ name: prospect.brand, index: brandMatch.firstIndex, isBrand: true });
    }

    prospect.competitors.forEach((c, i) => {
      const m = findMentions(r.text, c);
      if (m.ambiguous) {
        competitorTallies[i].ambiguous = true;
        return;
      }
      if (m.mentioned) {
        allMentions.push({ name: c, index: m.firstIndex, isBrand: false });
        competitorTallies[i].mentionCount++;
      }
    });

    allMentions.sort((a, b) => a.index - b.index);

    let rankValue;
    const brandPosition = allMentions.findIndex((m) => m.isBrand);

    if (brandPosition === -1) {
      rankValue = 'not-mentioned';
    } else {
      for (let i = 0; i < brandPosition; i++) {
        const competitorName = allMentions[i].name;
        const competitorIndex = prospect.competitors.indexOf(competitorName);
        if (competitorIndex !== -1) {
          competitorTallies[competitorIndex].beatBrandCount++;
        }
      }

      const rankNumber = brandPosition + 1;
      if (rankNumber === 1) {
        rankValue = 'ranked-1';
      } else if (rankNumber === 2) {
        rankValue = 'ranked-2';
      } else if (rankNumber === 3) {
        rankValue = 'ranked-3';
      } else {
        rankValue = 'mentioned';
      }
    }

    perPromptRank.push({ promptIndex: r.promptIndex, rank: rankValue });
  }

  return {
    prospect,
    totalCalls: callResults.length,
    completedCalls: completed.length,
    failedCalls: failed.length,
    citedCount,
    ambiguousBrandFlag,
    perPromptRank,
    competitorTallies,
    rawResponses: completed.map((r) => ({ model: r.model, promptIndex: r.promptIndex, text: r.text })),
    // Per-call failure detail (model/prompt/why) — restores what commit
    // 522eb63 shipped and 74afa41 accidentally deleted the next day during
    // an unrelated "flatten repo" refactor. Truncated to 300 chars: error
    // text is free-form (HTTP body, gateway message), not a bounded field.
    failures: failed.map((r) => ({ model: r.model, promptIndex: r.promptIndex, error: String(r.error).slice(0, 300) })),
    totalTokens: completed.reduce((sum, r) => sum + (r.usage?.total_tokens ?? 0), 0),
  };
}

// ---------- Score ----------
// 0-100, based on positional rank. Being mentioned 1st gets full credit;
// 2nd/3rd get partial, decaying credit. Being mentioned but not in the top 3
// still provides a small signal. A score of 0 means "genuinely invisible
// across N real checks," while a null score means "the API failed and we
// have no data."
const RANK_WEIGHTS = {
  'ranked-1': 1.0,
  'ranked-2': 0.6,
  'ranked-3': 0.3,
  mentioned: 0.1,
};

// A scan is only valid enough to score if at least this many checks succeeded.
// This prevents a single lucky roll on a mostly-failed scan from producing a
// deceptively high score.
const MIN_COMPLETED_CALLS_FOR_SCORE = 4;

// Default weights if none are provided by the user.
export const DEFAULT_QUERY_WEIGHTS = {
  'high-intent': 3,
  comparison: 2,
  informational: 1,
};

export function computeScore(perPromptRank, completedCalls, queryWeights = DEFAULT_QUERY_WEIGHTS) {
  if (completedCalls < MIN_COMPLETED_CALLS_FOR_SCORE) return null;

  let totalWeightedScore = 0;
  let totalMaximumScore = 0;

  // Group ranks by prompt index to know how many models ran for each prompt.
  const completedPrompts = new Map();
  for (const r of perPromptRank) {
    if (!completedPrompts.has(r.promptIndex)) {
      completedPrompts.set(r.promptIndex, []);
    }
    completedPrompts.get(r.promptIndex).push(r.rank);
  }

  completedPrompts.forEach((ranks, promptIndex) => {
    const category = PROMPT_CATEGORIES[promptIndex] || 'informational';
    const queryWeight = queryWeights[category] || 1;

    const promptWeightedScore = ranks.reduce((sum, rank) => {
      return sum + (RANK_WEIGHTS[rank] || 0);
    }, 0);

    totalWeightedScore += promptWeightedScore * queryWeight;

    // The max possible score for this prompt is 1.0 (ranked-1) * number of models * queryWeight
    totalMaximumScore += ranks.length * queryWeight;
  });

  if (totalMaximumScore === 0) return 0;

  return Math.round(100 * (totalWeightedScore / totalMaximumScore));
}

// Presentation band for a score — used to pick color/label, kept as a pure
// mapping so result.html and any future caller stay in sync with one table.
export function scoreBand(score) {
  if (score === null) return 'unavailable';
  if (score >= 80) return 'leading';
  if (score >= 50) return 'visible';
  if (score >= 1) return 'weak';
  return 'invisible';
}

// ---------- Tailored advice (rule-based, not a live LLM call) ----------
// Returns structured scenario data (id/tone/params), not freeform text — the
// English copy lives in result.html's ADVICE_COPY lookup, same pattern the
// page already uses for its hardcoded headline sentences. This keeps the
// FACT selected frozen at scan time (a shared link never changes what it
// shows) while wording can improve later without invalidating old links.
// Deliberately synchronous/instant: adding a live "advice" LLM call here
// would need the aggregated results as input, so it couldn't join the
// existing parallel batch — it would add a full sequential 15-20s+ on top of
// a function-timeout budget that was already hard-won empirically. Ambiguous
// brand name and failed calls are NOT advice cards — they're data-quality
// caveats shown as warning banners elsewhere, not business findings.
export function selectAdvice(agg) {
  if (agg.completedCalls === 0) {
    return [{ id: 'no-data', tone: 'neutral', params: {} }];
  }

  const ranked1 = agg.perPromptRank.filter((r) => r.rank === 'ranked-1').length;
  const beaten = agg.perPromptRank.filter((r) =>
    ['ranked-2', 'ranked-3', 'mentioned'].includes(r.rank)
  ).length;
  const cards = [];

  if (agg.citedCount === 0) {
    cards.push({ id: 'zero-citations', tone: 'critical', params: { completedCalls: agg.completedCalls } });
  } else if (beaten > 0 && ranked1 === 0) {
    const topRival = [...agg.competitorTallies].sort((a, b) => b.beatBrandCount - a.beatBrandCount)[0];
    cards.push({
      id: 'consistently-beaten',
      tone: 'warning',
      params: {
        beaten,
        completedCalls: agg.completedCalls,
        topCompetitorName: topRival && topRival.beatBrandCount > 0 ? topRival.name : null,
      },
    });
  } else if (ranked1 === agg.completedCalls) {
    cards.push({ id: 'leading', tone: 'positive', params: { completedCalls: agg.completedCalls } });
  } else {
    cards.push({
      id: 'mixed',
      tone: 'neutral',
      params: {
        ranked1,
        beaten,
        notMentioned: agg.completedCalls - ranked1 - beaten,
        completedCalls: agg.completedCalls,
      },
    });
  }

  const topRival = [...agg.competitorTallies].sort((a, b) => b.mentionCount - a.mentionCount)[0];
  if (topRival && topRival.mentionCount > 0 && cards.length < 3) {
    cards.push({
      id: 'top-rival',
      tone: 'neutral',
      params: { name: topRival.name, mentionCount: topRival.mentionCount, completedCalls: agg.completedCalls },
    });
  }

  return cards.slice(0, 3);
}

// ---------- Enrichment (auto-fill prospect fields from a URL) ----------
// One Perplexity web_search call that researches a site and guesses the
// rest of the scan form's fields, so the founder can start from a single
// URL instead of typing seven fields by hand. Best-effort by design: every
// field comes back empty rather than guessed wildly when the model isn't
// confident, since a wrong guess the user doesn't notice is worse than an
// empty box they have to fill in themselves (auto-fill must stay optional
// and editable, never authoritative).
export function buildEnrichPrompt(website) {
  return `Research the company at ${website}. Based on their website and anything else you can find about them online, respond with ONLY a JSON object (no markdown fences, no commentary before or after) with these fields:
{
  "brand": "the company's brand/business name",
  "category": "the general category a customer would search for, e.g. 'emergency plumber' or 'project management software'",
  "use_case": "a concrete scenario someone in this category is trying to solve, e.g. 'a burst pipe at home'",
  "region": "the city, country, or market they primarily serve",
  "customer_segment": "who typically buys from them, e.g. 'homeowners' or 'small marketing teams'",
  "competitors": ["2-3 real, named competing companies or brands in the same category"]
}
Leave a field as an empty string (or empty array for competitors) if you can't confidently determine it from the site. Do not invent facts.`;
}

// Lenient JSON extraction: models sometimes wrap JSON in markdown fences or
// add a stray sentence before/after — strip both rather than failing the
// whole enrichment over formatting. Always returns every field (defaulted
// empty), so the caller can spread the result straight into form fields
// without further null-checking.
export function parseEnrichmentResponse(text) {
  const empty = { brand: '', category: '', use_case: '', region: '', customer_segment: '', competitors: [] };
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return empty;
  try {
    const parsed = JSON.parse(match[0]);
    return {
      brand: typeof parsed.brand === 'string' ? parsed.brand.trim() : '',
      category: typeof parsed.category === 'string' ? parsed.category.trim() : '',
      use_case: typeof parsed.use_case === 'string' ? parsed.use_case.trim() : '',
      region: typeof parsed.region === 'string' ? parsed.region.trim() : '',
      customer_segment: typeof parsed.customer_segment === 'string' ? parsed.customer_segment.trim() : '',
      competitors: Array.isArray(parsed.competitors)
        ? parsed.competitors.filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim()).slice(0, 3)
        : [],
    };
  } catch {
    return empty;
  }
}

// Human labels for all 10 PROMPT_TEMPLATES above, in order. Originally
// deep-advice-only and covering just the hosted site's old 3-prompt subset;
// now covers the full set and is also imported by ScanDetail.vue for the
// check-by-check breakdown, so the same wording appears in both places
// rather than drifting out of sync.
export const PROMPT_LABELS = [
  'category-recommendation query ("what\'s the best [category] for [use case]?")',
  'brand-vs-competitor comparison query',
  'general recommendation query ("I need a good [category], what do you recommend?")',
  'regional "top companies" query ("top [category] companies in [region]?")',
  'alternatives query ("is [brand] good for [use case]? what are the alternatives?")',
  'reputation query ("what are people saying about [brand] vs [competitor]?")',
  'segment-specific recommendation query ("best [category] for [customer segment]?")',
  'category-leaders query ("who are the leaders in [category]?")',
  'criteria-based query ("what should I look for when choosing a [category]?")',
  'switcher-intent query ("switching away from [competitor] — what\'s a good alternative?")',
];

// Groups perPromptRank (one entry per completed model call, keyed by which
// of the 3 templates produced it) into a per-template breakdown, so
// buildDeepAdvicePrompt can ground steps in specifics like "you're missing
// from the comparison-style query" instead of only aggregate counts.
function summarizePerPromptRank(perPromptRank) {
  const byPrompt = new Map();
  for (const r of perPromptRank || []) {
    if (!byPrompt.has(r.promptIndex)) {
      byPrompt.set(r.promptIndex, {
        'ranked-1': 0,
        'ranked-2': 0,
        'ranked-3': 0,
        mentioned: 0,
        'not-mentioned': 0,
      });
    }
    const counts = byPrompt.get(r.promptIndex);
    if (counts[r.rank] !== undefined) {
      counts[r.rank]++;
    }
  }
  return [...byPrompt.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([promptIndex, counts]) => {
      const total = Object.values(counts).reduce((s, v) => s + v, 0);
      const label = PROMPT_LABELS[promptIndex] || `prompt ${promptIndex}`;

      const parts = [];
      if (counts['ranked-1'] > 0) parts.push(`ranked first in ${counts['ranked-1']}`);
      if (counts['ranked-2'] > 0) parts.push(`ranked 2nd in ${counts['ranked-2']}`);
      if (counts['ranked-3'] > 0) parts.push(`ranked 3rd in ${counts['ranked-3']}`);
      const otherMentions = counts.mentioned;
      if (otherMentions > 0) parts.push(`mentioned (but not top 3) in ${otherMentions}`);
      if (counts['not-mentioned'] > 0) parts.push(`not mentioned in ${counts['not-mentioned']}`);

      if (parts.length === 0) {
        return `- ${label}: no data (of ${total} checks)`;
      }
      return `- ${label}: ${parts.join(', ')} (of ${total} checks)`;
    })
    .join('\n');
}

// ---------- Deep advice (on-demand, live LLM call) ----------
// Milestone 6 of the SaaS-pivot plan: unlike selectAdvice() above, this DOES
// make a live grounded Perplexity call — safe to add now specifically
// because scans are async (Milestone 5), so there's no synchronous
// function-timeout budget left to blow. Deliberately on-demand (a button on
// the completed-scan view, not automatic) rather than run for every scan:
// it roughly doubles Perplexity spend per scan, and pricing/plan limits
// aren't finalized yet — the CEO's call, not a default to bake in silently.
export function buildDeepAdvicePrompt(scan) {
  const competitorLines = (scan.competitorTallies || [])
    .map((c) => `- ${c.name}: mentioned in ${c.mentionCount}/${scan.completedCalls} checks, beat ${scan.brand} in ${c.beatBrandCount}`)
    .join('\n');
  const perPromptLines = summarizePerPromptRank(scan.perPromptRank);

  return `You are a world-class SEO and AI-search-visibility strategist. A brand called "${scan.brand}" (${scan.website}, category: "${scan.category}") was just checked for how often it comes up when AI assistants (ChatGPT, Gemini) are asked about their category.

Results: cited in ${scan.citedCount ?? 0} of ${scan.completedCalls ?? 0} completed checks, visibility score ${scan.score ?? 'unavailable'}/100.
Competitor tallies:
${competitorLines || '(no named competitors)'}

Breakdown by query type:
${perPromptLines || '(no per-query data)'}

Based on this, respond with ONLY a JSON object (no markdown fences, no commentary before or after) with this shape:
{
  "steps": [
    { "title": "short actionable step", "reasoning": "1-2 sentences on why this helps AI search visibility specifically", "difficulty": "Easy" | "Medium" | "Hard" }
  ]
}
Provide up to 5 steps, ordered by highest-leverage first. Ground each step in the actual data above — reference specific competitors, the citation rate, and which query type(s) from the breakdown the brand is weak in — rather than generic SEO advice.`;
}

// Same lenient-extraction, always-safe-shape pattern as
// parseEnrichmentResponse() — a malformed or unparseable response degrades
// to an empty steps list rather than throwing, since deep advice is a
// bonus on top of the rule-based advice that's already showing.
export function parseDeepAdviceResponse(text) {
  const empty = { steps: [] };
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return empty;
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.steps)) return empty;
    const validDifficulties = new Set(['Easy', 'Medium', 'Hard']);
    return {
      steps: parsed.steps
        .filter((s) => s && typeof s.title === 'string' && s.title.trim())
        .slice(0, 5)
        .map((s) => ({
          title: s.title.trim().slice(0, 200),
          reasoning: typeof s.reasoning === 'string' ? s.reasoning.trim().slice(0, 500) : '',
          difficulty: validDifficulties.has(s.difficulty) ? s.difficulty : 'Medium',
        })),
    };
  } catch {
    return empty;
  }
}

export function requiredProspectFields() {
  return ['brand', 'website', 'competitors', 'category', 'use_case', 'region', 'customer_segment'];
}

export function missingProspectFields(p) {
  return requiredProspectFields().filter(
    (field) => !p[field] || (Array.isArray(p[field]) && p[field].length === 0)
  );
}
