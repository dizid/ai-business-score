<script setup lang="ts">
import { computed } from 'vue';
import { scoreBand } from '../../shared/aivis-core.mjs';
import { asNonNegativeInt, asShortString, type ValidatedPayload, type AdviceTone } from './scanPayload';

// Shared between result/App.vue (a shareable, standalone page) and
// history/App.vue's detail pane (master-detail dashboard) — same rendering
// for the same validated payload shape, so the two views can never drift
// out of sync the way two hand-copied templates eventually would.
const props = defineProps<{ payload: ValidatedPayload }>();

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

const band = computed(() => scoreBand(props.payload.score));

const RING_R = 54;
const RING_STROKE = 12;
const ringCircumference = 2 * Math.PI * RING_R;
const ringOffset = computed(() =>
  props.payload.score !== null ? ringCircumference * (1 - props.payload.score / 100) : 0
);

const rank1Count = computed(() => props.payload.perPromptRank.filter((r) => r.rank === 'ranked-1').length);
const beatenCount = computed(() => props.payload.perPromptRank.filter((r) => r.rank === 'beaten').length);

const headlineKind = computed<'none' | 'zero' | 'beaten' | 'good'>(() => {
  if (props.payload.completedCalls === 0) return 'none';
  if (props.payload.citedCount === 0) return 'zero';
  if (beatenCount.value > 0) return 'beaten';
  return 'good';
});

interface ScoreboardRow { name: string; isYou: boolean; mentionCount: number; beatBrandCount: number; }
const scoreboardRows = computed<ScoreboardRow[]>(() => {
  if (props.payload.completedCalls === 0) return [];
  const rivals = [...props.payload.competitorTallies].sort((a, b) => b.mentionCount - a.mentionCount);
  return [
    { name: props.payload.brand, isYou: true, mentionCount: props.payload.citedCount, beatBrandCount: 0 },
    ...rivals.map((r) => ({ ...r, isYou: false })),
  ];
});

function rowPct(row: ScoreboardRow) {
  if (props.payload.completedCalls === 0) return 0;
  return Math.min(100, Math.round((row.mentionCount / props.payload.completedCalls) * 100));
}

// Only 'top-rival' can produce an empty body (when no valid competitor
// name survives re-validation) — the other advice ids always render
// something, mirroring the original ADVICE_COPY behavior where an empty
// body caused the whole card to be skipped.
const visibleAdvice = computed(() =>
  props.payload.advice.filter((c) => c.id !== 'top-rival' || asShortString(c.params.name))
);
</script>

<template>
  <div class="scan-detail">
    <h1>{{ payload.brand }}</h1>
    <div class="meta">
      <a v-if="payload.safeWebsiteHref" :href="payload.safeWebsiteHref" target="_blank" rel="noopener">{{ payload.website }}</a>
      <template v-else>{{ payload.website }}</template>
      &middot; checked {{ payload.generatedAtDate.toLocaleString() }}
    </div>

    <!-- score meter -->
    <div v-if="payload.score === null" class="card score-card" :class="`band-${band}`">
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
        <div class="score-ring-number"><span class="value">{{ payload.score }}</span><span class="of100">/ 100</span></div>
      </div>
      <div class="score-side">
        <div class="score-band-label">{{ BAND_LABEL[band] }}</div>
        <div class="score-explain">{{ BAND_EXPLAIN[band] }} AI Visibility Score — weighted for being mentioned first, not just mentioned.</div>
      </div>
    </div>

    <div class="headline">
      <template v-if="headlineKind === 'none'">We couldn't complete any checks for <strong>{{ payload.brand }}</strong> this time — no data, not necessarily no visibility.</template>
      <template v-else-if="headlineKind === 'zero'"><span class="not-cited">{{ payload.brand }} did not show up</span> when we asked AI search about {{ payload.category }}.</template>
      <template v-else-if="headlineKind === 'beaten'">{{ payload.brand }} showed up, but <span class="not-cited">competitors were mentioned first</span> in {{ beatenCount }} of {{ payload.completedCalls }} checks.</template>
      <template v-else><span class="cited">{{ payload.brand }} showed up</span> in {{ payload.citedCount }} of {{ payload.completedCalls }} checks — no competitor beat it to the mention.</template>
    </div>

    <div class="warn" v-if="payload.ambiguousBrandFlag">
      Brand name is a common word — automated detection was skipped for some checks. Read the raw responses below before trusting the count.
    </div>
    <div class="warn" v-if="payload.failedCalls > 0">
      {{ payload.failedCalls }} of {{ payload.completedCalls + payload.failedCalls }} checks failed to complete and are not counted above.
    </div>

    <!-- scoreboard: emphasis bar chart (brand = accent, rivals = de-emphasis gray) -->
    <template v-if="scoreboardRows.length">
      <h2>Scoreboard</h2>
      <div class="card">
        <div class="board-row" v-for="row in scoreboardRows" :key="row.name + row.isYou">
          <div class="board-label">
            <span class="board-name" :title="row.name">{{ row.name }}<span v-if="row.isYou" class="you-tag"> (you)</span></span>
            <span class="board-count">{{ row.mentionCount }}/{{ payload.completedCalls }}</span>
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
      <div class="response" v-for="(r, i) in payload.rawResponses" :key="i">
        <div class="label">Prompt {{ r.promptIndex + 1 }} &middot; {{ r.model }}</div>
        {{ r.text }}
      </div>
    </details>

    <footer>Detection is presence-only, not sentiment-aware — a negative or comparative mention still counts as "cited." The score above is a heuristic weighting of that same presence-only detection, not an independently verified rank. This is a single point-in-time check, not a monitored score. Results are fixed at generation time; this link will always show the same result.</footer>
  </div>
</template>

<style scoped>
h1 { font-size: 1.5rem; margin: 0 0 2px; }
.meta { color: var(--muted); font-size: 0.9rem; margin-bottom: 20px; }
.meta a {
  text-decoration: underline;
  text-underline-offset: 2px;
  padding: 4px 2px;
  margin: -4px -2px;
  display: inline-block;
}
.meta a:hover, .meta a:active { color: var(--fg); }

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
</style>
