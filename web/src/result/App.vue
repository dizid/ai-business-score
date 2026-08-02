<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { scoreBand } from '../../shared/aivis-core.mjs';

type Rank = 'ranked-1' | 'beaten' | 'not-mentioned';
type AdviceId = 'no-data' | 'zero-citations' | 'consistently-beaten' | 'leading' | 'mixed' | 'top-rival';
type AdviceTone = 'critical' | 'warning' | 'positive' | 'neutral';

interface PerPromptRank { promptIndex: number; rank: Rank; }
interface CompetitorTally { name: string; mentionCount: number; beatBrandCount: number; }
interface AdviceCard { id: AdviceId; tone: AdviceTone; params: Record<string, unknown>; }
interface RawResponse { promptIndex: number; model: string; text: string; }
interface FailureItem { model: string; promptIndex: number; error: string; }

interface ValidatedPayload {
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
}

// This page has no way to verify the #d= payload actually came from a real
// /scan call — it's a public static page reading data from a URL fragment,
// which anyone can forge and send as a link. Vue's template interpolation
// auto-escapes string fields, but numbers and enums need their own contract
// enforced here — a forged "citedCount" or "rank" value needs bounds-checking
// regardless of the rendering layer. Fail closed: reject anything that
// doesn't match the exact shape scan.mts produces, rather than coercing.
const RANKS = new Set(['ranked-1', 'beaten', 'not-mentioned']);
const ADVICE_IDS = new Set(['no-data', 'zero-citations', 'consistently-beaten', 'leading', 'mixed', 'top-rival']);
const ADVICE_TONES = new Set(['critical', 'warning', 'positive', 'neutral']);
const MAX_COMPETITORS = 12;
const MAX_ADVICE_CARDS = 3;
const MAX_NAME_LEN = 120;
const MAX_FAILURES = 12;
const MAX_ERROR_LEN = 300;

function asNonNegativeInt(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) return null;
  return n;
}

function asShortString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_NAME_LEN ? v : null;
}

function b64urlDecode(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const withPad = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  return decodeURIComponent(
    atob(withPad)
      .split('')
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('')
  );
}

function validatePayload(raw: any): ValidatedPayload | null {
  if (!raw || typeof raw !== 'object') return null;
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
      competitorTallies.push({ name, mentionCount, beatBrandCount });
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

  // failures: optional diagnostic list (why calls failed). Fail-closed on
  // structural problems, but the error text is free-form model/gateway output
  // so it's coerced+truncated rather than rejected. Same forgeable-payload
  // discipline as every other field here.
  const failures: FailureItem[] = [];
  if (raw.failures !== undefined) {
    if (!Array.isArray(raw.failures) || raw.failures.length > MAX_FAILURES) return null;
    for (const f of raw.failures) {
      const promptIndex = asNonNegativeInt(f && f.promptIndex);
      if (promptIndex === null || typeof f.model !== 'string' || f.model.length > MAX_NAME_LEN) return null;
      const error = typeof f.error === 'string' ? f.error.slice(0, MAX_ERROR_LEN) : '';
      failures.push({ model: f.model, promptIndex, error });
    }
  }

  const generatedAtDate = new Date(raw.generatedAt);
  if (Number.isNaN(generatedAtDate.getTime())) return null;

  // href-safety: only http(s) links get rendered as clickable — anything
  // else (javascript:, data:, etc.) is dropped rather than escaped, since
  // HTML-escaping a URL does not neutralize a javascript: scheme.
  const safeWebsiteHref = /^https?:\/\//i.test(raw.website) ? raw.website : null;

  return {
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
  };
}

const BAND_LABEL: Record<string, string> = {
  leading: 'Leading', visible: 'Visible, often beaten',
  weak: 'Weak presence', invisible: 'Invisible', unavailable: 'Score unavailable',
};
const BAND_EXPLAIN: Record<string, string> = {
  leading: 'Consistently the first brand AI mentions.',
  visible: 'AI knows this brand, but doesn’t always lead with it.',
  weak: 'Rarely comes up — mostly beaten or skipped.',
  invisible: 'Never came up in any completed check.',
  unavailable: 'No checks completed — try running the scan again.',
};
const ADVICE_TAG: Record<AdviceTone, string> = {
  critical: 'Priority', warning: 'Watch this', positive: 'Working well', neutral: 'Also worth noting',
};

