// Tailored advice (rule-based, not a live LLM call) — split out of
// aivis-core.mjs (2026-09-12 architecture refactor). Returns structured
// scenario data (id/tone/params), not freeform text — the English copy
// lives in result.html's ADVICE_COPY lookup, same pattern the page already
// uses for its hardcoded headline sentences. This keeps the FACT selected
// frozen at scan time (a shared link never changes what it shows) while
// wording can improve later without invalidating old links. Deliberately
// synchronous/instant: adding a live "advice" LLM call here would need the
// aggregated results as input, so it couldn't join the existing parallel
// batch — it would add a full sequential 15-20s+ on top of a
// function-timeout budget that was already hard-won empirically. Ambiguous
// brand name and failed calls are NOT advice cards — they're data-quality
// caveats shown as warning banners elsewhere, not business findings.

import { findMentions } from './brand.mjs';
import { PROMPT_LABELS } from './prompts.mjs';

const MAX_EXCERPT_CHARS = 500;

// Finds up to `maxCount` real excerpts where `competitorName` was cited and
// the brand wasn't already ranked-1 for that check — exported so
// deepAdvice.mjs's selectDeepAdviceExcerpts (paid, LLM-prompt-formatted) and
// this file's own findCompetitorExcerpt (free rule-based cards) pull from
// the exact same underlying evidence instead of two independent
// implementations.
export function findCompetitorExcerpts(agg, competitorName, maxCount) {
  const rankByCall = new Map((agg.perPromptRank || []).map((r, i) => [i, r.rank]));
  const excerpts = [];
  for (let i = 0; i < (agg.rawResponses || []).length; i++) {
    if (excerpts.length >= maxCount) break;
    const response = agg.rawResponses[i];
    if (rankByCall.get(i) === 'ranked-1') continue; // brand already winning this check
    const match = findMentions(response.text, competitorName);
    if (!match.mentioned) continue;
    const start = Math.max(0, match.firstIndex - 100);
    const snippet = response.text.slice(start, start + MAX_EXCERPT_CHARS).trim();
    const promptLabel = PROMPT_LABELS[response.promptIndex] || `prompt ${response.promptIndex}`;
    excerpts.push({ promptLabel, snippet });
  }
  return excerpts;
}

// Convenience wrapper for callers that just want one excerpt for one
// competitor (selectAdvice's free rule-based cards) — returns null rather
// than an empty array so callers can drop it straight into a params object.
export function findCompetitorExcerpt(agg, competitorName) {
  return findCompetitorExcerpts(agg, competitorName, 1)[0] || null;
}

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
    const topCompetitorName = topRival && topRival.beatBrandCount > 0 ? topRival.name : null;
    cards.push({
      id: 'consistently-beaten',
      tone: 'warning',
      params: {
        beaten,
        completedCalls: agg.completedCalls,
        topCompetitorName,
        // Real quoted evidence, not just the tally — same underlying data
        // findCompetitorExcerpts() feeds the paid deep-advice prompt, reused
        // here for the free card. null when no matching excerpt is found.
        excerpt: topCompetitorName ? findCompetitorExcerpt(agg, topCompetitorName) : null,
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
      params: {
        name: topRival.name,
        mentionCount: topRival.mentionCount,
        completedCalls: agg.completedCalls,
        excerpt: findCompetitorExcerpt(agg, topRival.name),
      },
    });
  }

  return cards.slice(0, 3);
}
