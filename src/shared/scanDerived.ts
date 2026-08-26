// Pure functions deriving display-ready rows from a ValidatedPayload —
// pulled out of ScanDetail.vue's <script setup> computeds (which can't be
// imported by another module) so scanReport.ts can build the exact same
// rows for the downloadable Markdown report without re-implementing the
// aggregation logic a second time and risking the two silently drifting
// apart. Each function here is the same logic the matching computed() in
// ScanDetail.vue used to contain, just taking `payload` as a parameter
// instead of closing over `props.payload`.
import { scoreBand, PROMPT_LABELS, PROMPT_CATEGORIES, findMentions } from '../../shared/aivis-core.mjs';
import { asShortString, type ValidatedPayload, type Rank } from './scanPayload';
import { SENTIMENT_SUMMARY_ORDER, CATEGORY_LABEL, CATEGORY_ORDER, HARMONIA_PILLAR_LABELS, SENTIMENT_LABEL, BAND_LABEL, BAND_EXPLAIN } from './scanLabels';

export function sentimentKey(promptIndex: number, model: string) {
  return `${promptIndex}:${model}`;
}

export function deriveSentimentByKey(payload: ValidatedPayload) {
  const map = new Map<string, { classification: string; reasoning: string }>();
  for (const j of payload.sentimentJudgments) {
    map.set(sentimentKey(j.promptIndex, j.model), { classification: j.classification, reasoning: j.reasoning });
  }
  return map;
}

export interface SentimentSummaryRow { classification: string; label: string; count: number; }
export function deriveSentimentSummaryRows(payload: ValidatedPayload): SentimentSummaryRow[] {
  const counts = new Map<string, number>();
  for (const j of payload.sentimentJudgments) {
    counts.set(j.classification, (counts.get(j.classification) ?? 0) + 1);
  }
  return SENTIMENT_SUMMARY_ORDER.filter((c) => (counts.get(c) ?? 0) > 0).map((c) => ({
    classification: c,
    label: SENTIMENT_LABEL[c],
    count: counts.get(c)!,
  }));
}

export interface CategoryRow {
  category: string;
  label: string;
  total: number;
  ranked1: number;
  beaten: number;
  notMentioned: number;
  presencePct: number;
  sentimentCounts: SentimentSummaryRow[];
}
export function deriveCategoryBreakdown(payload: ValidatedPayload): CategoryRow[] {
  const sentimentByKey = deriveSentimentByKey(payload);
  const byCategory = new Map<string, { rank: Rank; promptIndex: number; model: string }[]>();
  payload.rawResponses.forEach((r, i) => {
    const rank = payload.perPromptRank[i]?.rank ?? 'not-mentioned';
    const category = PROMPT_CATEGORIES[r.promptIndex] ?? 'informational';
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category)!.push({ rank, promptIndex: r.promptIndex, model: r.model });
  });
  return CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((category) => {
    const entries = byCategory.get(category)!;
    const total = entries.length;
    const ranked1 = entries.filter((e) => e.rank === 'ranked-1').length;
    const beaten = entries.filter((e) => ['ranked-2', 'ranked-3', 'mentioned', 'beaten'].includes(e.rank)).length;
    const notMentioned = total - ranked1 - beaten;
    const sentimentCounts = new Map<string, number>();
    for (const e of entries) {
      const s = sentimentByKey.get(sentimentKey(e.promptIndex, e.model));
      if (s) sentimentCounts.set(s.classification, (sentimentCounts.get(s.classification) ?? 0) + 1);
    }
    return {
      category,
      label: CATEGORY_LABEL[category] ?? category,
      total,
      ranked1,
      beaten,
      notMentioned,
      presencePct: total > 0 ? Math.round(((ranked1 + beaten) / total) * 100) : 0,
      sentimentCounts: SENTIMENT_SUMMARY_ORDER.filter((c) => (sentimentCounts.get(c) ?? 0) > 0).map((c) => ({
        classification: c,
        label: SENTIMENT_LABEL[c],
        count: sentimentCounts.get(c)!,
      })),
    };
  });
}

export interface SentimentAdvice { unfavorable: number; negative: number; comparisonOnly: number; total: number; }
export function deriveSentimentAdvice(payload: ValidatedPayload): SentimentAdvice | null {
  const judgments = payload.sentimentJudgments;
  if (judgments.length === 0) return null;
  const negative = judgments.filter((j) => j.classification === 'negative').length;
  const comparisonOnly = judgments.filter((j) => j.classification === 'comparison-only').length;
  const unfavorable = negative + comparisonOnly;
  if (unfavorable === 0) return null;
  return { unfavorable, negative, comparisonOnly, total: judgments.length };
}