const data = ref<ValidatedPayload | null>(null);
const errorKind = ref<'missing' | 'decode' | 'invalid' | null>(null);

onMounted(() => {
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const encoded = params.get('d');

  if (!encoded) {
    errorKind.value = 'missing';
    return;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(b64urlDecode(encoded));
  } catch {
    errorKind.value = 'decode';
    return;
  }

  const validated = validatePayload(raw);
  if (!validated) {
    errorKind.value = 'invalid';
    return;
  }

  data.value = validated;
});

const band = computed(() => (data.value ? scoreBand(data.value.score) : 'unavailable'));

const RING_R = 54;
const RING_STROKE = 12;
const ringCircumference = 2 * Math.PI * RING_R;
const ringOffset = computed(() =>
  data.value && data.value.score !== null ? ringCircumference * (1 - data.value.score / 100) : 0
);

const rank1Count = computed(() => data.value?.perPromptRank.filter((r) => r.rank === 'ranked-1').length ?? 0);
const beatenCount = computed(() => data.value?.perPromptRank.filter((r) => r.rank === 'beaten').length ?? 0);
const notMentionedCount = computed(() => data.value?.perPromptRank.filter((r) => r.rank === 'not-mentioned').length ?? 0);

const headlineKind = computed<'none' | 'zero' | 'beaten' | 'good'>(() => {
  if (!data.value) return 'none';
  if (data.value.completedCalls === 0) return 'none';
  if (data.value.citedCount === 0) return 'zero';
  if (beatenCount.value > 0) return 'beaten';
  return 'good';
});

interface ScoreboardRow { name: string; isYou: boolean; mentionCount: number; beatBrandCount: number; }
const scoreboardRows = computed<ScoreboardRow[]>(() => {
  if (!data.value || data.value.completedCalls === 0) return [];
  const rivals = [...data.value.competitorTallies].sort((a, b) => b.mentionCount - a.mentionCount);
  return [
    { name: data.value.brand, isYou: true, mentionCount: data.value.citedCount, beatBrandCount: 0 },
    ...rivals.map((r) => ({ ...r, isYou: false })),
  ];
});

function rowPct(row: ScoreboardRow) {
  if (!data.value || data.value.completedCalls === 0) return 0;
  return Math.min(100, Math.round((row.mentionCount / data.value.completedCalls) * 100));
}

// Only 'top-rival' can produce an empty body (when no valid competitor
// name survives re-validation) — the other advice ids always render
// something, mirroring the original ADVICE_COPY behavior where an empty
// body caused the whole card to be skipped.
const visibleAdvice = computed(() =>
  (data.value?.advice ?? []).filter((c) => c.id !== 'top-rival' || asShortString(c.params.name))
);
</script>

