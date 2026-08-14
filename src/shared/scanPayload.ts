// Shared payload shape + validation for a completed scan result. Used by
// both result/App.vue (payload arrives via an untrusted, forgeable URL
// fragment — see that file's header comment) and history/App.vue (payload
// arrives from our own /history endpoint, which returns Blobs-stored
// records verbatim). Reusing the same fail-closed validator for both means
// a malformed record degrades the same way — a skipped/blank field, never a
// thrown error — regardless of which page renders it.

// 'beaten' is a legacy rank value from the pre-positional-ranking scoring
// model — no longer produced by aggregateProspect, but scans persisted
// before that change still have it in their stored perPromptRank, so it
// stays accepted here rather than making old scans fail validation.
export type Rank = 'ranked-1' | 'ranked-2' | 'ranked-3' | 'mentioned' | 'not-mentioned' | 'beaten';
export type AdviceId = 'no-data' | 'zero-citations' | 'consistently-beaten' | 'leading' | 'mixed' | 'top-rival';
export type AdviceTone = 'critical' | 'warning' | 'positive' | 'neutral';

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface PerPromptRank { promptIndex: number; rank: Rank; }
export interface CompetitorTally { name: string; mentionCount: number; beatBrandCount: number; ambiguous: boolean; }
export interface AdviceCard { id: AdviceId; tone: AdviceTone; params: Record<string, unknown>; }
export interface RawResponse { promptIndex: number; model: string; text: string; }
export interface FailureItem { model: string; promptIndex: number; error: string; }
export interface DeepAdviceStep { title: string; reasoning: string; difficulty: Difficulty; }
export interface DeepAdvice { steps: DeepAdviceStep[]; }

export interface ValidatedPayload {
  id: string;
  brand: string;
  website: string;
  safeWebsiteHref: string | null;
  category: string;
  citedCount: number;
  completedCalls: number;
  failedCalls: number;
  ambiguousBrandFlag: boolean;
  perPromptRank: PerPromptRank[];
  competitorTallies: CompetitorTally[];
  score: number | null;
  advice: AdviceCard[];
  rawResponses: RawResponse[];
  failures: FailureItem[];
  generatedAtDate: Date;
  deepAdvice: DeepAdvice | null;
  deepAdviceGeneratedAtDate: Date | null;
}

const RANKS = new Set(['ranked-1', 'ranked-2', 'ranked-3', 'mentioned', 'not-mentioned', 'beaten']);
const ADVICE_IDS = new Set(['no-data', 'zero-citations', 'consistently-beaten', 'leading', 'mixed', 'top-rival']);
const ADVICE_TONES = new Set(['critical', 'warning', 'positive', 'neutral']);
const DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard']);
const MAX_COMPETITORS = 12;
const MAX_ADVICE_CARDS = 3;
const MAX_DEEP_ADVICE_STEPS = 5;
const MAX_NAME_LEN = 120;
const MAX_TEXT_LEN = 600;
const MAX_FAILURES = 40;
const MAX_ERROR_LEN = 300;

export function asNonNegativeInt(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) return null;
  return n;
}

export function asShortString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_NAME_LEN ? v : null;
}

export function b64urlDecode(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const withPad = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  return decodeURIComponent(
    atob(withPad)
      .split('')
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('')
  );
}

