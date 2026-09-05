<script setup lang="ts">
// Dedicated per-scan Report page — one place for all three export formats
// (Markdown, CSV, PDF-via-print) requested 2026-09-05. Deliberately NOT a
// mode of <ScanDetail> (that component is tab/accordion-based, which
// doesn't print cleanly, and result.html has no vue-router instance at all
// to navigate here from anyway) — a purpose-built, single-column,
// non-interactive layout instead, reusing the exact scanDerived.ts/
// scanLabels.ts functions ScanDetail.vue already uses so the numbers can
// never drift. Curated summary, not full parity with ScanDetail.vue: no
// raw check-by-check dump here (that's what the CSV export and the
// Details tab are for), no interactive competitor-quote drilldown, no
// animated score ring — plain, robust markup that prints the same as it
// renders.
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { authFetch } from '../lib/auth';
import { validatePayload, asNonNegativeInt, asShortString, type ValidatedPayload } from '../../shared/scanPayload';
import {
  deriveExecutiveSummary, deriveKeyMetrics, deriveScoreboardRows, scoreboardRowPct, shareOfVoicePct,
  deriveVisibleAdvice, deriveHarmoniaPillars, deriveHarmoniaBand, type ScoreboardRow,
} from '../../shared/scanDerived';
import { ADVICE_HEADING, BAND_LABEL, BAND_EXPLAIN } from '../../shared/scanLabels';
import { scoreBand } from '../../../shared/aivis-core.mjs';
import { buildScanReportMarkdown, downloadMarkdown, buildCheckByCheckCsv, downloadCsv } from '../../shared/scanReport';
import Breadcrumb from '../components/Breadcrumb.vue';

const route = useRoute();

interface CompanyRow { id: string; brand: string; }

