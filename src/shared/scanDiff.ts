// Pure diff computation between two ValidatedPayloads (a scan and the
// completed scan immediately before it) — score delta, per-prompt rank
// changes, competitor-tally deltas, and newly-appeared/disappeared own-site
// citations. Deliberately a separate file from scanDerived.ts: every
// function there derives rows from a SINGLE payload (and several are reused
// by scanReport.ts's Markdown export); a diff takes two payloads and has no
// Markdown-report consumer, so it doesn't share that file's shape or
// purpose. Pure client-side — both payloads are already fetched by
// CompanyDetailView.vue (company.mts returns full scan history), no new
// endpoint.
import { PROMPT_LABELS } from '../../shared/aivis-core.mjs';
import type { ValidatedPayload, Rank } from './scanPayload';

// Same "best rank per prompt" simplification ReportGeoSection.vue's local
// bestRank() already uses for its master-row display — a prompt can have
// several models' checks, and a scan's own model set can differ from an
// older scan's (HOSTED_MODELS has changed over time), so comparing the
// single best showing per prompt is the one thing that stays meaningful
// across two scans with different model sets.
const RANK_ORDER: Rank[] = ['ranked-1', 'ranked-2', 'ranked-3', 'mentioned', 'beaten', 'not-mentioned'];
function bestRankByPrompt(payload: ValidatedPayload): Map<number, Rank> {
  const best = new Map<number, Rank>();
  payload.rawResponses.forEach((r, i) => {
    const rank = payload.perPromptRank[i]?.rank ?? 'not-mentioned';
    const current = best.get(r.promptIndex);
    if (!current || RANK_ORDER.indexOf(rank) < RANK_ORDER.indexOf(current)) {
      best.set(r.promptIndex, rank);
    }
  });
  return best;
}

export interface ScoreDiff { prior: number | null; current: number | null; delta: number | null; }
export interface RankChangeRow { promptIndex: number; promptLabel: string; priorRank: Rank | null; currentRank: Rank | null; improved: boolean; worsened: boolean; }
export interface CompetitorTallyDiff { name: string; priorMentionCount: number; currentMentionCount: number; delta: number; }
export interface CitationDiff { url: string; title: string; }

export interface ScanDiffResult {
  scoreDiff: ScoreDiff;
  rankChanges: RankChangeRow[];
  competitorDiffs: CompetitorTallyDiff[];
  newCitations: CitationDiff[];
  lostCitations: CitationDiff[];
}

export function computeScanDiff(prior: ValidatedPayload, current: ValidatedPayload): ScanDiffResult {
  const scoreDiff: ScoreDiff = {
    prior: prior.score,
    current: current.score,
    delta: prior.score !== null && current.score !== null ? current.score - prior.score : null,
  };

  const priorBest = bestRankByPrompt(prior);
  const currentBest = bestRankByPrompt(current);
  const promptIndexes = new Set([...priorBest.keys(), ...currentBest.keys()]);
  const rankChanges: RankChangeRow[] = [...promptIndexes].sort((a, b) => a - b).map((promptIndex) => {
    const priorRank = priorBest.get(promptIndex) ?? null;
    const currentRank = currentBest.get(promptIndex) ?? null;
    const priorPos = priorRank ? RANK_ORDER.indexOf(priorRank) : RANK_ORDER.length;
    const currentPos = currentRank ? RANK_ORDER.indexOf(currentRank) : RANK_ORDER.length;
    return {
      promptIndex,
      promptLabel: PROMPT_LABELS[promptIndex] || `Prompt ${promptIndex + 1}`,
      priorRank,
      currentRank,
      // Lower RANK_ORDER index = better rank (ranked-1 is 0) — "improved"
      // means the current position moved to a lower/better index.
      improved: currentPos < priorPos,
      worsened: currentPos > priorPos,
    };
  });

  const names = new Set([...prior.competitorTallies.map((c) => c.name), ...current.competitorTallies.map((c) => c.name)]);
  const competitorDiffs: CompetitorTallyDiff[] = [...names].map((name) => {
    const priorCount = prior.competitorTallies.find((c) => c.name === name)?.mentionCount ?? 0;
    const currentCount = current.competitorTallies.find((c) => c.name === name)?.mentionCount ?? 0;
    return { name, priorMentionCount: priorCount, currentMentionCount: currentCount, delta: currentCount - priorCount };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const priorUrls = new Set(prior.ownSiteCitations.map((c) => c.url));
  const currentUrls = new Set(current.ownSiteCitations.map((c) => c.url));
  const newCitations: CitationDiff[] = current.ownSiteCitations
    .filter((c) => !priorUrls.has(c.url))
    .filter((c, i, arr) => arr.findIndex((x) => x.url === c.url) === i)
    .map((c) => ({ url: c.url, title: c.title }));
  const lostCitations: CitationDiff[] = prior.ownSiteCitations
    .filter((c) => !currentUrls.has(c.url))
    .filter((c, i, arr) => arr.findIndex((x) => x.url === c.url) === i)
    .map((c) => ({ url: c.url, title: c.title }));

  return { scoreDiff, rankChanges, competitorDiffs, newCitations, lostCitations };
}
