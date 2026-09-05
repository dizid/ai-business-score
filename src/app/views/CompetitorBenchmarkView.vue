<script setup lang="ts">
// Dedicated "vs. Competitors" view — promotes data that already existed but
// was buried mid-page (the Scoreboard inside ScanDetail.vue's Overview tab,
// CompetitorTrendChart.vue on the main company dashboard) into its own
// screenshot-ready page. docs/improvement-roadmap.md calls a page like this
// "likely the single most persuasive thing to show a prospect" — zero new
// data collection, zero new LLM cost: same GET /companies/:id response
// CompanyDetailView.vue already fetches, just laid out for that one job
// instead of sharing space with score ring/advice/Site Health/etc.
//
// CSS below deliberately duplicates several class names from
// ScanDetail.vue's own <style scoped> block (.card, .board-*,
// .competitor-appearances, .key-metric-*) rather than extracting a shared
// component — Vue's scoped styles don't cross component boundaries, and
// this codebase's own convention (see scanReport.ts's adviceCardMarkdown
// comment) is copy-pasted per-surface styling over a shared abstraction for
// small, rarely-changing presentation, not a new dependency between two
// otherwise-independent pages.
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { authFetch } from '../lib/auth';
import { validatePayload } from '../../shared/scanPayload';
import {
  deriveScoreboardRows, scoreboardRowPct, shareOfVoicePct, deriveCompetitorAppearances, deriveKeyMetrics,
  type ScoreboardRow,
} from '../../shared/scanDerived';
import CompetitorTrendChart from './CompetitorTrendChart.vue';
import Breadcrumb from '../components/Breadcrumb.vue';

const route = useRoute();
const router = useRouter();

interface CompanyRow { id: string; brand: string; category: string; website: string; }

const company = ref<CompanyRow | null>(null);
const scans = ref<Record<string, unknown>[]>([]);
const loading = ref(true);
const loadError = ref('');
const expandedCompetitors = ref<Set<string>>(new Set());

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
    scans.value = data.scans;
    if (company.value) document.title = `${company.value.brand} vs. Competitors — Foreground`;
  } catch (err) {
    loadError.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

// Scans come back newest-first (same order CompanyDetailView.vue relies on)
// — the most recent completed scan drives the head-to-head detail below,
// same "auto-select latest" reasoning as that view's own selectedIndex.
const latestCompletedScan = computed(
  () => scans.value.find((s) => (s as { status?: string }).status === 'completed' || !(s as { status?: string }).status) ?? null
);
const latestPayload = computed(() => (latestCompletedScan.value ? validatePayload(latestCompletedScan.value) : null));

const scoreboardRows = computed(() => (latestPayload.value ? deriveScoreboardRows(latestPayload.value) : []));
const keyMetrics = computed(() => (latestPayload.value ? deriveKeyMetrics(latestPayload.value) : null));

function rowPct(row: ScoreboardRow) {
  return latestPayload.value ? scoreboardRowPct(latestPayload.value, row) : 0;
}
function rowSharePct(row: ScoreboardRow) {
  return shareOfVoicePct(scoreboardRows.value, row);
}
function toggleCompetitorExpanded(name: string) {
  const next = new Set(expandedCompetitors.value);
  if (next.has(name)) next.delete(name); else next.add(name);
  expandedCompetitors.value = next;
}
function competitorAppearances(name: string) {
  return latestPayload.value ? deriveCompetitorAppearances(latestPayload.value, name) : [];
}

const competitorTrend = computed(() =>
  scans.value.map((s, index) => ({
    id: (s.id as string) || String(index),
    generatedAt: typeof s.generatedAt === 'string' ? s.generatedAt : '',
    brandMentionCount: typeof s.citedCount === 'number' ? s.citedCount : 0,
    competitorTallies: Array.isArray(s.competitorTallies)
      ? (s.competitorTallies as { name: string; mentionCount: number; ambiguous: boolean }[])
      : [],
  }))
);

// The trend chart's marker click is normally "jump to that scan's full
// detail" (CompanyDetailView.vue) — this page has no per-scan detail pane
// of its own, so a click here just goes to the full report, same
// destination as the "View full report" link below. No deep-link-to-a-
// specific-scan support exists yet (CompanyDetailView.vue doesn't read a
// query param for it either), so this lands on the latest scan rather than
// the exact point clicked.
function goToFullReport() {
  router.push(`/app/companies/${route.params.id}`);
}

function formatDate(generatedAt: unknown) {
  return typeof generatedAt === 'string' && generatedAt ? new Date(generatedAt).toLocaleDateString() : '';
}
</script>

<template>
  <main>
    <p class="status error" v-if="loadError">{{ loadError }}</p>
    <p class="status" v-else-if="loading">Loading…</p>

    <template v-else-if="company">
      <Breadcrumb
        :crumbs="[
          { label: 'Companies', to: '/app' },
          { label: company.brand, to: `/app/companies/${company.id}` },
          { label: 'vs. Competitors' },
        ]"
      />
      <div class="head-row">
        <div>
          <h1>{{ company.brand }} vs. the competition</h1>
          <p class="sub">{{ company.category }} · {{ company.website }}</p>
        </div>
        <button type="button" class="full-report-link" @click="goToFullReport">View full report &rarr;</button>
      </div>

      <p class="empty" v-if="!latestPayload">
        No completed scan yet for this company — run a scan from the company page to see how it stacks up against named competitors.
      </p>

      <template v-else>
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

        <CompetitorTrendChart v-if="scans.length >= 2" :scans="competitorTrend" @select-point="goToFullReport" />
        <p class="trend-note" v-else>Run another scan later to see a mentions-over-time trend here.</p>

        <h2>Scoreboard</h2>
        <p class="section-sub" v-if="latestCompletedScan">
          From the scan on {{ formatDate((latestCompletedScan as Record<string, unknown>).generatedAt) }}.
        </p>
        <div class="card">
          <div class="board-row" v-for="row in scoreboardRows" :key="row.name + row.isYou">
            <div class="board-label">
              <span class="board-name" :title="row.name">{{ row.name }}<span v-if="row.isYou" class="you-tag"> (you)</span></span>
              <span class="board-count">{{ row.mentionCount }}/{{ latestPayload!.completedCalls }} · {{ rowSharePct(row) }}% share of voice</span>
            </div>
            <div class="board-track"><div class="board-fill" :class="row.isYou ? 'you' : 'rival'" :style="{ width: rowPct(row) + '%' }"></div></div>
            <button
              v-if="!row.isYou && row.beatBrandCount > 0"
              type="button"
              class="board-beat board-beat-toggle"
              :aria-expanded="expandedCompetitors.has(row.name)"
              @click="toggleCompetitorExpanded(row.name)"
            >beat you {{ row.beatBrandCount }}&times; <span class="board-beat-chevron">{{ expandedCompetitors.has(row.name) ? '▲' : '▼' }}</span></button>
            <ul class="competitor-appearances" v-if="!row.isYou && expandedCompetitors.has(row.name)">
              <li v-for="(a, i) in competitorAppearances(row.name)" :key="i">
                <span class="citation-meta">{{ a.model }} &middot; {{ a.promptLabel }}</span>
                <span class="competitor-snippet">&ldquo;&hellip;{{ a.snippet }}&hellip;&rdquo;</span>
              </li>
              <li v-if="competitorAppearances(row.name).length === 0" class="competitor-appearances-empty">No specific checks found for this name.</li>
            </ul>
            <div class="board-ambiguous" v-if="row.ambiguous">Name is a common word — automated detection was skipped for some checks. This tally may undercount.</div>
          </div>
          <p class="empty" v-if="scoreboardRows.length <= 1">No named competitors showed up in the latest scan.</p>
        </div>
      </template>
    </template>
  </main>
