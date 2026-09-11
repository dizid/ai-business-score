<script setup lang="ts">
// Executive Summary section of the dashboard report (2026-09-11 redesign):
// score + verdict + "what to do next" — the at-a-glance card, not the deep
// GEO/SEO drill-downs (those live in ReportGeoSection.vue/ReportSeoSection.vue)
// or scan-level extras (ReportScanDetails.vue). Dashboard-theme only —
// ScanDetail.vue's legacy branch (theme="legacy") never renders this.
import { computed } from 'vue';
import { scoreBand } from '../../../shared/aivis-core.mjs';
import { asNonNegativeInt, asShortString, asAdviceExcerpt, type ValidatedPayload } from '../scanPayload';
import { BAND_LABEL, BAND_EXPLAIN, ADVICE_HEADING } from '../scanLabels';
import {
  deriveExecutiveSummary, deriveKeyMetrics, deriveSentimentSummaryRows, deriveSentimentAdvice,
  deriveVisibleAdvice, deriveHeadlineKind, deriveBeatenCount, confidenceLabel, deriveHarmoniaBand,
} from '../scanDerived';

const props = defineProps<{
  payload: ValidatedPayload;
  categoryBenchmark?: {
    companyCount: number;
    avgScore: number | null;
    medianScore: number | null;
    sufficientData: boolean;
    minSampleSize: number;
  } | null;
}>();

const band = computed(() => scoreBand(props.payload.score));
const RING_R = 54;
const RING_STROKE = 12;
const ringCircumference = 2 * Math.PI * RING_R;
const ringOffset = computed(() =>
  props.payload.score !== null ? ringCircumference * (1 - props.payload.score / 100) : 0
);
const confidence = computed(() =>
  confidenceLabel(props.payload.completedCalls, props.payload.completedCalls + props.payload.failedCalls)
);
const headlineKind = computed(() => deriveHeadlineKind(props.payload));
const beatenCount = computed(() => deriveBeatenCount(props.payload));
const executiveSummary = computed(() => deriveExecutiveSummary(props.payload));
const keyMetrics = computed(() => deriveKeyMetrics(props.payload));
const sentimentSummaryRows = computed(() => deriveSentimentSummaryRows(props.payload));
const sentimentAdvice = computed(() => deriveSentimentAdvice(props.payload));
const visibleAdvice = computed(() => deriveVisibleAdvice(props.payload));
const harmoniaBand = computed(() => deriveHarmoniaBand(props.payload));
</script>

