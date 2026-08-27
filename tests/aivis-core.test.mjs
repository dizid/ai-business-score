import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  aggregateProspect,
  buildSentimentJudgePrompt,
  callModelWithRetry,
  computeScore,
  extractCitations,
  findBrandMention,
  findMentions,
  isAmbiguousBrandName,
  parseAnthropicResponse,
  parseGoogleResponse,
  parseSentimentJudgeResponse,
  runWithConcurrency,
  scoreBand,
  selectAdvice,
} from '../shared/aivis-core.mjs';

describe('isAmbiguousBrandName', () => {
  it('flags single-word common-word names from the stoplist', () => {
    expect(isAmbiguousBrandName('Best')).toBe(true);
    expect(isAmbiguousBrandName('best')).toBe(true); // case-insensitive
    expect(isAmbiguousBrandName('Prime')).toBe(true);
    expect(isAmbiguousBrandName('Go')).toBe(true);
  });

  // Regression: a blanket "single word <= 4 characters" rule used to flag
  // any short brand name regardless of whether it was an actual common
  // word, giving real brands a false ambiguous flag and a 0/100 score.
  // Fixed 2026-08-12 — ambiguity now comes only from stoplist membership.
  it('does not flag real short brand names that happen to be <= 4 characters', () => {
    expect(isAmbiguousBrandName('ASML')).toBe(false);
    expect(isAmbiguousBrandName('TSMC')).toBe(false);
    expect(isAmbiguousBrandName('NRC')).toBe(false);
    expect(isAmbiguousBrandName('IBM')).toBe(false);
    expect(isAmbiguousBrandName('SAP')).toBe(false);
  });

  it('never flags multi-word names, even if a word is on the stoplist', () => {
    expect(isAmbiguousBrandName('Best Buy')).toBe(false);
  });
});

describe('findMentions', () => {
  it('matches a whole word case-insensitively and reports its index', () => {
    const result = findMentions('Check out Acme today', 'acme');
    expect(result).toEqual({ ambiguous: false, mentioned: true, firstIndex: 10 });
  });

  it('does not match a name that only appears as a substring of another word', () => {
    // "AI" must not match inside "AIVis" — \b word-boundary correctness.
    const result = findMentions('Check out AIVis today', 'AI');
    expect(result.mentioned).toBe(false);
  });

  it('returns not-mentioned when the name is absent', () => {
    const result = findMentions('Nothing relevant here', 'Acme');
    expect(result).toEqual({ ambiguous: false, mentioned: false, firstIndex: -1 });
  });

  it('short-circuits to ambiguous for stoplisted names without matching', () => {
    const result = findMentions('Best is mentioned here', 'Best');
    expect(result).toEqual({ ambiguous: true, mentioned: null, firstIndex: -1 });
  });
});

describe('findBrandMention', () => {
  it('uses the domain alias when the brand name itself is ambiguous', () => {
    const prospect = { brand: 'Best', website: 'bestplumbing.com' };
    const result = findBrandMention('Call bestplumbing for a quote', prospect);
    expect(result.ambiguous).toBe(false);
    expect(result.mentioned).toBe(true);
  });

  it('falls back to the ambiguous primary result when both brand and alias are ambiguous', () => {
    const prospect = { brand: 'Best', website: 'best.com' };
    const result = findBrandMention('Best is mentioned here', prospect);
    expect(result.ambiguous).toBe(true);
  });

  it('does not use the alias fallback for an unambiguous brand name', () => {
    const prospect = { brand: 'ASML', website: 'asml.com' };
    const result = findBrandMention('ASML makes lithography machines', prospect);
    expect(result).toEqual({ ambiguous: false, mentioned: true, firstIndex: 0 });
  });
});