export function deriveRank1Count(payload: ValidatedPayload) {
  return payload.perPromptRank.filter((r) => r.rank === 'ranked-1').length;
}
export function deriveBeatenCount(payload: ValidatedPayload) {
  return payload.perPromptRank.filter((r) => ['ranked-2', 'ranked-3', 'mentioned', 'beaten'].includes(r.rank)).length;
}

// Qualitative read on completedCalls, next to the score card's existing raw
// "X / Y successful checks" count. Thresholds are against the hosted site's
// fixed 20-call scan size (5 prompt templates x 4 models — see
// aivis-core.mjs's MODELS/PROMPT_TEMPLATES.slice(0,5)), not a percentage: a
// handful of extra failed calls out of 20 matters more than the same
// handful would out of a much larger set.
export type ConfidenceLevel = 'High' | 'Medium' | 'Low';
export function confidenceLabel(completedCalls: number): ConfidenceLevel {
  if (completedCalls >= 16) return 'High';
  if (completedCalls >= 10) return 'Medium';
  return 'Low';
}

// Three headline stats relabeling numbers already computed elsewhere
// (citedCount, deriveRank1Count, competitorTallies' beatBrandCount) — pure
// re-derivation, no new data collection.
export interface KeyMetrics {
  recommendationRatePct: number;
  firstChoiceRatePct: number;
  topCompetitorTakeoverRatePct: number;
  topCompetitorName: string | null;
}
export function deriveKeyMetrics(payload: ValidatedPayload): KeyMetrics | null {
  if (payload.completedCalls === 0) return null;
  const topCompetitor = [...payload.competitorTallies].sort((a, b) => b.beatBrandCount - a.beatBrandCount)[0];
  return {
    recommendationRatePct: Math.round((payload.citedCount / payload.completedCalls) * 100),
    firstChoiceRatePct: Math.round((deriveRank1Count(payload) / payload.completedCalls) * 100),
    topCompetitorTakeoverRatePct: topCompetitor ? Math.round((topCompetitor.beatBrandCount / payload.completedCalls) * 100) : 0,
    topCompetitorName: topCompetitor && topCompetitor.beatBrandCount > 0 ? topCompetitor.name : null,
  };
}

export type HeadlineKind = 'none' | 'zero' | 'beaten' | 'good';
export function deriveHeadlineKind(payload: ValidatedPayload): HeadlineKind {
  if (payload.completedCalls === 0) return 'none';
  if (payload.citedCount === 0) return 'zero';
  if (deriveBeatenCount(payload) > 0) return 'beaten';
  return 'good';
}

// Executive summary: a compact, skim-in-10-seconds synthesis at the top of
// the Overview tab. Deliberately NOT a re-list of the "What to do next"
// advice cards below (that would just duplicate them) — it surfaces the two
// facts that otherwise stay buried until you dig: a distilled read of
// deriveCategoryBreakdown (which query type is actually failing) and a
// concrete quick win pulled up from the Details tab (an AI-crawler block or
// a schema opportunity most users would never scroll to see). Pure
// re-derivation of data already computed elsewhere — no new LLM call.
export interface ExecutiveSummary { verdict: string; vulnerability: string | null; quickWin: string | null; }
export function deriveExecutiveSummary(payload: ValidatedPayload): ExecutiveSummary {
  const band = scoreBand(payload.score);
  const verdict = payload.score !== null
    ? `${BAND_LABEL[band]} (${payload.score}/100) — ${BAND_EXPLAIN[band]}`
    : `${BAND_LABEL[band]} — ${BAND_EXPLAIN[band]}`;

  let vulnerability: string | null = null;
  if (payload.completedCalls === 0) {
    vulnerability = null;
  } else if (payload.citedCount === 0) {
    vulnerability = `Not mentioned in any of the ${payload.completedCalls} checks — currently invisible in AI answers for ${payload.category}.`;
  } else {
    // Prefer a fully-missed category, in CATEGORY_ORDER's high-intent-first
    // priority — matches the score model's own weighting, so the
    // vulnerability called out here is the one actually costing the most
    // score, not just the first one found.
    const zeroCategory = deriveCategoryBreakdown(payload).find((c) => c.total > 0 && c.notMentioned === c.total);
    if (zeroCategory) {
      vulnerability = `Zero presence in ${zeroCategory.label.toLowerCase()} queries (${zeroCategory.notMentioned}/${zeroCategory.total} checks missed entirely).`;
    } else {
      const beatenCount = deriveBeatenCount(payload);
      if (beatenCount > 0) {
        vulnerability = `Beaten to the mention in ${beatenCount} of ${payload.completedCalls} checks — showing up, but rarely first.`;
      }
    }
  }

  // Quick win: an AI-crawler block beats a generic schema opportunity as
  // the lead suggestion — it's the most direct "AI literally can't see
  // you" fix a GEO tool can surface, and it's otherwise buried in the
  // Details tab's Site Health breakdown.
  let quickWin: string | null = null;
  const aiCrawlers = payload.harmonia?.aiCrawlerAccess;
  if (aiCrawlers && aiCrawlers.blockedCount > 0) {
    const blockedBots = aiCrawlers.bots.filter((b) => b.blocked).map((b) => b.bot);
    const shown = blockedBots.slice(0, 3).join(', ');
    quickWin = `Unblock AI crawlers in robots.txt — ${shown}${blockedBots.length > 3 ? ', and others' : ''} currently blocked from indexing your site.`;
  } else if (payload.harmonia?.schema.opportunities.length) {
    const opp = payload.harmonia.schema.opportunities[0];
    quickWin = `Add ${opp.type} schema markup — ${opp.reason}`;
  }

  return { verdict, vulnerability, quickWin };
}

