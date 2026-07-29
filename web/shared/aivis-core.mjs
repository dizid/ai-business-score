// Shared AIVis detection + Perplexity API logic — used by both the local
// proof-script (proof-script/index.mjs) and the hosted scan function
// (web/netlify/functions/scan.mjs). Keep this the single source of truth for
// prompt templates, models, brand-detection, and the API call — the two
// callers differ only in orchestration (batch CLI vs. single web request).

// ---------- Prompts (8, generic — brand/competitor substitution only) ----------
// Vertical-adjusted templating explicitly deferred, see TODOS.md.
export const PROMPT_TEMPLATES = [
  (p) => `What's the best ${p.category} for ${p.use_case}?`,
  (p) => `Compare ${p.brand} vs ${p.competitors[0]} vs ${p.competitors[1] ?? p.competitors[0]}.`,
  (p) => `I need a ${p.category} — what do you recommend and why?`,
  (p) => `Top ${p.category} companies in ${p.region}?`,
  (p) => `Is ${p.brand} a good choice for ${p.use_case}? What are the alternatives?`,
  (p) => `What are people saying about ${p.brand} vs ${p.competitors[0]}?`,
  (p) => `Best ${p.category} for ${p.customer_segment}?`,
  (p) => `Who are the leaders in ${p.category}?`,
];

// ---------- Models (2, cheap tier, per office-hours cost model) ----------
export const MODELS = ['openai/gpt-5-mini', 'google/gemini-3-flash-preview'];

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
  return words.length === 1 && (words[0].length <= 4 || COMMON_WORD_STOPLIST.has(words[0]));
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
export async function callModel(apiKey, model, prompt, timeoutMs) {
  const controller = timeoutMs ? new AbortController() : undefined;
  const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const res = await fetch(PPLX_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: prompt,
        tools: [{ type: 'web_search' }],
      }),
      signal: controller?.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} from ${model}: ${body.slice(0, 300)}`);
    }

    const json = await res.json();
    return { text: extractText(json), usage: json.usage ?? null };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for ${model}`);
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
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
// and raw responses for the mandatory manual skim.
export function aggregateProspect(prospect, callResults) {
  const completed = callResults.filter((r) => r.ok);
  const failed = callResults.filter((r) => !r.ok);

  let citedCount = 0;
  let ambiguousBrandFlag = false;
  const perPromptRank = [];

  for (const r of completed) {
    const brandMatch = findBrandMention(r.text, prospect);
    if (brandMatch.ambiguous) ambiguousBrandFlag = true;
    const cited = brandMatch.ambiguous ? false : brandMatch.mentioned;
    if (cited) citedCount++;

    // Heuristic-only ranking: first-mention order between brand and
    // competitors. Detection is presence-only (not sentiment-aware) per the
    // design doc's explicit limitation — this is a starting point for the
    // mandatory manual skim, not a verified rank.
    let rank = 'not-mentioned';
    if (cited) {
      const competitorMatches = prospect.competitors
        .map((c) => findMentions(r.text, c))
        .filter((m) => !m.ambiguous && m.mentioned);
      const beatenBy = competitorMatches.find((m) => m.firstIndex < brandMatch.firstIndex);
      rank = beatenBy ? 'beaten' : 'ranked-1';
    }
    perPromptRank.push({ promptIndex: r.promptIndex, rank });
  }

  return {
    prospect,
    totalCalls: callResults.length,
    completedCalls: completed.length,
    failedCalls: failed.length,
    citedCount,
    ambiguousBrandFlag,
    perPromptRank,
    rawResponses: completed.map((r) => ({ model: r.model, promptIndex: r.promptIndex, text: r.text })),
    totalTokens: completed.reduce((sum, r) => sum + (r.usage?.total_tokens ?? 0), 0),
  };
}

export function requiredProspectFields() {
  return ['brand', 'website', 'competitors', 'category', 'use_case', 'region', 'customer_segment'];
}

export function missingProspectFields(p) {
  return requiredProspectFields().filter(
    (field) => !p[field] || (Array.isArray(p[field]) && p[field].length === 0)
  );
}
