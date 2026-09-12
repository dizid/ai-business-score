// Sentiment judge (live LLM call) — split out of aivis-core.mjs (2026-09-12
// architecture refactor). PLAN_NEXT_PHASE.md Milestone F item 2: replace
// the whole-word regex presence check with a second LLM pass classifying
// HOW a brand was portrayed in one specific completed check's response text
// — not just whether it was mentioned. Originally shipped on-demand only (a
// button per check in ScanDetail.vue's check-by-check breakdown, via
// judge-sentiment.mts) and deliberately kept out of the automatic scan
// pipeline — this repo's own history (the 2026-08-09 model-count revert,
// the 2026-08-13 concurrency incidents) is two separate real production
// incidents that both trace back to adding more calls to the automatic
// pipeline without checking capacity first.
//
// 2026-08-20: run-scan-background.mts now runs this automatically for
// every mentioned check right after the main scan loop, reusing this exact
// prompt/model/timeout (so shared/CLAUDE.md's existing calibration note
// still applies unchanged) and bounded to whatever's left of
// SCAN_DEADLINE_MS rather than a fresh budget on top — a slow scan just
// auto-judges fewer checks instead of risking a repeat of either incident
// above. judge-sentiment.mts (the manual endpoint) stays exactly as it was:
// now a fallback for checks the automatic pass didn't reach in time, and
// for re-judging a specific check on demand.
import { truncate } from '../textUtils.mjs';

const SENTIMENT_CLASSIFICATIONS = new Set(['recommended', 'neutral', 'negative', 'comparison-only']);

export function buildSentimentJudgePrompt(brand, responseText) {
  return `You are classifying how a brand was portrayed in a piece of AI-generated text. The brand is "${brand}". Here is the full text:
"""
${responseText}
"""
Classify how "${brand}" is portrayed in this text specifically. Respond with ONLY a JSON object (no markdown fences, no commentary before or after):
{
  "classification": "recommended" | "neutral" | "negative" | "comparison-only",
  "reasoning": "one sentence explaining the classification"
}
Classification guide:
- "recommended": the text actively recommends or praises "${brand}" as a good or leading option.
- "neutral": "${brand}" is mentioned factually, without a clear endorsement or criticism.
- "negative": the text criticizes "${brand}" or advises against it.
- "comparison-only": "${brand}" is only listed among several options being compared, with no clear recommendation either way.
If "${brand}" is not actually mentioned anywhere in the text, respond with "classification": "neutral" and say so in "reasoning".`;
}

// Same lenient-extraction, always-safe-shape pattern as
// deepAdvice.mjs's parseDeepAdviceResponse/enrichment.mjs's
// parseEnrichmentResponse — an unparseable or malformed response degrades
// to a neutral classification with no reasoning rather than throwing, since
// a failed judge call should read as "couldn't determine," not crash the
// check it was asked about.
export function parseSentimentJudgeResponse(text) {
  const empty = { classification: 'neutral', reasoning: '' };
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return empty;
  try {
    const parsed = JSON.parse(match[0]);
    const classification = SENTIMENT_CLASSIFICATIONS.has(parsed.classification) ? parsed.classification : 'neutral';
    const reasoning = typeof parsed.reasoning === 'string' ? truncate(parsed.reasoning.trim(), 300) : '';
    return { classification, reasoning };
  } catch {
    return empty;
  }
}
