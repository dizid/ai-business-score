<script setup lang="ts">
// Portfolio-wide competitor rollup — "which rival shows up most across
// everything I track," aggregated from each company's own latest scan
// (CompetitorBenchmarkView.vue's Scoreboard is the single-company version
// of this same data; this is the cross-company view). Zero new data
// collection: GET /companies already returns latest_competitor_tallies per
// company (added alongside this view, companies.mts) — pure client-side
// aggregation, no new endpoint beyond that one added field.
import { computed, onMounted, ref } from 'vue';
import { authFetch } from '../lib/auth';
import Breadcrumb from '../components/Breadcrumb.vue';

interface CompetitorTally { name: string; mentionCount: number; beatBrandCount: number; ambiguous: boolean; }
interface CompanyRow {
  id: string;
  brand: string;
  latest_competitor_tallies: CompetitorTally[] | null;
}

const companies = ref<CompanyRow[]>([]);
const loading = ref(true);
const loadError = ref('');

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await authFetch('/companies');
    const data = await res.json();
    if (!data.ok) {
      loadError.value = data.error || 'Failed to load companies.';
      return;
    }
    companies.value = data.companies;
  } catch (err) {
    loadError.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

interface PortfolioCompetitorRow { name: string; totalMentions: number; byCompany: { brand: string; mentionCount: number }[]; }
const portfolioCompetitors = computed<PortfolioCompetitorRow[]>(() => {
  const byName = new Map<string, PortfolioCompetitorRow>();
  for (const c of companies.value) {
    for (const t of c.latest_competitor_tallies || []) {
      // Ambiguous (common-word) names and zero-mention entries carry no
      // signal here, same exclusion Scoreboard.vue's own rows apply.
      if (t.ambiguous || t.mentionCount === 0) continue;
      if (!byName.has(t.name)) byName.set(t.name, { name: t.name, totalMentions: 0, byCompany: [] });
      const row = byName.get(t.name)!;
      row.totalMentions += t.mentionCount;
      row.byCompany.push({ brand: c.brand, mentionCount: t.mentionCount });
    }
  }
  return [...byName.values()]
    .map((row) => ({ ...row, byCompany: row.byCompany.sort((a, b) => b.mentionCount - a.mentionCount) }))
    .sort((a, b) => b.totalMentions - a.totalMentions);
});
const maxTotalMentions = computed(() => Math.max(1, ...portfolioCompetitors.value.map((r) => r.totalMentions)));
function pct(row: PortfolioCompetitorRow) {
  return Math.round((row.totalMentions / maxTotalMentions.value) * 100);
}
</script>

<template>
  <main>
    <Breadcrumb :crumbs="[{ label: 'Companies', to: '/app' }, { label: 'Competitors across my portfolio' }]" />
    <h1>Competitors across your portfolio</h1>
    <p class="sub">Which rivals show up most across every company you track, from each one's latest scan.</p>

    <p class="status error" v-if="loadError">{{ loadError }}</p>
    <p class="status" v-else-if="loading">Loading…</p>
    <p class="empty" v-else-if="portfolioCompetitors.length === 0">
      No named competitors have shown up in any of your companies' latest scans yet.
    </p>

    <div class="card" v-else>
      <div class="competitor-row" v-for="row in portfolioCompetitors" :key="row.name">
        <div class="board-label">
          <span class="board-name">{{ row.name }}</span>
          <span class="board-count">{{ row.totalMentions }} mention{{ row.totalMentions === 1 ? '' : 's' }} across {{ row.byCompany.length }} {{ row.byCompany.length === 1 ? 'company' : 'companies' }}</span>
        </div>
        <div class="board-track"><div class="board-fill" :style="{ width: pct(row) + '%' }"></div></div>
        <div class="competitor-breakdown">
          <span v-for="(b, i) in row.byCompany" :key="i" class="breakdown-item">{{ b.brand }} ({{ b.mentionCount }})</span>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
main { max-width: var(--page-max-wide); margin: 0 auto; padding: var(--space-2xl) var(--space-md) var(--space-xl); }
h1 { font-family: var(--font-display); font-size: var(--text-xl); font-weight: 700; margin: 0 0 4px; }
p.sub { color: var(--muted); margin: 0 0 20px; }
.status { color: var(--muted); font-size: 0.9rem; }
.status.error { color: var(--critical); }
.empty { color: var(--muted); font-size: 0.9rem; }

.card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; box-shadow: var(--shadow); }
.competitor-row { margin-bottom: 16px; }
.competitor-row:last-child { margin-bottom: 0; }
.board-label { display: flex; justify-content: space-between; gap: 8px; font-size: 0.9rem; margin-bottom: 4px; flex-wrap: wrap; }
.board-name { font-weight: 600; }
.board-count { color: var(--muted); font-size: 0.85rem; flex: none; }
.board-track { height: 20px; border-radius: 6px; background: var(--gridline); overflow: hidden; }
.board-fill { height: 100%; border-radius: 6px; background: var(--debar); transition: width 0.6s ease; }
@media (prefers-reduced-motion: reduce) { .board-fill { transition: none; } }
.competitor-breakdown { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 6px; font-size: 0.8rem; color: var(--muted); }
</style>
