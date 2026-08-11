<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { validatePayload } from '../../shared/scanPayload';
import ScanDetail from '../../shared/ScanDetail.vue';
import CompanyProgressChart from './CompanyProgressChart.vue';
import { authFetch } from '../lib/auth';

const route = useRoute();
const router = useRouter();

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

const scanning = ref(false);
const scanStatus = ref('');
const scanError = ref('');
const scanUpgradeRequired = ref(false);
const upgrading = ref(false);
let pollHandle: ReturnType<typeof setTimeout> | null = null;

const deepAdviceLoading = ref(false);

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
    const res = await authFetch(`/companies/${route.params.id}`);
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

function stopPolling() {
  if (pollHandle) {
    clearTimeout(pollHandle);
    pollHandle = null;
  }
}

// Backoff schedule for a *hard* fetch failure while polling (network blip,
// DNS hiccup, the fetch itself throwing) — not a clean HTTP error response
// from the server, which is handled separately below via `!data.ok` and
// gives up immediately since that's a real, informative error. A transient
// fetch failure used to abandon polling permanently on the very first
// blip, surfacing as a raw "TypeError: Failed to fetch" with no recovery.
const POLL_RETRY_BACKOFFS_MS = [2000, 4000, 8000];

async function pollScan(scanId: string, retriesLeft = POLL_RETRY_BACKOFFS_MS.length) {
  try {
    const res = await authFetch(`/scans/${scanId}`);
    const data = await res.json();
    if (!data.ok) {
      scanError.value = data.error || 'Failed to check scan status.';
      scanning.value = false;
      return;
    }
    if (data.status === 'completed') {
      scanning.value = false;
      scanStatus.value = '';
      await load();
      return;
    }
    if (data.status === 'failed') {
      scanning.value = false;
      scanError.value = data.errorMessage || 'Scan failed.';
      return;
    }
    scanStatus.value = data.status === 'running' ? 'Running checks (~20-60s)…' : 'Queued…';
    pollHandle = setTimeout(() => pollScan(scanId), 2000);
  } catch (err) {
    if (retriesLeft > 0) {
      const backoffMs = POLL_RETRY_BACKOFFS_MS[POLL_RETRY_BACKOFFS_MS.length - retriesLeft];
      scanStatus.value = 'Connection hiccup, retrying…';
      pollHandle = setTimeout(() => pollScan(scanId, retriesLeft - 1), backoffMs);
      return;
    }
    scanError.value = (err as Error).message;
    scanning.value = false;
  }
}

async function runNewScan() {
  if (!company.value) return;
  scanning.value = true;
  scanError.value = '';
  scanUpgradeRequired.value = false;
  scanStatus.value = 'Starting scan…';
  try {
    const res = await authFetch('/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: company.value.id }),
    });
    const data = await res.json();
    if (!data.ok) {
      scanError.value = data.error || 'Failed to start scan.';
      scanUpgradeRequired.value = !!data.upgradeRequired;
      scanning.value = false;
      return;
    }
    pollScan(data.scanId);
  } catch (err) {
    scanError.value = (err as Error).message;
    scanning.value = false;
  }
}

// Same shape as CompaniesListView's startCheckout — kept duplicated rather
// than shared, matching this codebase's convention of copy-pasted per-file
// auth/billing calls over a shared abstraction (see auth.mts's own comment).
async function startCheckout() {
  upgrading.value = true;
  try {
    const res = await authFetch('/create-checkout-session', { method: 'POST' });
    const data = await res.json();
    if (!data.ok) {
      scanError.value = data.error || 'Failed to start checkout.';
      upgrading.value = false;
      return;
    }
    window.location.href = data.url;
  } catch (err) {
    scanError.value = (err as Error).message;
    upgrading.value = false;
  }
}

const scanTrend = computed(() =>
  scans.value.map((s) => ({
    generatedAt: typeof s.generatedAt === 'string' ? s.generatedAt : '',
    score: typeof s.score === 'number' ? s.score : null,
  }))
);

const selectedScan = computed(() =>
  selectedIndex.value === null ? null : scans.value[selectedIndex.value] ?? null
);
const selectedPayload = computed(() => (selectedScan.value ? validatePayload(selectedScan.value) : null));