<template>
  <div class="report-summary">
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
        <div class="confidence-note">Confidence: {{ confidence }} — based on {{ payload.completedCalls }} / {{ payload.completedCalls + payload.failedCalls }} successful checks.</div>
        <a class="methodology-link" href="/how-it-works#methodology" target="_blank" rel="noopener">How this is measured &rarr;</a>
      </div>
      <div class="score-site-health" v-if="payload.harmonia">
        <span class="site-health-label">Site Health</span>
        <span class="site-health-score" :class="`band-text-${harmoniaBand}`">{{ payload.harmonia.harmoniaScore ?? '—' }}<span class="of100">/100</span></span>
      </div>
    </div>

    <div class="card category-benchmark" v-if="categoryBenchmark && categoryBenchmark.sufficientData">
      <div class="benchmark-row">
        <span class="benchmark-label">Businesses like yours ({{ payload.category }})</span>
        <span class="benchmark-value">avg {{ categoryBenchmark.avgScore }}/100 &middot; median {{ categoryBenchmark.medianScore }}/100</span>
      </div>
      <p class="benchmark-note">Based on {{ categoryBenchmark.companyCount }} other tracked businesses in this category, last 90 days.</p>
    </div>
    <p class="benchmark-empty" v-else-if="categoryBenchmark && !categoryBenchmark.sufficientData">
      Not enough other businesses tracked in &ldquo;{{ payload.category }}&rdquo; yet for a category benchmark ({{ categoryBenchmark.companyCount }}/{{ categoryBenchmark.minSampleSize }} so far) — this fills in as more businesses get scanned.
    </p>

    <div class="headline">
      <template v-if="headlineKind === 'none'">We couldn't complete any checks for <strong>{{ payload.brand }}</strong> this time — no data, not necessarily no visibility.</template>
      <template v-else-if="headlineKind === 'zero'"><span class="not-cited">{{ payload.brand }} did not show up</span> when we asked AI search about {{ payload.category }}.</template>
      <template v-else-if="headlineKind === 'beaten'">{{ payload.brand }} showed up, but <span class="not-cited">competitors were mentioned first</span> in {{ beatenCount }} of {{ payload.completedCalls }} checks.</template>
      <template v-else><span class="cited">{{ payload.brand }} showed up</span> in {{ payload.citedCount }} of {{ payload.completedCalls }} checks — no competitor beat it to the mention.</template>
    </div>

    <div class="warn" v-if="payload.ambiguousBrandFlag">
      Brand name is a common word — automated detection was skipped for some checks. Read the raw responses in the GEO section before trusting the count.
    </div>
    <div class="warn" v-if="payload.failedCalls > 0">
      {{ payload.failedCalls }} of {{ payload.completedCalls + payload.failedCalls }} checks failed to complete and are not counted above.
    </div>

    <div class="card exec-summary" v-if="payload.completedCalls > 0">
      <div class="exec-summary-label">Executive summary</div>
      <p class="exec-summary-verdict">{{ executiveSummary.verdict }}</p>
      <ul class="exec-summary-list">
        <li v-if="executiveSummary.vulnerability"><strong>Biggest vulnerability:</strong> {{ executiveSummary.vulnerability }}</li>
        <li v-if="executiveSummary.quickWin"><strong>Quick win:</strong> {{ executiveSummary.quickWin }}</li>
      </ul>
    </div>

    <div class="key-metrics-row" v-if="keyMetrics">
      <div class="key-metric-tile">
        <div class="key-metric-value">{{ keyMetrics.recommendationRatePct }}%</div>
        <div class="key-metric-label">AI recommendation rate</div>
      </div>
      <div class="key-metric-tile">
        <div class="key-metric-value">{{ keyMetrics.firstChoiceRatePct }}%</div>
        <div class="key-metric-label">AI first-choice rate</div>
      </div>
      <div class="key-metric-tile" v-if="keyMetrics.topCompetitorName">
        <div class="key-metric-value">{{ keyMetrics.topCompetitorTakeoverRatePct }}%</div>
        <div class="key-metric-label">Taken by {{ keyMetrics.topCompetitorName }}</div>
      </div>
    </div>

    <div class="sentiment-summary-row" v-if="sentimentSummaryRows.length">
      <span
        v-for="row in sentimentSummaryRows" :key="row.classification"
        class="sentiment-badge" :class="`sentiment-${row.classification}`"
      >{{ row.count }} {{ row.label }}</span>
    </div>

    <template v-if="visibleAdvice.length || sentimentAdvice">
      <h2>What to do next</h2>
      <div class="advice-card" :class="`tone-${card.tone}`" v-for="card in visibleAdvice" :key="card.id">
        <div class="advice-tag">{{ ADVICE_HEADING[card.id] || 'Note' }}</div>
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
        <blockquote class="advice-excerpt" v-if="asAdviceExcerpt(card.params.excerpt)">
          &ldquo;&hellip;{{ asAdviceExcerpt(card.params.excerpt)!.snippet }}&hellip;&rdquo;
          <cite>{{ asAdviceExcerpt(card.params.excerpt)!.promptLabel }}</cite>
        </blockquote>
      </div>
      <div class="advice-card tone-warning" v-if="sentimentAdvice">
        <div class="advice-tag">Sentiment</div>
        <div class="advice-body">
          AI mentioned {{ payload.brand }}, but framed it unfavorably in {{ sentimentAdvice.unfavorable }} of {{ sentimentAdvice.total }} judged
          check{{ sentimentAdvice.total === 1 ? '' : 's' }} ({{ sentimentAdvice.negative }} negative, {{ sentimentAdvice.comparisonOnly }} comparison-only) —
          a mention isn't the same as a good mention. See the GEO section for the flagged responses.
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow); }
h2 { font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--muted); margin: 28px 0 10px; }
h2:first-of-type { margin-top: 0; }

.score-card { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; padding: 24px; }
.score-ring-wrap { position: relative; width: 132px; height: 132px; flex: none; }
.score-ring-wrap svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.score-ring-track { fill: none; stroke: var(--gridline); }
.score-ring-fill { fill: none; stroke-linecap: round; transition: stroke-dashoffset 0.6s ease; }
@media (prefers-reduced-motion: reduce) { .score-ring-fill { transition: none; } }
.score-ring-number { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.score-ring-number .value { font-size: 2.3rem; font-weight: 700; font-variant-numeric: proportional-nums; line-height: 1; font-family: var(--font-display); }
.score-ring-number .of100 { font-size: 0.75rem; color: var(--faint); margin-top: 3px; }
.score-side { flex: 1; min-width: 180px; }
.score-band-label { font-size: 1.15rem; font-weight: 700; margin-bottom: 4px; }
.score-explain { color: var(--muted); font-size: 0.88rem; }
.confidence-note { font-size: 0.8rem; color: var(--faint); margin-top: 8px; }
.methodology-link { display: inline-block; font-size: 0.8rem; color: var(--accent); margin-top: 4px; text-decoration: none; }
.methodology-link:hover { text-decoration: underline; }
.score-site-health {
  flex: none; text-align: right; padding-left: 20px; border-left: 1px solid var(--border);
  align-self: stretch; display: flex; flex-direction: column; justify-content: center;
}
.site-health-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--muted); margin-bottom: 2px; }
.site-health-score { font-size: 1.3rem; font-weight: 700; font-variant-numeric: proportional-nums; font-family: var(--font-display); color: var(--accent-2); }
.site-health-score .of100 { font-size: 0.7rem; color: var(--faint); font-weight: 500; }