export interface ScoreboardRow { name: string; isYou: boolean; mentionCount: number; beatBrandCount: number; ambiguous: boolean; }
export function deriveScoreboardRows(payload: ValidatedPayload): ScoreboardRow[] {
  if (payload.completedCalls === 0) return [];
  const rivals = [...payload.competitorTallies].sort((a, b) => b.mentionCount - a.mentionCount);
  return [
    // The brand's own row already gets the top-level "common word" warning
    // banner (payload.ambiguousBrandFlag) — never flag it again here.
    { name: payload.brand, isYou: true, mentionCount: payload.citedCount, beatBrandCount: 0, ambiguous: false },
    ...rivals.map((r) => ({ ...r, isYou: false })),
  ];
}

export function scoreboardRowPct(payload: ValidatedPayload, row: ScoreboardRow) {
  if (payload.completedCalls === 0) return 0;
  return Math.min(100, Math.round((row.mentionCount / payload.completedCalls) * 100));
}

// Distinct from scoreboardRowPct (mentions ÷ completed calls — a presence
// rate). Share of voice is mentions ÷ total mentions across brand +
// competitors — "of everyone who got mentioned, what fraction was you."
// Pure re-derivation of data already in competitorTallies/citedCount, no new
// data collection.
export function shareOfVoicePct(rows: ScoreboardRow[], row: ScoreboardRow) {
  const totalMentions = rows.reduce((sum, r) => sum + r.mentionCount, 0);
  if (totalMentions === 0) return 0;
  return Math.round((row.mentionCount / totalMentions) * 100);
}

// Click-through from a Scoreboard "beat you Nx" row to the specific checks
// that competitor won — GET /companies/:id already returns full rawResponses
// index-aligned with perPromptRank (see the "zipping by index is safe" note
// above), so this needs no backend join, just the same whole-word
// mention-matching findMentions() already uses for brand detection.
export interface CompetitorAppearance { promptIndex: number; promptLabel: string; model: string; rank: Rank; snippet: string; }
export function deriveCompetitorAppearances(payload: ValidatedPayload, competitorName: string): CompetitorAppearance[] {
  const appearances: CompetitorAppearance[] = [];
  payload.rawResponses.forEach((r, i) => {
    const match = findMentions(r.text, competitorName);
    if (!match.mentioned) return;
    const start = Math.max(0, match.firstIndex - 80);
    const snippet = r.text.slice(start, start + 240).trim();
    appearances.push({
      promptIndex: r.promptIndex,
      promptLabel: PROMPT_LABELS[r.promptIndex] || `Prompt ${r.promptIndex + 1}`,
      model: r.model,
      rank: payload.perPromptRank[i]?.rank ?? 'not-mentioned',
      snippet,
    });
  });
  return appearances;
}

// rawResponses[i] and perPromptRank[i] describe the same completed call —
// both are built by mapping over aggregateProspect()'s `completed` array in
// the same order, with no filtering/reordering in between — so zipping by
// index is safe. Grouped by promptIndex so each prompt template shows its
// model outcomes together, answering "which prompt, which model, did it
// show up" directly instead of a flat raw-text dump.
export interface CheckRow { model: string; rank: Rank; text: string; citations: { url: string; title: string }[]; }
export interface CheckGroup { promptIndex: number; label: string; checks: CheckRow[]; }
export function deriveCheckBreakdown(payload: ValidatedPayload): CheckGroup[] {
  const byPrompt = new Map<number, CheckRow[]>();
  payload.rawResponses.forEach((r, i) => {
    const rank = payload.perPromptRank[i]?.rank ?? 'not-mentioned';
    if (!byPrompt.has(r.promptIndex)) byPrompt.set(r.promptIndex, []);
    byPrompt.get(r.promptIndex)!.push({ model: r.model, rank, text: r.text, citations: r.citations || [] });
  });
  return [...byPrompt.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([promptIndex, checks]) => ({
      promptIndex,
      label: PROMPT_LABELS[promptIndex] || `Prompt ${promptIndex + 1}`,
      checks,
    }));
}