<template>
  <main>
    <template v-if="errorKind === 'missing'">
      <h1>No result data</h1>
      <p id="error">This link is missing its result data — it may be incomplete or corrupted. Ask for a fresh link.</p>
    </template>
    <template v-else-if="errorKind === 'decode'">
      <h1>Could not read result</h1>
      <p id="error">This link's data could not be decoded. Ask for a fresh link.</p>
    </template>
    <template v-else-if="errorKind === 'invalid'">
      <h1>Invalid result data</h1>
      <p id="error">This link's data doesn't match the expected format — it may be corrupted or not a genuine AIVis link. Ask for a fresh link.</p>
    </template>

    <template v-else-if="data">
      <h1>{{ data.brand }}</h1>
      <div class="meta">
        <a v-if="data.safeWebsiteHref" :href="data.safeWebsiteHref" target="_blank" rel="noopener">{{ data.website }}</a>
        <template v-else>{{ data.website }}</template>
        &middot; checked {{ data.generatedAtDate.toLocaleString() }}
      </div>

      <!-- score meter -->
      <div v-if="data.score === null" class="card score-card" :class="`band-${band}`">
        <div class="score-side">
          <div class="score-band-label">{{ BAND_LABEL[band] }}</div>
          <div class="score-explain">{{ BAND_EXPLAIN[band] }}</div>
        </div>
      </div>
      <div v-else class="card score-card" :class="`band-${band}`">
        <div class="score-ring-wrap">
          <svg viewBox="0 0 132 132">
            <circle class="score-ring-track" cx="66" cy="66" :r="RING_R" :stroke-width="RING_STROKE"></circle>
            <circle
              class="score-ring-fill" cx="66" cy="66" :r="RING_R" :stroke-width="RING_STROKE"
              :stroke-dasharray="ringCircumference" :stroke-dashoffset="ringOffset"
            ></circle>
          </svg>
          <div class="score-ring-number"><span class="value">{{ data.score }}</span><span class="of100">/ 100</span></div>
        </div>
        <div class="score-side">
          <div class="score-band-label">{{ BAND_LABEL[band] }}</div>
          <div class="score-explain">{{ BAND_EXPLAIN[band] }} AI Visibility Score — weighted for being mentioned first, not just mentioned.</div>
        </div>
      </div>

      <div class="headline">
        <template v-if="headlineKind === 'none'">We couldn't complete any checks for <strong>{{ data.brand }}</strong> this time — no data, not necessarily no visibility.</template>
        <template v-else-if="headlineKind === 'zero'"><span class="not-cited">{{ data.brand }} did not show up</span> when we asked AI search about {{ data.category }}.</template>
        <template v-else-if="headlineKind === 'beaten'">{{ data.brand }} showed up, but <span class="not-cited">competitors were mentioned first</span> in {{ beatenCount }} of {{ data.completedCalls }} checks.</template>
        <template v-else><span class="cited">{{ data.brand }} showed up</span> in {{ data.citedCount }} of {{ data.completedCalls }} checks — no competitor beat it to the mention.</template>
      </div>

      <div class="warn" v-if="data.ambiguousBrandFlag">
        Brand name is a common word — automated detection was skipped for some checks. Read the raw responses below before trusting the count.
      </div>
      <div class="warn" v-if="data.failedCalls > 0">
        {{ data.failedCalls }} of {{ data.completedCalls + data.failedCalls }} checks failed to complete and are not counted above.
        <ul class="fail-reasons" v-if="data.failures.length">
          <li v-for="(f, i) in data.failures" :key="i"><code>{{ f.model }}</code> — {{ f.error || 'no error message' }}</li>
        </ul>
      </div>

      <!-- scoreboard: emphasis bar chart (brand = accent, rivals = de-emphasis gray) -->
      <template v-if="scoreboardRows.length">
        <h2>Scoreboard</h2>
        <div class="card">
          <div class="board-row" v-for="row in scoreboardRows" :key="row.name + row.isYou">
            <div class="board-label">
              <span class="board-name" :title="row.name">{{ row.name }}<span v-if="row.isYou" class="you-tag"> (you)</span></span>
              <span class="board-count">{{ row.mentionCount }}/{{ data.completedCalls }}</span>
            </div>
            <div class="board-track"><div class="board-fill" :class="row.isYou ? 'you' : 'rival'" :style="{ width: rowPct(row) + '%' }"></div></div>
            <div class="board-beat" v-if="!row.isYou && row.beatBrandCount > 0">beat you {{ row.beatBrandCount }}×</div>
          </div>
        </div>
      </template>

      <!-- advice cards -->
      <template v-if="visibleAdvice.length">
        <h2>What to do next</h2>
        <div class="advice-card" :class="`tone-${card.tone}`" v-for="card in visibleAdvice" :key="card.id">
          <div class="advice-tag">{{ ADVICE_TAG[card.tone] || 'Note' }}</div>
          <div class="advice-body">
            <template v-if="card.id === 'no-data'">We couldn't complete any checks this time — likely a temporary API issue. Try running the scan again.</template>
            <template v-else-if="card.id === 'zero-citations'">You're invisible in AI search. Across {{ asNonNegativeInt(card.params.completedCalls) ?? '?' }} checks, this brand was never mentioned — not once. Getting cited even occasionally is the highest-leverage fix here: AI models lean on third-party mentions (reviews, directories, comparison content), not a brand's own site.</template>
            <template v-else-if="card.id === 'consistently-beaten'">
              <template v-if="asShortString(card.params.topCompetitorName)">AI knows this brand exists, but reaches for <strong>{{ asShortString(card.params.topCompetitorName) }}</strong> first — beaten to the mention in {{ asNonNegativeInt(card.params.beaten) ?? 0 }} of {{ asNonNegativeInt(card.params.completedCalls) ?? '?' }} checks. Closing this gap usually means more third-party content AI can point to as the definitive answer, not just a passing mention.</template>
              <template v-else>AI knows this brand exists, but a competitor is usually mentioned first — beaten in {{ asNonNegativeInt(card.params.beaten) ?? 0 }} of {{ asNonNegativeInt(card.params.completedCalls) ?? '?' }} checks.</template>
            </template>
            <template v-else-if="card.id === 'leading'">This is the AI's go-to answer. Every completed check ({{ asNonNegativeInt(card.params.completedCalls) ?? '?' }}/{{ asNonNegativeInt(card.params.completedCalls) ?? '?' }}) came up with this brand first — no competitor beat it to the mention. Worth re-checking periodically; this can shift as competitors publish new content.</template>
            <template v-else-if="card.id === 'mixed'">Mixed results across {{ asNonNegativeInt(card.params.completedCalls) ?? '?' }} checks: ranked first in {{ asNonNegativeInt(card.params.ranked1) ?? 0 }}, beaten by a competitor in {{ asNonNegativeInt(card.params.beaten) ?? 0 }}, not mentioned at all in {{ asNonNegativeInt(card.params.notMentioned) ?? 0 }}. The not-mentioned checks are the biggest opportunity — competitors aren't necessarily winning those either, nobody is.</template>
            <template v-else-if="card.id === 'top-rival'"><strong>{{ asShortString(card.params.name) }}</strong> is the competitor showing up most — mentioned in {{ asNonNegativeInt(card.params.mentionCount) ?? 0 }} of {{ asNonNegativeInt(card.params.completedCalls) ?? '?' }} checks. Worth understanding what makes them citable (content structure, third-party coverage, reviews).</template>
          </div>
        </div>
      </template>

      <h2>Raw data</h2>
      <details>
        <summary>Raw AI responses (for manual review)</summary>
        <div class="response" v-for="(r, i) in data.rawResponses" :key="i">
          <div class="label">Prompt {{ r.promptIndex + 1 }} &middot; {{ r.model }}</div>
          {{ r.text }}
        </div>
      </details>

      <footer>Detection is presence-only, not sentiment-aware — a negative or comparative mention still counts as "cited." The score above is a heuristic weighting of that same presence-only detection, not an independently verified rank. This is a single point-in-time check, not a monitored score. Results are fixed at generation time; this link will always show the same result.</footer>
    </template>

    <template v-else-if="!errorKind">
      <p>Loading result...</p>
    </template>
  </main>