async function runDeepAdvice() {
  if (selectedIndex.value === null || !selectedPayload.value) return;
  deepAdviceLoading.value = true;
  try {
    const res = await authFetch(`/scans/${selectedPayload.value.id}/deep-advice`, {
      method: 'POST',
    });
    const data = await res.json();
    if (!data.ok) {
      scanError.value = data.error || 'Failed to generate deeper advice.';
      return;
    }
    // Replace by id rather than by selectedIndex, since scans.value could
    // in principle be reordered between the request firing and it landing.
    const idx = scans.value.findIndex((s) => s.id === data.scan.id);
    if (idx !== -1) scans.value[idx] = data.scan;
  } catch (err) {
    scanError.value = (err as Error).message;
  } finally {
    deepAdviceLoading.value = false;
  }
}

function selectScan(index: number) {
  selectedIndex.value = index;
}
function backToList() {
  selectedIndex.value = null;
}

onMounted(async () => {
  await load();
  // Auto-trigger the first scan right after create-company navigates here
  // with ?autoscan=1 (see CompaniesListView.vue's onCreate) — a brand-new
  // company otherwise sits at an ambiguous "no data" until the user
  // remembers to click "Run new scan" themselves. Runs once: the query
  // param is stripped immediately after so a refresh doesn't re-trigger it.
  if (route.query.autoscan === '1' && company.value && !loadError.value) {
    runNewScan();
    const cleanedQuery = { ...route.query };
    delete cleanedQuery.autoscan;
    router.replace({ query: cleanedQuery });
  }
});
onUnmounted(stopPolling);
watch(() => route.params.id, load);
</script>

<template>
  <main>
    <p class="status error" v-if="loadError">{{ loadError }}</p>
    <p class="empty" v-else-if="loading">Loading…</p>

    <template v-else-if="company">
      <router-link class="back-link" to="/app">&larr; All companies</router-link>
      <div class="head-row">
        <div>
          <h1>
            {{ company.brand }}
            <span class="legacy-tag" v-if="company.is_legacy_import">legacy import</span>
          </h1>
          <p class="sub">{{ company.category }} · {{ company.website }}</p>
        </div>
        <div class="scan-trigger">
          <button type="button" :disabled="scanning" @click="runNewScan">
            {{ scanning ? 'Scanning…' : 'Run new scan' }}
          </button>
          <div class="scan-status" v-if="scanStatus">{{ scanStatus }}</div>
          <div class="scan-status error" v-if="scanError">
            {{ scanError }}
            <button type="button" class="inline-upgrade" v-if="scanUpgradeRequired" :disabled="upgrading" @click="startCheckout">
              Upgrade to Pro
            </button>
          </div>
        </div>
      </div>

      <p class="empty" v-if="scans.length === 0">
        No scans yet for this company — click "Run new scan" to check its AI search visibility.
      </p>

      <CompanyProgressChart v-if="scans.length >= 2" :scans="scanTrend" />

      <div class="dashboard" v-if="scans.length" :class="{ 'has-selection': selectedIndex !== null }">
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
            <ScanDetail
              v-if="selectedPayload"
              :payload="selectedPayload"
              :allow-deep-advice="true"
              :deep-advice-loading="deepAdviceLoading"
              @generate-deep-advice="runDeepAdvice"
            />
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
.head-row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 16px; margin-top: 12px; margin-bottom: 24px; }
.head-row > div:first-child { min-width: 0; }
h1 { font-size: 1.5rem; margin: 0 0 4px; }
.legacy-tag {
  font-size: 0.7rem; font-weight: 600; color: var(--muted);
  border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px; margin-left: 8px; vertical-align: middle;
}
p.sub { color: var(--muted); margin: 0; overflow-wrap: anywhere; }
.scan-trigger { flex: none; text-align: right; }
.scan-trigger button {
  padding: 10px 16px; font-size: 0.9rem; font-weight: 600;
  border: none; border-radius: 8px; background: var(--accent); color: #fff; cursor: pointer;
}
.scan-trigger button:disabled { opacity: 0.6; cursor: wait; }
.scan-status { margin-top: 8px; font-size: 0.82rem; color: var(--muted); max-width: 220px; }
.scan-status.error { color: var(--critical); }
.inline-upgrade {
  display: block; margin-top: 6px; padding: 4px 10px; font-size: 0.8rem; font-weight: 600;
  border: 1px solid var(--critical); border-radius: 999px; background: transparent; color: var(--critical); cursor: pointer;
}
.inline-upgrade:disabled { opacity: 0.6; cursor: wait; }

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