const company = ref<CompanyRow | null>(null);
const payload = ref<ValidatedPayload | null>(null);
const loading = ref(true);
const loadError = ref('');

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await authFetch(`/companies/${route.params.id}`);
    const data = await res.json();
    if (!data.ok) {
      loadError.value = data.error || 'Failed to load company.';
      return;
    }
    company.value = data.company;

    // ?scan=<id> picks a specific scan (e.g. from ScanDetail.vue's "Full
    // report" link on the scan currently being viewed); omitted defaults to
    // the latest completed scan, same "auto-select latest" pattern
    // CompetitorBenchmarkView.vue already uses.
    const scans: Record<string, unknown>[] = data.scans;
    const scanIdParam = typeof route.query.scan === 'string' ? route.query.scan : null;
    const target = scanIdParam
      ? scans.find((s) => s.id === scanIdParam)
      : scans.find((s) => (s as { status?: string }).status === 'completed' || !(s as { status?: string }).status);
    payload.value = target ? validatePayload(target) : null;

    if (company.value) document.title = `${company.value.brand} — Report — Foreground`;
  } catch (err) {
    loadError.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const band = computed(() => (payload.value ? scoreBand(payload.value.score) : 'unavailable'));
const executiveSummary = computed(() => (payload.value ? deriveExecutiveSummary(payload.value) : null));
const keyMetrics = computed(() => (payload.value ? deriveKeyMetrics(payload.value) : null));
const scoreboardRows = computed(() => (payload.value ? deriveScoreboardRows(payload.value) : []));
function rowPct(row: ScoreboardRow) {
  return payload.value ? scoreboardRowPct(payload.value, row) : 0;
}
function rowSharePct(row: ScoreboardRow) {
  return shareOfVoicePct(scoreboardRows.value, row);
}
const visibleAdvice = computed(() => (payload.value ? deriveVisibleAdvice(payload.value) : []));
const harmoniaPillars = computed(() => (payload.value ? deriveHarmoniaPillars(payload.value) : []));
const harmoniaBand = computed(() => (payload.value ? deriveHarmoniaBand(payload.value) : 'unavailable'));

function downloadMd() {
  if (!payload.value) return;
  downloadMarkdown(buildScanReportMarkdown(payload.value), payload.value);
}
function downloadCsvFile() {
  if (!payload.value) return;
  downloadCsv(buildCheckByCheckCsv(payload.value), payload.value);
}
function printReport() {
  window.print();
}
</script>

<template>
  <main>
    <p class="status error" v-if="loadError">{{ loadError }}</p>
    <p class="status" v-else-if="loading">Loading…</p>

    <template v-else-if="company">
      <Breadcrumb
        class="print-hide"
        :crumbs="[
          { label: 'Companies', to: '/app' },
          { label: company.brand, to: `/app/companies/${company.id}` },
          { label: 'Report' },
        ]"
      />

      <p class="empty" v-if="!payload">
        No completed scan found to build a report from — run a scan from the company page first.
      </p>

      <template v-else>
        <div class="export-bar print-hide">
          <button type="button" @click="downloadMd">Download Markdown</button>
          <button type="button" @click="downloadCsvFile">Download CSV</button>
          <button type="button" @click="printReport">Print / Save as PDF</button>
        </div>

        <header class="report-header">
          <h1>{{ payload.brand }}</h1>
          <p class="sub">{{ payload.category }} &middot; {{ payload.website }} &middot; checked {{ payload.generatedAtDate.toLocaleDateString() }}</p>
        </header>

        <div class="card score-summary" :class="`band-${band}`">
          <div class="score-number">{{ payload.score ?? '—' }}<span class="of100">/ 100</span></div>
          <div class="score-side">
            <div class="score-band-label">{{ BAND_LABEL[band] }}</div>
            <div class="score-explain">{{ BAND_EXPLAIN[band] }}</div>
          </div>
        </div>

        <div class="card" v-if="executiveSummary">
          <h2>Executive summary</h2>
          <p>{{ executiveSummary.verdict }}</p>
          <p v-if="executiveSummary.vulnerability"><strong>Biggest vulnerability:</strong> {{ executiveSummary.vulnerability }}</p>
          <p v-if="executiveSummary.quickWin"><strong>Quick win:</strong> {{ executiveSummary.quickWin }}</p>
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

        <template v-if="scoreboardRows.length">
          <h2>Scoreboard</h2>
          <div class="card">
            <div class="board-row" v-for="row in scoreboardRows" :key="row.name + row.isYou">
              <div class="board-label">
                <span class="board-name">{{ row.name }}<span v-if="row.isYou" class="you-tag"> (you)</span></span>
                <span class="board-count">{{ row.mentionCount }}/{{ payload.completedCalls }} &middot; {{ rowSharePct(row) }}% share of voice</span>
              </div>
              <div class="board-track"><div class="board-fill" :class="row.isYou ? 'you' : 'rival'" :style="{ width: rowPct(row) + '%' }"></div></div>
            </div>
          </div>
        </template>

        <template v-if="visibleAdvice.length">
          <h2>What to do next</h2>
          <div class="advice-card" :class="`tone-${card.tone}`" v-for="card in visibleAdvice" :key="card.id">
            <div class="advice-tag">{{ ADVICE_HEADING[card.id] || 'Note' }}</div>
            <div class="advice-body">
              <template v-if="card.id === 'no-data'">We couldn't complete any checks this time — likely a temporary API issue. Try running the scan again.</template>
              <template v-else-if="card.id === 'zero-citations'">You're invisible in AI search. Across {{ asNonNegativeInt(card.params.completedCalls) ?? '?' }} checks, this brand was never mentioned — not once.</template>
              <template v-else-if="card.id === 'consistently-beaten'">
                <template v-if="asShortString(card.params.topCompetitorName)">AI knows this brand exists, but reaches for <strong>{{ asShortString(card.params.topCompetitorName) }}</strong> first — beaten to the mention in {{ asNonNegativeInt(card.params.beaten) ?? 0 }} of {{ asNonNegativeInt(card.params.completedCalls) ?? '?' }} checks.</template>
                <template v-else>AI knows this brand exists, but a competitor is usually mentioned first — beaten in {{ asNonNegativeInt(card.params.beaten) ?? 0 }} of {{ asNonNegativeInt(card.params.completedCalls) ?? '?' }} checks.</template>
              </template>
              <template v-else-if="card.id === 'leading'">This is the AI's go-to answer. Every completed check came up with this brand first — no competitor beat it to the mention.</template>
              <template v-else-if="card.id === 'mixed'">Mixed results across {{ asNonNegativeInt(card.params.completedCalls) ?? '?' }} checks: ranked first in {{ asNonNegativeInt(card.params.ranked1) ?? 0 }}, beaten by a competitor in {{ asNonNegativeInt(card.params.beaten) ?? 0 }}, not mentioned at all in {{ asNonNegativeInt(card.params.notMentioned) ?? 0 }}.</template>
              <template v-else-if="card.id === 'top-rival'"><strong>{{ asShortString(card.params.name) }}</strong> is the competitor showing up most — mentioned in {{ asNonNegativeInt(card.params.mentionCount) ?? 0 }} of {{ asNonNegativeInt(card.params.completedCalls) ?? '?' }} checks.</template>
            </div>
          </div>
        </template>

        <template v-if="payload.harmonia">
          <h2>Site Health score</h2>
          <div class="card harmonia-summary-card">
            <div class="harmonia-summary-head">
              <span class="harmonia-overall-score" :class="`band-text-${harmoniaBand}`">{{ payload.harmonia.harmoniaScore ?? '—' }}<span class="of100">/ 100</span></span>
              <span class="harmonia-summary-label">Technical, on-page, content-structure, and UX health of {{ payload.website }} — not part of the AI Visibility Score.</span>
            </div>
            <div class="harmonia-bar-row" v-for="p in harmoniaPillars" :key="p.key">
              <div class="harmonia-bar-label">
                <span>{{ p.label }}</span>
                <span class="board-count">{{ p.score ?? '—' }}</span>
              </div>
              <div class="board-track"><div class="board-fill" :class="`band-fill-${p.band}`" :style="{ width: (p.score ?? 0) + '%' }"></div></div>
            </div>
          </div>
        </template>

        <footer class="report-footer">Detection is presence-only, not sentiment-aware — a negative or comparative mention still counts as "cited." This is a single point-in-time check, not a monitored score.</footer>
      </template>
    </template>
  </main>