</template>

<style scoped>
main { max-width: var(--page-max-wide); margin: 0 auto; padding: var(--space-2xl) var(--space-md) var(--space-xl); }
.status { color: var(--muted); font-size: 0.9rem; }
.status.error { color: var(--critical); }
.empty { color: var(--muted); font-size: 0.9rem; }

.head-row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: var(--space-md); margin-bottom: 24px; }
.head-row > div:first-child { min-width: 0; }
h1 { font-family: var(--font-display); font-size: var(--text-xl); font-weight: 700; margin: 0 0 4px; }
p.sub { color: var(--muted); margin: 0; overflow-wrap: anywhere; }
.full-report-link {
  flex: none; padding: 10px 16px; font-size: 0.9rem; font-weight: 600;
  border: 1px solid var(--border); border-radius: 8px; background: transparent; color: var(--fg); cursor: pointer;
}
.full-report-link:hover { border-color: var(--accent); }

h2 { font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--muted); margin: 24px 0 4px; }
.section-sub { color: var(--faint); font-size: 0.82rem; margin: 0 0 10px; }
.trend-note { color: var(--muted); font-size: 0.85rem; margin: 0 0 8px; }

.key-metrics-row { display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 16px; }
.key-metric-tile {
  flex: 1 1 140px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
}
.key-metric-value { font-size: 1.4rem; font-weight: 700; font-variant-numeric: proportional-nums; }
.key-metric-label { font-size: 0.78rem; color: var(--muted); margin-top: 2px; }

.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: var(--shadow);
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
.board-track { height: 22px; border-radius: 6px; background: var(--gridline); overflow: hidden; }
.board-fill { height: 100%; border-radius: 6px; transition: width 0.6s ease; }
@media (prefers-reduced-motion: reduce) { .board-fill { transition: none; } }
.board-fill.you { background: var(--accent); }
.board-fill.rival { background: var(--debar); }
.board-beat { color: var(--serious); font-size: 0.8rem; margin-top: 2px; }
.board-beat-toggle {
  background: none; border: none; padding: 0; font: inherit; cursor: pointer;
  display: inline-flex; align-items: center; gap: 4px;
}
.board-beat-chevron { font-size: 0.7em; }
.competitor-appearances { list-style: none; margin: 6px 0 0; padding: 0; }
.competitor-appearances li {
  padding: 6px 0; border-top: 1px solid var(--border);
  display: flex; flex-direction: column; gap: 2px;
}
.competitor-appearances li:first-child { border-top: none; }
.citation-meta { font-size: 0.78rem; color: var(--faint); }
.competitor-snippet { font-size: 0.85rem; color: var(--text); }
.competitor-appearances-empty { color: var(--muted); font-style: italic; }
.board-ambiguous { color: var(--muted); font-size: 0.78rem; margin-top: 2px; font-style: italic; }
</style>