.band-leading.score-card { background: color-mix(in srgb, var(--good) 6%, var(--card)); border-color: color-mix(in srgb, var(--good) 28%, var(--border)); }
.band-leading .score-ring-fill { stroke: var(--good); filter: drop-shadow(0 0 8px color-mix(in srgb, var(--good) 55%, transparent)); }
.band-leading .score-band-label { color: var(--success-text); }
.band-visible.score-card { background: color-mix(in srgb, var(--warning) 6%, var(--card)); border-color: color-mix(in srgb, var(--warning) 28%, var(--border)); }
.band-visible .score-ring-fill { stroke: var(--warning); filter: drop-shadow(0 0 8px color-mix(in srgb, var(--warning) 55%, transparent)); }
.band-weak.score-card { background: color-mix(in srgb, var(--serious) 6%, var(--card)); border-color: color-mix(in srgb, var(--serious) 28%, var(--border)); }
.band-weak .score-ring-fill { stroke: var(--serious); filter: drop-shadow(0 0 8px color-mix(in srgb, var(--serious) 55%, transparent)); }
.band-invisible.score-card { background: color-mix(in srgb, var(--critical) 6%, var(--card)); border-color: color-mix(in srgb, var(--critical) 28%, var(--border)); }
.band-invisible .score-ring-fill { stroke: var(--critical); filter: drop-shadow(0 0 8px color-mix(in srgb, var(--critical) 55%, transparent)); }

.band-text-leading { color: var(--success-text); }
.band-text-visible { color: color-mix(in srgb, var(--warning) 70%, var(--fg)); }
.band-text-weak { color: var(--serious); }
.band-text-invisible { color: var(--critical); }
.band-text-unavailable { color: var(--muted); }

.category-benchmark { padding: 14px 20px; }
.benchmark-row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; font-size: 0.88rem; }
.benchmark-label { font-weight: 600; }
.benchmark-value { color: var(--muted); font-variant-numeric: proportional-nums; }
.benchmark-note { color: var(--faint); font-size: 0.78rem; margin: 6px 0 0; }
.benchmark-empty { color: var(--muted); font-size: 0.82rem; margin: 0 0 16px; }

.headline { font-size: 1.1rem; font-weight: 500; margin-bottom: 8px; }
.cited { color: var(--success-text); }
.not-cited { color: var(--critical); }

.warn {
  background: color-mix(in srgb, var(--warning) 16%, var(--card));
  border: 1px solid color-mix(in srgb, var(--warning) 45%, var(--border));
  color: var(--fg); padding: 10px 14px; border-radius: 8px; font-size: 0.88rem; margin-bottom: 12px;
}

.exec-summary { padding: 18px 20px; }
.exec-summary-label { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin-bottom: 6px; }
.exec-summary-verdict { font-size: 1rem; font-weight: 500; margin: 0 0 10px; }
.exec-summary-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.exec-summary-list li { font-size: 0.9rem; }
.exec-summary-list strong { color: var(--fg); }

.key-metrics-row { display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 16px; }
.key-metric-tile { flex: 1 1 140px; background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }
.key-metric-value { font-size: 1.4rem; font-weight: 700; font-variant-numeric: proportional-nums; }
.key-metric-label { font-size: 0.78rem; color: var(--muted); margin-top: 2px; }

.sentiment-summary-row { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 16px; }
.sentiment-badge { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 2px 9px; border-radius: 999px; flex: none; white-space: nowrap; }
.sentiment-recommended { background: color-mix(in srgb, var(--good) 20%, transparent); color: var(--success-text); }
.sentiment-neutral { background: color-mix(in srgb, var(--faint) 20%, transparent); color: var(--muted); }
.sentiment-negative { background: color-mix(in srgb, var(--critical) 16%, transparent); color: var(--critical); }
.sentiment-comparison-only { background: color-mix(in srgb, var(--warning) 22%, transparent); color: color-mix(in srgb, var(--warning) 70%, var(--fg)); }

.advice-card { border-left: 4px solid var(--border); background: var(--card); border-radius: 10px; padding: 14px 18px; margin-bottom: 10px; box-shadow: var(--shadow); }
.advice-card:last-child { margin-bottom: 0; }
.advice-tag { display: inline-block; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
.advice-card.tone-critical { border-left-color: var(--critical); }
.advice-card.tone-critical .advice-tag { color: var(--critical); }
.advice-card.tone-warning { border-left-color: var(--warning); }
.advice-card.tone-warning .advice-tag { color: color-mix(in srgb, var(--warning) 70%, var(--fg)); }
.advice-card.tone-positive { border-left-color: var(--good); }
.advice-card.tone-positive .advice-tag { color: var(--success-text); }
.advice-card.tone-neutral { border-left-color: var(--faint); }
.advice-card.tone-neutral .advice-tag { color: var(--muted); }
.advice-body { font-size: 0.92rem; }
.advice-excerpt { margin: 10px 0 0; padding: 8px 12px; border-left: 2px solid var(--border); font-size: 0.85rem; font-style: italic; color: var(--muted); }
.advice-excerpt cite { display: block; margin-top: 4px; font-size: 0.76rem; font-style: normal; color: var(--faint); }
</style>
