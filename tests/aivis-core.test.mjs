import { describe, expect, it } from 'vitest';
import {
  aggregateProspect,
  computeScore,
  extractCitations,
  findBrandMention,
  findMentions,
  isAmbiguousBrandName,
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
