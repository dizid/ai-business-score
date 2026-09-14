<script setup lang="ts">
// Dedicated "vs. Competitors" view — promotes data that already existed but
// was buried mid-page (the Scoreboard inside ScanDetail.vue's Overview tab)
// into its own screenshot-ready page. docs/improvement-roadmap.md calls a
// page like this "likely the single most persuasive thing to show a
// prospect" — zero new data collection, zero new LLM cost: same
// GET /companies/:id response CompanyDetailView.vue already fetches, just
// laid out for that one job instead of sharing space with score ring/
// advice/Site Health/etc. CompetitorTrendChart.vue ("mentions over time")
// was originally duplicated onto CompanyDetailView.vue's main dashboard
// too — removed from there 2026-09-12 so it only lives here, its natural
// home, instead of two places showing the same chart.
//
// CSS below still duplicates a few class names from ScanDetail.vue's own
// <style scoped> block (.card, .key-metric-*) — small, rarely-changing
// presentation this codebase's own convention (see scanReport.ts's
// adviceCardMarkdown comment) leaves copy-pasted per-surface rather than
// sharing. The Scoreboard section itself (.board-*, .competitor-appearances)
// was extracted into src/shared/Scoreboard.vue on 2026-09-12 — this was the
// second of two near-identical copies that extraction removed.
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { formatDate } from '../lib/format';
import { validatePayload, type Rank } from '../../shared/scanPayload';
import { deriveScoreboardRows, deriveKeyMetrics, deriveProviderBreakdown } from '../../shared/scanDerived';
import Scoreboard from '../../shared/Scoreboard.vue';
import CompetitorTrendChart from './CompetitorTrendChart.vue';
import ProviderTrendChart from './ProviderTrendChart.vue';
import Breadcrumb from '../components/Breadcrumb.vue';
import { useCompany } from '../composables/useCompany';

const route = useRoute();
const router = useRouter();

const { company, scans, loading, loadError, load: loadCompany } = useCompany(() => route.params.id as string);

async function load() {
  await loadCompany();
  if (company.value) document.title = `${company.value.brand} vs. Competitors — Foreground`;
}
onMounted(load);

// Scans come back newest-first (same order CompanyDetailView.vue relies on)
// — the most recent completed scan drives the head-to-head detail below,
// same "auto-select latest" reasoning as that view's own selectedIndex.
const latestCompletedScan = computed(
  () => scans.value.find((s) => (s as { status?: string }).status === 'completed' || !(s as { status?: string }).status) ?? null
);
const latestPayload = computed(() => (latestCompletedScan.value ? validatePayload(latestCompletedScan.value) : null));

// Scoreboard's own row-by-row rendering lives in Scoreboard.vue now — this
// one-line computed is kept only for the "no named competitors" empty
// message below, which Scoreboard.vue itself has no equivalent for (its own
// empty state is "render nothing").
const scoreboardRows = computed(() => (latestPayload.value ? deriveScoreboardRows(latestPayload.value) : []));
const keyMetrics = computed(() => (latestPayload.value ? deriveKeyMetrics(latestPayload.value) : null));

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

// Same lenient raw-field extraction as competitorTrend above (this is the
// app's own trusted GET /companies/:id response, not an untrusted payload —
// validatePayload()'s fail-closed handling is for result.html's forgeable
// URL fragment, not needed here) — reuses deriveProviderBreakdown's grouping
// logic rather than re-implementing it, since that function only needs
// rawResponses/perPromptRank, not a full ValidatedPayload.
const providerTrend = computed(() =>
  scans.value.map((s, index) => ({
    id: (s.id as string) || String(index),
    generatedAt: typeof s.generatedAt === 'string' ? s.generatedAt : '',
    providers: deriveProviderBreakdown({
      rawResponses: Array.isArray(s.rawResponses) ? (s.rawResponses as { promptIndex: number; model: string }[]) : [],
      perPromptRank: Array.isArray(s.perPromptRank) ? (s.perPromptRank as { rank: Rank }[]) : [],
    }).map((row) => ({ model: row.model, presencePct: row.presencePct })),
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

        <ProviderTrendChart v-if="scans.length >= 2" :scans="providerTrend" @select-point="goToFullReport" />

        <h2>Scoreboard</h2>
        <p class="section-sub" v-if="latestCompletedScan">
          From the scan on {{ formatDate((latestCompletedScan as Record<string, unknown>).generatedAt) }}.
        </p>
        <Scoreboard :payload="latestPayload!">
          <p class="empty" v-if="scoreboardRows.length <= 1">No named competitors showed up in the latest scan.</p>
        </Scoreboard>
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

/* .card and the board/competitor-appearances rules that used to live here
   moved into src/shared/Scoreboard.vue (2026-09-12) along with the markup
   that used them. The "no named competitors" note above is the only thing
   this view still renders inside that card, via Scoreboard.vue default
   slot, so no card styling is needed here anymore. */
</style>