// This validator is the only thing standing between a hostile/forged
// payload and whatever renders it — fail closed: reject anything that
// doesn't match the exact shape scan.mts produces, rather than coercing.
export function validatePayload(raw: any): ValidatedPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (typeof raw.brand !== 'string' || typeof raw.website !== 'string' || typeof raw.category !== 'string') return null;

  const citedCount = asNonNegativeInt(raw.citedCount);
  const completedCalls = asNonNegativeInt(raw.completedCalls);
  const failedCalls = asNonNegativeInt(raw.failedCalls);
  if (citedCount === null || completedCalls === null || failedCalls === null) return null;

  if (!Array.isArray(raw.perPromptRank)) return null;
  const perPromptRank: PerPromptRank[] = [];
  for (const r of raw.perPromptRank) {
    const promptIndex = asNonNegativeInt(r && r.promptIndex);
    if (promptIndex === null || !RANKS.has(r.rank)) return null;
    perPromptRank.push({ promptIndex, rank: r.rank });
  }

  // score: null (unavailable) or a 0-100 integer. Never trust a forged
  // score blindly — recomputing it from perPromptRank/completedCalls would
  // be the fully-defensive option, but the formula is deliberately
  // duplicated nowhere else client-side; bounds-check instead.
  let score: number | null = null;
  if (raw.score !== null) {
    const n = asNonNegativeInt(raw.score);
    if (n === null || n > 100) return null;
    score = n;
  }

  const competitorTallies: CompetitorTally[] = [];
  if (raw.competitorTallies !== undefined) {
    if (!Array.isArray(raw.competitorTallies) || raw.competitorTallies.length > MAX_COMPETITORS) return null;
    for (const c of raw.competitorTallies) {
      const name = asShortString(c && c.name);
      const mentionCount = asNonNegativeInt(c && c.mentionCount);
      const beatBrandCount = asNonNegativeInt(c && c.beatBrandCount);
      if (name === null || mentionCount === null || beatBrandCount === null) return null;
      if (mentionCount > completedCalls || beatBrandCount > mentionCount) return null;
      // ambiguous is new (Milestone A2) — missing/old data (pre-migration
      // scans, or a forged payload that omits it) defaults to false rather
      // than rejecting the whole payload.
      const ambiguous = c && c.ambiguous === true;
      competitorTallies.push({ name, mentionCount, beatBrandCount, ambiguous });
    }
  }

  const advice: AdviceCard[] = [];
  if (raw.advice !== undefined) {
    if (!Array.isArray(raw.advice) || raw.advice.length > MAX_ADVICE_CARDS) return null;
    for (const a of raw.advice) {
      if (!a || typeof a !== 'object') return null;
      if (!ADVICE_IDS.has(a.id) || !ADVICE_TONES.has(a.tone)) return null;
      const params = a.params && typeof a.params === 'object' ? a.params : {};
      advice.push({ id: a.id, tone: a.tone, params });
    }
  }

  if (!Array.isArray(raw.rawResponses)) return null;
  const rawResponses: RawResponse[] = [];
  for (const r of raw.rawResponses) {
    const promptIndex = asNonNegativeInt(r && r.promptIndex);
    if (promptIndex === null || typeof r.model !== 'string' || typeof r.text !== 'string') return null;
    rawResponses.push({ promptIndex, model: r.model, text: r.text });
  }

  // failures: optional diagnostic list (why calls failed) — new in
  // Milestone A3. Missing/malformed degrades to [] rather than rejecting
  // the whole payload (old rows predate the column; a forged payload might
  // omit it entirely) — same lenient discipline as competitorTallies'
  // ambiguous flag above, since this is diagnostic detail, not something
  // the rest of the UI depends on for correctness.
  const failures: FailureItem[] = [];
  if (Array.isArray(raw.failures)) {
    for (const f of raw.failures.slice(0, MAX_FAILURES)) {
      const promptIndex = asNonNegativeInt(f && f.promptIndex);
      if (promptIndex === null || typeof (f && f.model) !== 'string') continue;
      const error = typeof f.error === 'string' ? f.error.slice(0, MAX_ERROR_LEN) : '';
      failures.push({ model: f.model.slice(0, MAX_NAME_LEN), promptIndex, error });
    }
  }

  const generatedAtDate = new Date(raw.generatedAt);
  if (Number.isNaN(generatedAtDate.getTime())) return null;

  // deepAdvice is genuinely optional (may not have been generated yet) —
  // missing/null/malformed all degrade to null rather than rejecting the
  // whole payload, since it's a bonus on top of the always-present
  // rule-based advice above.
  let deepAdvice: DeepAdvice | null = null;
  if (raw.deepAdvice && typeof raw.deepAdvice === 'object' && Array.isArray(raw.deepAdvice.steps)) {
    const steps: DeepAdviceStep[] = [];
    for (const s of raw.deepAdvice.steps.slice(0, MAX_DEEP_ADVICE_STEPS)) {
      if (!s || typeof s.title !== 'string' || !s.title) continue;
      steps.push({
        title: s.title.slice(0, MAX_NAME_LEN * 2),
        reasoning: typeof s.reasoning === 'string' ? s.reasoning.slice(0, MAX_TEXT_LEN) : '',
        difficulty: DIFFICULTIES.has(s.difficulty) ? s.difficulty : 'Medium',
      });
    }
    if (steps.length) deepAdvice = { steps };
  }
  let deepAdviceGeneratedAtDate: Date | null = null;
  if (typeof raw.deepAdviceGeneratedAt === 'string') {
    const d = new Date(raw.deepAdviceGeneratedAt);
    if (!Number.isNaN(d.getTime())) deepAdviceGeneratedAtDate = d;
  }

  // href-safety: only http(s) links get rendered as clickable — anything
  // else (javascript:, data:, etc.) is dropped rather than escaped, since
  // HTML-escaping a URL does not neutralize a javascript: scheme.
  const safeWebsiteHref = /^https?:\/\//i.test(raw.website) ? raw.website : null;

  return {
    id: raw.id,
    brand: raw.brand,
    website: raw.website,
    safeWebsiteHref,
    category: raw.category,
    citedCount,
    completedCalls,
    failedCalls,
    ambiguousBrandFlag: raw.ambiguousBrandFlag === true,
    perPromptRank,
    competitorTallies,
    score,
    advice,
    rawResponses,
    failures,
    generatedAtDate,
    deepAdvice,
    deepAdviceGeneratedAtDate,
  };
}