export interface FailureRow { model: string; promptLabel: string; error: string; }
export function deriveFailureRows(payload: ValidatedPayload): FailureRow[] {
  return payload.failures.map((f) => ({
    model: f.model,
    promptLabel: PROMPT_LABELS[f.promptIndex] || `Prompt ${f.promptIndex + 1}`,
    error: f.error,
  }));
}

export type CitationTier = 'sole-source' | 'primary-source' | 'one-of-several';
export interface OwnCitationRow { url: string; title: string; model: string; promptLabel: string; tier: CitationTier; totalCitations: number; }
export function deriveOwnSiteCitationRows(payload: ValidatedPayload): OwnCitationRow[] {
  const responseByKey = new Map(payload.rawResponses.map((r) => [sentimentKey(r.promptIndex, r.model), r]));
  return payload.ownSiteCitations.map((c) => {
    const response = responseByKey.get(sentimentKey(c.promptIndex, c.model));
    // A response that carried this own-site citation always has at least
    // that one citation on it — fall back to 1 (sole-source) only for the
    // theoretical case where the matching response can't be found.
    const totalCitations = response ? response.citations.length : 1;
    const tier: CitationTier = totalCitations <= 1 ? 'sole-source' : totalCitations <= 3 ? 'primary-source' : 'one-of-several';
    return {
      url: c.url,
      title: c.title || c.url,
      model: c.model,
      promptLabel: PROMPT_LABELS[c.promptIndex] || `Prompt ${c.promptIndex + 1}`,
      tier,
      totalCitations,
    };
  });
}

// Only 'top-rival' can produce an empty body (when no valid competitor name
// survives re-validation) — the other advice ids always render something.
export function deriveVisibleAdvice(payload: ValidatedPayload) {
  return payload.advice.filter((c) => c.id !== 'top-rival' || asShortString(c.params.name));
}

export interface HarmoniaPillarView {
  key: keyof typeof HARMONIA_PILLAR_LABELS;
  label: string;
  score: number | null;
  band: string;
  checks: { id: string; label: string; passed: boolean }[];
}
export function deriveHarmoniaPillars(payload: ValidatedPayload): HarmoniaPillarView[] {
  const h = payload.harmonia;
  if (!h) return [];
  return (Object.keys(HARMONIA_PILLAR_LABELS) as (keyof typeof HARMONIA_PILLAR_LABELS)[]).map((key) => {
    const pillar = h.pillars[key];
    return { key, label: HARMONIA_PILLAR_LABELS[key], score: pillar.score, band: scoreBand(pillar.score), checks: pillar.checks };
  });
}
export function deriveHarmoniaBand(payload: ValidatedPayload) {
  return scoreBand(payload.harmonia?.harmoniaScore ?? null);
}

export const CWV_THRESHOLDS = { lcpMs: [2500, 4000], clsScore: [0.1, 0.25], inpMs: [200, 500] } as const;
export function cwvRating(metric: keyof typeof CWV_THRESHOLDS, value: number | null): 'good' | 'needs-improvement' | 'poor' | null {
  if (value === null) return null;
  const [good, needsImprovement] = CWV_THRESHOLDS[metric];
  if (value <= good) return 'good';
  if (value <= needsImprovement) return 'needs-improvement';
  return 'poor';
}
export function formatSeconds(ms: number | null) {
  return ms === null ? '—' : `${(ms / 1000).toFixed(2)}s`;
}

// Scan duration: null for pre-migration scans (startedAtDate missing) —
// degrades to "don't show a duration" rather than a fake/misleading value.
// Sourced from two already-persisted DB timestamps (generatedAtDate -
// startedAtDate), not a separately-stored duration value — see
// run-scan-background.mts for why.
export function deriveScanDurationLabel(payload: ValidatedPayload): string | null {
  if (!payload.startedAtDate) return null;
  const totalSeconds = Math.round((payload.generatedAtDate.getTime() - payload.startedAtDate.getTime()) / 1000);
  if (totalSeconds < 0) return null;
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}