</template>

<style scoped>
main {
  max-width: 640px;
  margin: 0 auto;
  padding: 40px 20px 80px;
}
h1 { font-size: 1.5rem; margin: 0 0 2px; }
.meta { color: var(--muted); font-size: 0.9rem; margin-bottom: 20px; }

.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px;
  margin-bottom: 16px;
}

/* ---- score meter ---- */
.score-card { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
.score-ring-wrap { position: relative; width: 132px; height: 132px; flex: none; }
.score-ring-wrap svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.score-ring-track { fill: none; stroke: var(--gridline); }
.score-ring-fill { fill: none; stroke-linecap: round; transition: stroke-dashoffset 0.6s ease; }
@media (prefers-reduced-motion: reduce) { .score-ring-fill { transition: none; } }
.score-ring-number {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
}
.score-ring-number .value { font-size: 2rem; font-weight: 600; font-variant-numeric: proportional-nums; line-height: 1; }
.score-ring-number .of100 { font-size: 0.75rem; color: var(--faint); margin-top: 2px; }
.score-side { flex: 1; min-width: 180px; }
.score-band-label { font-size: 1.05rem; font-weight: 600; margin-bottom: 4px; }
.score-explain { color: var(--muted); font-size: 0.88rem; }
.band-leading .score-ring-fill { stroke: var(--good); }
.band-leading .score-band-label { color: var(--success-text); }
.band-visible .score-ring-fill { stroke: var(--warning); }
.band-weak .score-ring-fill { stroke: var(--serious); }
.band-invisible .score-ring-fill { stroke: var(--critical); }

.headline { font-size: 1.05rem; font-weight: 500; margin-bottom: 4px; }
.cited { color: var(--success-text); }
.not-cited { color: var(--critical); }

.warn {
  background: color-mix(in srgb, var(--warning) 16%, var(--card));
  border: 1px solid color-mix(in srgb, var(--warning) 45%, var(--border));
  color: var(--fg);
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 0.88rem;
  margin-bottom: 12px;
}
.fail-reasons { margin: 8px 0 0; padding-left: 18px; font-size: 13px; line-height: 1.5; }
.fail-reasons code { font-size: 12px; word-break: break-all; }

/* ---- scoreboard (emphasis bar chart: brand = accent, rivals = de-emphasis gray) ---- */
.board-row { margin-bottom: 12px; }
.board-row:last-child { margin-bottom: 0; }
.board-label {
  display: flex; justify-content: space-between; gap: 8px;
  font-size: 0.88rem; margin-bottom: 4px;
}
.board-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.board-name .you-tag { color: var(--accent); font-weight: 600; }
.board-count { color: var(--muted); flex: none; font-variant-numeric: proportional-nums; }
.board-track { height: 20px; border-radius: 5px; background: var(--gridline); overflow: hidden; }
.board-fill { height: 100%; border-radius: 5px; }
.board-fill.you { background: var(--accent); }
.board-fill.rival { background: var(--debar); }
.board-beat { color: var(--serious); font-size: 0.8rem; margin-top: 2px; }

/* ---- advice cards ---- */
.advice-card {
  border-left: 4px solid var(--border);
  background: var(--card);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 10px;
}
.advice-card:last-child { margin-bottom: 0; }
.advice-tag {
  display: inline-block; font-size: 0.72rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.04em;
  margin-bottom: 4px;
}
.advice-card.tone-critical { border-left-color: var(--critical); }
.advice-card.tone-critical .advice-tag { color: var(--critical); }
.advice-card.tone-warning { border-left-color: var(--warning); }
.advice-card.tone-warning .advice-tag { color: color-mix(in srgb, var(--warning) 70%, var(--fg)); }
.advice-card.tone-positive { border-left-color: var(--good); }
.advice-card.tone-positive .advice-tag { color: var(--success-text); }
.advice-card.tone-neutral { border-left-color: var(--faint); }
.advice-card.tone-neutral .advice-tag { color: var(--muted); }
.advice-body { font-size: 0.92rem; }

h2 { font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--muted); margin: 28px 0 10px; }
h2:first-of-type { margin-top: 0; }

details {
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 12px 16px;
  background: var(--card);
}
summary { cursor: pointer; font-weight: 600; }
.response {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
  font-size: 0.9rem;
}
.response:first-of-type { border-top: none; margin-top: 8px; padding-top: 8px; }
.response .label { color: var(--muted); font-size: 0.8rem; margin-bottom: 4px; }
footer { margin-top: 28px; color: var(--faint); font-size: 0.78rem; }
#error { color: var(--critical); }
</style>