describe('extractCitations', () => {
  it('collects url_citation annotations from message content parts', () => {
    const json = {
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'Acme is great.',
              annotations: [
                { type: 'url_citation', url: 'https://acme.com/about', title: 'About Acme' },
                { type: 'url_citation', url: 'https://reviews.example/acme', title: 'Reviews' },
              ],
            },
          ],
        },
      ],
    };
    expect(extractCitations(json)).toEqual([
      { url: 'https://acme.com/about', title: 'About Acme' },
      { url: 'https://reviews.example/acme', title: 'Reviews' },
    ]);
  });

  it('dedupes repeated citation URLs', () => {
    const json = {
      output: [
        {
          content: [
            {
              annotations: [
                { type: 'url_citation', url: 'https://acme.com', title: 'Acme' },
                { type: 'url_citation', url: 'https://acme.com', title: 'Acme again' },
              ],
            },
          ],
        },
      ],
    };
    expect(extractCitations(json)).toHaveLength(1);
  });

  it('ignores non-citation annotations and returns [] when none are present', () => {
    expect(extractCitations({ output: [{ content: [{ annotations: [{ type: 'other' }] }] }] })).toEqual([]);
    expect(extractCitations({ output: [{ content: [{ text: 'no annotations field' }] }] })).toEqual([]);
    expect(extractCitations({})).toEqual([]);
  });
});

// Fixtures shaped from real live responses captured 2026-08-15 during the
// direct-provider migration's live verification (see aivis-core.mjs's
// callModel comment) — not hand-guessed shapes.
describe('parseAnthropicResponse', () => {
  it('joins text blocks and dedupes citations across them, from a real captured response shape', () => {
    const json = {
      content: [
        { type: 'text', text: "I'll search for emergency plumber options in Rotterdam." },
        { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'plumber Rotterdam' } },
        { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [] },
        {
          type: 'text',
          text: 'For a burst pipe in Rotterdam, Loodgieters Kwartier offers 24/7 emergency service.',
          citations: [
            {
              type: 'web_search_result_location',
              url: 'https://loodgieterskwartier.nl/en/plumber-Rotterdam/',
              title: 'Plumber Rotterdam',
              cited_text: 'Our emergency service is available 24 hours a day.',
              encrypted_index: 'abc',
            },
            {
              type: 'web_search_result_location',
              url: 'https://loodgieterskwartier.nl/en/plumber-Rotterdam/',
              title: 'Plumber Rotterdam',
              cited_text: 'On-site within 30 to 60 minutes.',
              encrypted_index: 'def',
            },
          ],
        },
      ],
      usage: { input_tokens: 10309, output_tokens: 132 },
    };
    const result = parseAnthropicResponse(json);
    expect(result.text).toBe(
      "I'll search for emergency plumber options in Rotterdam.\nFor a burst pipe in Rotterdam, Loodgieters Kwartier offers 24/7 emergency service."
    );
    expect(result.citations).toEqual([
      { url: 'https://loodgieterskwartier.nl/en/plumber-Rotterdam/', title: 'Plumber Rotterdam' },
    ]);
    expect(result.usage).toEqual({ total_tokens: 10441 });
  });

  it('returns empty text/citations and null usage for a response with no text blocks', () => {
    expect(parseAnthropicResponse({ content: [] })).toEqual({ text: '', usage: null, citations: [] });
  });
});

