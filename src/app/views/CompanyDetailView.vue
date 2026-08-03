<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { validatePayload } from '../../shared/scanPayload';
import ScanDetail from '../../shared/ScanDetail.vue';
import { authHeaders } from '../lib/auth';

const route = useRoute();

interface CompanyRow {
  id: string;
  brand: string;
  website: string;
  category: string;
  use_case: string;
  region: string;
  customer_segment: string;
  competitors: string[];
  is_legacy_import: boolean;
}

const company = ref<CompanyRow | null>(null);
const scans = ref<Record<string, unknown>[]>([]);
const loading = ref(true);
const loadError = ref('');
const selectedIndex = ref<number | null>(null);

function keyOf(scan: Record<string, unknown>, index: number): string {
  return (scan.id as string) || String(index);
}

function formatDate(generatedAt: unknown) {
  return typeof generatedAt === 'string' && generatedAt
    ? new Date(generatedAt).toLocaleString()
    : 'unknown date';
}

async function load() {
  loading.value = true;
  loadError.value = '';
  selectedIndex.value = null;
  try {
    const res = await fetch(`/companies/${route.params.id}`, { headers: { ...authHeaders() } });
    const data = await res.json();
    if (!data.ok) {
      loadError.value = data.error || 'Failed to load company.';
      return;
    }
    company.value = data.company;
    scans.value = data.scans;
  } catch (err) {
    loadError.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}

const selectedScan = computed(() =>
  selectedIndex.value === null ? null : scans.value[selectedIndex.value] ?? null
);
const selectedPayload = computed(() => (selectedScan.value ? validatePayload(selectedScan.value) : null));

function selectScan(index: number) {
  selectedIndex.value = index;
}
function backToList() {
  selectedIndex.value = null;
}

onMounted(load);
watch(() => route.params.id, load);
</script>

<template>
  <main>
    <p class="status error" v-if="loadError">{{ loadError }}</p>
    <p class="empty" v-else-if="loading">Loading…</p>

    <template v-else-if="company">
      <router-link class="back-link" to="/app">&larr; All companies</router-link>
      <h1>
        {{ company.brand }}
        <span class="legacy-tag" v-if="company.is_legacy_import">legacy import</span>
      </h1>
      <p class="sub">{{ company.category }} · {{ company.website }}</p>

      <p class="empty" v-if="scans.length === 0">
        No scans yet for this company. Scan creation from the dashboard ships in a follow-up milestone —
        for now, historical scans only appear here after a backfill.
      </p>

      <div class="dashboard" v-else :class="{ 'has-selection': selectedIndex !== null }">
        <div class="list-pane">
          <button
            v-for="(scan, index) in scans"
            :key="keyOf(scan, index)"
            type="button"
            class="scan-card"
            :class="{ active: index === selectedIndex }"
            @click="selectScan(index)"
          >
            <div class="scan-row">
              <div class="scan-meta">{{ formatDate(scan.generatedAt) }}</div>
              <span v-if="typeof scan.score !== 'number'" class="scan-score na">no data</span>
              <span v-else class="scan-score">{{ scan.score }}</span>
            </div>
          </button>
        </div>

        <div class="detail-pane">
          <template v-if="!selectedScan">
            <p class="empty placeholder">Select a scan from the list to see full details.</p>
          </template>
          <template v-else>
            <button type="button" class="back" @click="backToList">&larr; Back to list</button>
            <ScanDetail v-if="selectedPayload" :payload="selectedPayload" />
            <p class="empty" v-else>This record couldn't be rendered — its stored data doesn't match the expected format.</p>
          </template>
        </div>
      </div>
    </template>
  </main>
</template>

<style scoped>
main { max-width: 1100px; margin: 0 auto; padding: 48px 20px 80px; }
.back-link { font-size: 0.85rem; color: var(--muted); text-decoration: underline; }
h1 { font-size: 1.5rem; margin: 12px 0 4px; }
.legacy-tag {
  font-size: 0.7rem; font-weight: 600; color: var(--muted);
  border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px; margin-left: 8px; vertical-align: middle;
}
p.sub { color: var(--muted); margin-top: 0; margin-bottom: 24px; }

.status.error { font-size: 0.9rem; color: var(--critical); }
.empty { color: var(--muted); font-size: 0.9rem; }

.dashboard { margin-top: 24px; display: block; }
.list-pane { display: block; }

.scan-card {
  display: block; width: 100%; text-align: left;
  background: var(--card); border: 1px solid var(--border);
  border-radius: 12px; padding: 14px 16px; margin-bottom: 10px;
  color: var(--fg); font: inherit; cursor: pointer;
}
.scan-card:hover { border-color: var(--accent); }
.scan-card.active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.scan-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.scan-meta { color: var(--muted); font-size: 0.85rem; }
.scan-score { flex: none; font-weight: 700; font-size: 1.1rem; font-variant-numeric: proportional-nums; }
.scan-score.na { color: var(--faint); font-weight: 500; font-size: 0.85rem; }

.detail-pane {
  display: none;
  background: var(--card); border: 1px solid var(--border);
  border-radius: 14px; padding: 20px; margin-top: 20px;
}
.detail-pane .placeholder { padding: 20px 0; text-align: center; }
.back {
  display: inline-block; margin-bottom: 16px; padding: 6px 10px;
  border: 1px solid var(--border); border-radius: 8px;
  background: transparent; color: var(--fg); font: inherit; cursor: pointer;
}
.back:hover { border-color: var(--accent); }

.has-selection .list-pane { display: none; }
.has-selection .detail-pane { display: block; }

@media (min-width: 900px) {
  .dashboard { display: grid; grid-template-columns: 360px 1fr; align-items: start; gap: 24px; }
  .list-pane { display: block !important; max-height: 80vh; overflow-y: auto; }
  .detail-pane { display: block; margin-top: 0; position: sticky; top: 24px; max-height: 80vh; overflow-y: auto; }
}
</style>
