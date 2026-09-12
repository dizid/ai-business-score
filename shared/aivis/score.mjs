// Scoring — split out of aivis-core.mjs (2026-09-12 architecture refactor).
// 0-100, based on positional rank. Being mentioned 1st gets full credit;
// 2nd/3rd get partial, decaying credit. Being mentioned but not in the top 3
// still provides a small signal. A score of 0 means "genuinely invisible
// across N real checks," while a null score means "the API failed and we
// have no data."

import { PROMPT_CATEGORIES } from './prompts.mjs';

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