describe('parseGoogleResponse', () => {
  it('joins parts and extracts grounding-chunk citations, from a real captured response shape', () => {
    const json = {
      candidates: [
        {
          content: {
            parts: [{ text: 'For a burst pipe in Rotterdam, Loodgieter Rotterdam is a top-rated 24/7 option.' }],
          },
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc123', title: 'loodgieterrotter-dam.nl' } },
            ],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 70, candidatesTokenCount: 55, totalTokenCount: 615 },
    };
    const result = parseGoogleResponse(json);
    expect(result.text).toBe('For a burst pipe in Rotterdam, Loodgieter Rotterdam is a top-rated 24/7 option.');
    expect(result.citations).toEqual([
      { url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc123', title: 'loodgieterrotter-dam.nl' },
    ]);
    expect(result.usage).toEqual({ total_tokens: 615 });
  });

  it('returns empty text/citations and null usage for a response with no candidates', () => {
    expect(parseGoogleResponse({})).toEqual({ text: '', usage: null, citations: [] });
  });
});

describe('aggregateProspect', () => {
  const baseProspect = {
    brand: 'ASML',
    website: 'asml.com',
    competitors: ['Best', 'Canon'],
  };

  // Regression for the false-zero bug: a short real brand name must be
  // detected normally, not silently skipped as ambiguous.
  it('detects a short real brand name as cited, not ambiguous', () => {
    const callResults = [
      { ok: true, model: 'm', promptIndex: 0, text: 'ASML is a leader in lithography.' },
    ];
    const agg = aggregateProspect(baseProspect, callResults);
    expect(agg.ambiguousBrandFlag).toBe(false);
    expect(agg.citedCount).toBe(1);
    expect(agg.perPromptRank[0].rank).toBe('ranked-1');
  });

  // Regression: an ambiguous competitor name used to look identical to
  // "never mentioned" (tally stuck at 0 either way). It should now be
  // visibly flagged instead of silently indistinguishable.
  it('flags an ambiguous competitor instead of silently leaving its tally at 0', () => {
    const callResults = [
      { ok: true, model: 'm', promptIndex: 0, text: 'ASML and Best are both options.' },
    ];
    const agg = aggregateProspect(baseProspect, callResults);
    const bestTally = agg.competitorTallies.find((c) => c.name === 'Best');
    expect(bestTally.ambiguous).toBe(true);
    expect(bestTally.mentionCount).toBe(0);
  });

  it('ranks the brand below a competitor mentioned earlier in the text and credits the competitor', () => {
    const callResults = [
      { ok: true, model: 'm', promptIndex: 0, text: 'Canon is popular, but ASML also competes.' },
    ];
    const agg = aggregateProspect(baseProspect, callResults);
    expect(agg.perPromptRank[0].rank).toBe('ranked-2');
    const canonTally = agg.competitorTallies.find((c) => c.name === 'Canon');
    expect(canonTally.beatBrandCount).toBe(1);
  });

  it('attributes a citation to the company\'s own site by hostname, including subdomains', () => {
    const callResults = [
      {
        ok: true,
        model: 'm',
        promptIndex: 0,
        text: 'ASML leads the market.',
        citations: [
          { url: 'https://www.asml.com/products', title: 'Products' },
          { url: 'https://someindustrynews.example/asml-review', title: 'Review' },
        ],
      },
    ];
    const agg = aggregateProspect(baseProspect, callResults);
    expect(agg.ownSiteCitations).toEqual([
      { promptIndex: 0, model: 'm', url: 'https://www.asml.com/products', title: 'Products' },
    ]);
    // The non-own-site citation still rides along on the raw response entry.
    expect(agg.rawResponses[0].citations).toHaveLength(2);
  });

  it('produces no own-site citations when none were returned for a call', () => {
    const callResults = [
      { ok: true, model: 'm', promptIndex: 0, text: 'ASML leads the market.' },
    ];
    const agg = aggregateProspect(baseProspect, callResults);
    expect(agg.ownSiteCitations).toEqual([]);
    expect(agg.rawResponses[0].citations).toEqual([]);
  });

  it('marks a call as not-mentioned when the brand never appears', () => {
    const callResults = [
      { ok: true, model: 'm', promptIndex: 0, text: 'Canon is the only option discussed.' },
    ];
    const agg = aggregateProspect(baseProspect, callResults);
    expect(agg.perPromptRank[0].rank).toBe('not-mentioned');
    expect(agg.citedCount).toBe(0);
  });

  it('separates failed calls from completed ones and records per-failure detail', () => {
    const callResults = [
      { ok: true, model: 'good-model', promptIndex: 0, text: 'ASML leads the market.' },
      { ok: false, model: 'bad-model', promptIndex: 1, error: new Error('HTTP 429 rate limited') },
    ];
    const agg = aggregateProspect(baseProspect, callResults);
    expect(agg.completedCalls).toBe(1);
    expect(agg.failedCalls).toBe(1);
    expect(agg.failures).toEqual([
      { model: 'bad-model', promptIndex: 1, error: 'Error: HTTP 429 rate limited' },
    ]);
  });

  it('sums token usage across completed calls only', () => {
    const callResults = [
      { ok: true, model: 'm', promptIndex: 0, text: 'ASML.', usage: { total_tokens: 100 } },
      { ok: true, model: 'm', promptIndex: 1, text: 'ASML.', usage: { total_tokens: 50 } },
      { ok: false, model: 'm', promptIndex: 2, error: new Error('boom') },
    ];
    const agg = aggregateProspect(baseProspect, callResults);
    expect(agg.totalTokens).toBe(150);
  });
});

describe('computeScore', () => {
  // Regression: too few completed calls must never produce a fake score —
  // null means "no data," not zero.
  it('returns null when fewer than the minimum number of calls completed', () => {
    const perPromptRank = [
      { promptIndex: 0, rank: 'ranked-1' },
      { promptIndex: 1, rank: 'ranked-1' },
    ];
    expect(computeScore(perPromptRank, 2)).toBeNull();
  });

  it('scores 100 when every completed call ranks the brand first', () => {
    const perPromptRank = [0, 1, 2, 3].map((promptIndex) => ({ promptIndex, rank: 'ranked-1' }));
    expect(computeScore(perPromptRank, 4)).toBe(100);
  });

  it('scores 0 when the brand is never mentioned across enough completed calls', () => {
    const perPromptRank = [0, 1, 2, 3].map((promptIndex) => ({ promptIndex, rank: 'not-mentioned' }));
    expect(computeScore(perPromptRank, 4)).toBe(0);
  });

  it('weights high-intent prompts more heavily than informational ones', () => {
    // Prompt 0 is high-intent (weight 3), prompt 3 is informational (weight 1).
    // Ranked-1 on the high-intent prompt should pull the score up more than
    // an equivalent ranked-1 on the informational one.
    const highIntentFirst = [
      { promptIndex: 0, rank: 'ranked-1' },
      { promptIndex: 3, rank: 'not-mentioned' },
    ];
    const informationalFirst = [
      { promptIndex: 0, rank: 'not-mentioned' },
      { promptIndex: 3, rank: 'ranked-1' },
    ];
    const highIntentScore = computeScore(highIntentFirst, 4);
    const informationalScore = computeScore(informationalFirst, 4);
    expect(highIntentScore).toBeGreaterThan(informationalScore);
  });
});

describe('scoreBand', () => {
  it('maps null to unavailable', () => {
    expect(scoreBand(null)).toBe('unavailable');
  });

  it('maps score thresholds to the correct band', () => {
    expect(scoreBand(80)).toBe('leading');
    expect(scoreBand(79)).toBe('visible');
    expect(scoreBand(50)).toBe('visible');
    expect(scoreBand(49)).toBe('weak');
    expect(scoreBand(1)).toBe('weak');
    expect(scoreBand(0)).toBe('invisible');
  });
});

describe('selectAdvice', () => {
  it('returns a single no-data card when nothing completed', () => {
    const agg = { completedCalls: 0 };
    expect(selectAdvice(agg)).toEqual([{ id: 'no-data', tone: 'neutral', params: {} }]);
  });

  // Regression proxy: two distinct findings used to both render under the
  // same generic "ALSO WORTH NOTING" heading in ScanDetail.vue (a copy bug,
  // fixed 2026-08-12). That heading text lives outside this file, but a
  // real fix implies the underlying cards are themselves distinct — assert
  // selectAdvice never returns duplicate advice ids for one scan.
  it('never returns duplicate advice ids', () => {
    const agg = {
      completedCalls: 5,
      citedCount: 3,
      perPromptRank: [
        { rank: 'ranked-2' },
        { rank: 'ranked-3' },
        { rank: 'mentioned' },
        { rank: 'not-mentioned' },
        { rank: 'not-mentioned' },
      ],
      competitorTallies: [
        { name: 'Rival', mentionCount: 4, beatBrandCount: 3 },
      ],
    };
    const cards = selectAdvice(agg);
    const ids = cards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns at most 3 cards', () => {
    const agg = {
      completedCalls: 5,
      citedCount: 3,
      perPromptRank: [
        { rank: 'ranked-1' },
        { rank: 'ranked-2' },
        { rank: 'mentioned' },
        { rank: 'not-mentioned' },
        { rank: 'not-mentioned' },
      ],
      competitorTallies: [{ name: 'Rival', mentionCount: 2, beatBrandCount: 1 }],
    };
    expect(selectAdvice(agg).length).toBeLessThanOrEqual(3);
  });
});

// Prompt/parser calibrated 2026-08-15 against a real live Perplexity call
// (openai/gpt-5-mini) with 5 hand-labeled example texts covering all 4
// classifications plus a "brand not mentioned" case — 5/5 agreement. These
// tests cover the parser's own defensive shape-handling, not model
// accuracy (that needs a real API key and isn't something a unit test can
// exercise).
describe('buildSentimentJudgePrompt', () => {
  it('embeds the brand name and response text to classify', () => {
    const prompt = buildSentimentJudgePrompt('Acme', 'Acme is a great choice.');
    expect(prompt).toContain('Acme');
    expect(prompt).toContain('Acme is a great choice.');
  });
});

describe('parseSentimentJudgeResponse', () => {
  it('parses a clean JSON response', () => {
    const text = '{"classification": "recommended", "reasoning": "Praised as the best option."}';
    expect(parseSentimentJudgeResponse(text)).toEqual({
      classification: 'recommended',
      reasoning: 'Praised as the best option.',
    });
  });

  it('extracts JSON wrapped in markdown fences or surrounding prose', () => {
    const text = 'Here is the classification:\n```json\n{"classification": "negative", "reasoning": "Advised against it."}\n```\nHope that helps!';
    expect(parseSentimentJudgeResponse(text).classification).toBe('negative');
  });

  it('degrades to neutral with no reasoning on unparseable text', () => {
    expect(parseSentimentJudgeResponse('not json at all')).toEqual({ classification: 'neutral', reasoning: '' });
  });

  it('degrades to neutral when the classification value is not one of the allowed set', () => {
    const text = '{"classification": "very positive!", "reasoning": "whatever"}';
    expect(parseSentimentJudgeResponse(text).classification).toBe('neutral');
  });

  it('truncates an overly long reasoning string rather than rejecting it', () => {
    const longReasoning = 'x'.repeat(500);
    const text = JSON.stringify({ classification: 'neutral', reasoning: longReasoning });
    expect(parseSentimentJudgeResponse(text).reasoning.length).toBe(300);
  });
});

// Coverage added for the surface this repo's own incident history keeps
// pointing at (429s, cascading timeouts) but that had zero test coverage:
// callModelWithRetry's 429-only backoff/retry logic and runWithConcurrency's
// worker-pool limiter. Network is mocked at the global fetch boundary
// (rather than mocking callModel itself) so the real retry/backoff/status
// logic in aivis-core.mjs actually runs, not a stand-in for it.
function mockFetchResponse({ ok, status = 200, jsonBody = {}, textBody = '' }) {
  return { ok, status, json: async () => jsonBody, text: async () => textBody };
}

describe('callModelWithRetry', () => {
  const apiKeys = { xai: 'test-xai-key' };
  const model = 'xai/grok-4.6';

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('succeeds on the first attempt without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse({ ok: true, jsonBody: { output_text: 'hello' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await callModelWithRetry(apiKeys, model, 'prompt', 1000);
    expect(result.text).toBe('hello');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // The 2026-08-13 incident this backoff exists for: a burst of concurrent
  // calls hit Perplexity's rate limit, and a too-short backoff retried
  // straight back into the same limit. Confirms a 429 gets the escalating
  // backoff (RATE_LIMIT_BACKOFF_MS = 5000ms * attempt) and a real retry.
  it('retries once on a 429 and succeeds on the second attempt', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockFetchResponse({ ok: false, status: 429, textBody: 'rate limited' }))
      .mockResolvedValueOnce(mockFetchResponse({ ok: true, jsonBody: { output_text: 'recovered' } }));
    vi.stubGlobal('fetch', fetchMock);
    const promise = callModelWithRetry(apiKeys, model, 'prompt', 1000, 2);
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;
    expect(result.text).toBe('recovered');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // 2026-08-17 fix: a plain timeout/500 used to get the same up-to-3x retry
  // as a 429, burning shared scan-deadline budget on failures unlikely to
  // succeed on immediate retry. Retries are now scoped to 429 only.
  it('does not retry a non-429 failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse({ ok: false, status: 500, textBody: 'server error' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(callModelWithRetry(apiKeys, model, 'prompt', 1000, 2)).rejects.toThrow(/HTTP 500/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxAttempts on repeated 429s', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse({ ok: false, status: 429, textBody: 'still limited' }));
    vi.stubGlobal('fetch', fetchMock);
    const promise = callModelWithRetry(apiKeys, model, 'prompt', 1000, 2);
    const assertion = expect(promise).rejects.toThrow(/HTTP 429/);
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // "No point waiting to retry into a deadline that's already passed" — a
  // 429 that arrives after the scan-wide deadline already fired should not
  // also pay the backoff, even though it would otherwise qualify for retry.
  it('does not sleep/retry once the external signal is already aborted', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse({ ok: false, status: 429, textBody: 'rate limited' }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(callModelWithRetry(apiKeys, model, 'prompt', 1000, 3, controller.signal)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('runWithConcurrency', () => {
  it('preserves result order matching input order regardless of completion order', async () => {
    const tasks = [30, 10, 20]; // simulated per-task delay in ms
    const results = await runWithConcurrency(
      tasks,
      3,
      (delayMs) => new Promise((resolve) => setTimeout(() => resolve(delayMs), delayMs))
    );
    expect(results).toEqual([30, 10, 20]);
  });

  // The exact property CONCURRENCY_LIMIT_BY_PROVIDER depends on — added
  // 2026-08-09 specifically because firing every call in a scan at once was
  // untested against provider rate limits.
  it('never runs more than `limit` tasks concurrently', async () => {
    const tasks = [1, 2, 3, 4, 5, 6];
    let active = 0;
    let maxActive = 0;
    const results = await runWithConcurrency(tasks, 2, async (task) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      return task * 2;
    });
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(results).toEqual([2, 4, 6, 8, 10, 12]);
  });

  // limit=1 is the openai/Perplexity-gateway lane's historical value (three
  // documented incidents) — confirms it's genuinely sequential, not just
  // bounded.
  it('runs strictly one at a time when limit is 1', async () => {
    const tasks = ['a', 'b', 'c'];
    const order = [];
    await runWithConcurrency(tasks, 1, async (task) => {
      order.push(`start:${task}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push(`end:${task}`);
    });
    expect(order).toEqual(['start:a', 'end:a', 'start:b', 'end:b', 'start:c', 'end:c']);
  });

  it('returns an empty array for an empty task list without hanging', async () => {
    const results = await runWithConcurrency([], 3, async () => 'never called');
    expect(results).toEqual([]);
  });
});