</template>

<style scoped>
main { max-width: var(--page-max-wide); margin: 0 auto; padding: var(--space-2xl) var(--space-md) var(--space-xl); }
.status { color: var(--muted); font-size: 0.9rem; }
.status.error { color: var(--critical); }
.empty { color: var(--muted); font-size: 0.9rem; }

.export-bar { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 24px; }
.export-bar button {
  padding: 10px 16px; font-size: 0.9rem; font-weight: 600;
  border: 1px solid var(--border); border-radius: 8px; background: transparent; color: var(--fg); cursor: pointer;
}
.export-bar button:hover { border-color: var(--accent); }

.report-header { margin-bottom: 16px; }
h1 { font-family: var(--font-display); font-size: var(--text-xl); font-weight: 700; margin: 0 0 4px; }
p.sub { color: var(--muted); margin: 0; overflow-wrap: anywhere; }
h2 { font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--muted); margin: 24px 0 10px; }

.card {
  background: var(--card); border: 1px solid var(--border); border-radius: 12px;
  padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow);
}

.score-summary { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
.score-number { font-size: 2.4rem; font-weight: 700; font-variant-numeric: proportional-nums; line-height: 1; }
.score-number .of100 { font-size: 1rem; color: var(--faint); font-weight: 500; }
.score-band-label { font-weight: 700; margin-bottom: 4px; }
.score-explain { color: var(--muted); font-size: 0.9rem; }
.band-leading.score-summary { background: color-mix(in srgb, var(--good) 6%, var(--card)); border-color: color-mix(in srgb, var(--good) 28%, var(--border)); }
.band-leading .score-band-label { color: var(--success-text); }
.band-visible.score-summary { background: color-mix(in srgb, var(--warning) 6%, var(--card)); border-color: color-mix(in srgb, var(--warning) 28%, var(--border)); }
.band-weak.score-summary { background: color-mix(in srgb, var(--serious) 6%, var(--card)); border-color: color-mix(in srgb, var(--serious) 28%, var(--border)); }
.band-weak .score-band-label { color: var(--serious); }
.band-invisible.score-summary { background: color-mix(in srgb, var(--critical) 6%, var(--card)); border-color: color-mix(in srgb, var(--critical) 28%, var(--border)); }
.band-invisible .score-band-label { color: var(--critical); }

.key-metrics-row { display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 16px; }
.key-metric-tile { flex: 1 1 140px; background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }
.key-metric-value { font-size: 1.4rem; font-weight: 700; font-variant-numeric: proportional-nums; }
.key-metric-label { font-size: 0.78rem; color: var(--muted); margin-top: 2px; }

.board-row { margin-bottom: 12px; }
.board-row:last-child { margin-bottom: 0; }
.board-label { display: flex; justify-content: space-between; gap: 8px; font-size: 0.88rem; margin-bottom: 4px; }
.board-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.board-name .you-tag { color: var(--accent); font-weight: 600; }
.board-count { color: var(--muted); flex: none; font-variant-numeric: proportional-nums; }
.board-track { height: 22px; border-radius: 6px; background: var(--gridline); overflow: hidden; }
.board-fill { height: 100%; border-radius: 6px; }
.board-fill.you { background: var(--accent); }
.board-fill.rival { background: var(--debar); }

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

.harmonia-summary-card { padding: 20px; }
.harmonia-summary-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.harmonia-overall-score { font-size: 1.6rem; font-weight: 700; font-variant-numeric: proportional-nums; }
.harmonia-overall-score .of100 { font-size: 0.85rem; color: var(--faint); font-weight: 500; }
.harmonia-summary-label { font-size: 0.82rem; color: var(--muted); flex: 1; min-width: 200px; }
.harmonia-bar-row { margin-bottom: 10px; }
.harmonia-bar-row:last-of-type { margin-bottom: 0; }
.harmonia-bar-label { display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 4px; }
.band-text-leading { color: var(--success-text); }
.band-text-visible { color: color-mix(in srgb, var(--warning) 70%, var(--fg)); }
.band-text-weak { color: var(--serious); }
.band-text-invisible { color: var(--critical); }
.band-text-unavailable { color: var(--muted); }
.board-fill.band-fill-leading { background: var(--good); }
.board-fill.band-fill-visible { background: var(--warning); }
.board-fill.band-fill-weak { background: var(--serious); }
.board-fill.band-fill-invisible { background: var(--critical); }
.board-fill.band-fill-unavailable { background: var(--faint); }

.report-footer { margin-top: 24px; font-size: 0.78rem; color: var(--faint); }

/* Print / Save as PDF — this repo's first @media print stylesheet. Forces
   light/high-contrast colors regardless of the viewer's active dark-mode
   setting (CSS custom properties cascade to descendants, so redefining
   them on this component's own root overrides the global :root tokens for
   print only, without touching theme.css). Semantic band/status colors
   (--good/--warning/--serious/--critical/--accent) are deliberately left
   alone — they're meaningful signal, not theme decoration. App.vue's own
   topbar/footer are hidden via a matching print rule in that component
   (this component's scoped styles can't reach a parent's markup). */
@media print {
  .print-hide { display: none !important; }
  main {
    --bg: #ffffff;
    --card: #ffffff;
    --fg: #111111;
    --muted: #444444;
    --faint: #666666;
    --border: #cccccc;
    --gridline: #dddddd;
    --shadow: none;
    color: #111111;
    background: #ffffff;
    max-width: none;
    padding: 0;
  }
  .card { box-shadow: none; }
}
</style>
