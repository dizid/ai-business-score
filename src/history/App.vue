<script setup lang="ts">
import { ref, computed } from 'vue';
import { scoreBand } from '../../shared/aivis-core.mjs';
import { validatePayload } from '../shared/scanPayload';
import ScanDetail from '../shared/ScanDetail.vue';

// A scan record as returned by /history: history.mts returns the full
// Blobs-stored object verbatim (same shape /scan persists, plus `encoded`)
// — not a projection — so every field ScanDetail needs is already present.
// Loosely typed here on purpose: the list view only reads a handful of
// fields directly, and the detail pane re-validates the whole record
// through the same fail-closed validatePayload() result/App.vue uses
// before trusting any of it.
interface ScanRecord {
  id?: string;
  brand?: string;
  category?: string;
  generatedAt?: string;
  score?: number | null;
  encoded: string;
  [key: string]: unknown;
}

const passphrase = ref('');
const loading = ref(false);
const status = ref('');
const statusIsError = ref(false);
const scans = ref<ScanRecord[]>([]);
const hasLoaded = ref(false);

const searchQuery = ref('');
const sortMode = ref<'newest' | 'score-desc' | 'score-asc'>('newest');
const selectedKey = ref<string | null>(null);

// Same band thresholds as ScanDetail, imported from aivis-core.mjs instead
// of re-derived, so the list badge and the detail view can never disagree.
const BAND_COLOR: Record<string, string> = {
  leading: 'var(--good)',
  visible: 'var(--warning)',
  weak: 'var(--serious)',
  invisible: 'var(--critical)',
  unavailable: 'var(--faint)',
};

function scoreColor(score: number | null | undefined) {
  if (typeof score !== 'number') return 'var(--faint)';
  return BAND_COLOR[scoreBand(score)];
}

function formatDate(generatedAt?: string) {
  return generatedAt ? new Date(generatedAt).toLocaleString() : 'unknown date';
}

function keyOf(scan: ScanRecord): string {
  return scan.id || scan.encoded;
}

async function loadHistory() {
  if (!passphrase.value) {
    status.value = 'Enter the passphrase.';
    statusIsError.value = true;
    return;
  }

  loading.value = true;
  status.value = '';
  statusIsError.value = false;

  try {
    const res = await fetch('/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase: passphrase.value }),
    });
    if (res.status === 403) {
      status.value = 'Wrong passphrase.';
      statusIsError.value = true;
      return;
    }
    const data = await res.json();
    if (!data.ok) {
      status.value = data.error || 'Failed to load history.';
      statusIsError.value = true;
      return;
    }

    scans.value = data.scans;
    hasLoaded.value = true;
    selectedKey.value = null;
    status.value = data.scans.length ? `${data.scans.length} scan(s).` : '';
  } catch (err) {
    status.value = `Failed to load: ${(err as Error).message}`;
    statusIsError.value = true;
  } finally {
    loading.value = false;
  }
}

function onPassphraseKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') loadHistory();
}

// null (no data) always sorts last regardless of direction — "no data" is
// not a low score, it's the absence of one.
function scoreForSort(scan: ScanRecord): number | null {
  return typeof scan.score === 'number' ? scan.score : null;
}

const filteredScans = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const list = q
    ? scans.value.filter(
        (s) => (s.brand || '').toLowerCase().includes(q) || (s.category || '').toLowerCase().includes(q)
      )
    : scans.value;

  if (sortMode.value === 'newest') return list;

  const sorted = [...list];
  sorted.sort((a, b) => {
    const av = scoreForSort(a);
    const bv = scoreForSort(b);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return sortMode.value === 'score-asc' ? av - bv : bv - av;
  });
  return sorted;
});

const selectedScan = computed(() => scans.value.find((s) => keyOf(s) === selectedKey.value) ?? null);
const selectedPayload = computed(() => (selectedScan.value ? validatePayload(selectedScan.value) : null));

function selectScan(scan: ScanRecord) {
  selectedKey.value = keyOf(scan);
}

function backToList() {
  selectedKey.value = null;
}
</script>

<template>
  <main>
    <h1>Scan history</h1>
    <p class="sub">Every scan run through AIVis, saved automatically — newest first.</p>

    <div class="gate">
      <label>Passphrase</label>
      <input type="password" v-model="passphrase" autocomplete="off" @keydown="onPassphraseKeydown">
      <button type="button" :disabled="loading" @click="loadHistory">
        {{ loading ? 'Loading...' : 'Load history' }}
      </button>
      <div class="status" :class="{ error: statusIsError }">{{ status }}</div>
    </div>

    <p class="empty" v-if="hasLoaded && scans.length === 0">No scans saved yet — run one from the home page.</p>

    <div class="dashboard" v-if="hasLoaded && scans.length" :class="{ 'has-selection': selectedKey }">
      <div class="list-pane">
        <div class="list-controls">
          <input class="search" type="search" v-model="searchQuery" placeholder="Search brand or category...">
          <select v-model="sortMode">
            <option value="newest">Newest first</option>
            <option value="score-desc">Highest score</option>
            <option value="score-asc">Lowest score</option>
          </select>
        </div>
        <p class="empty" v-if="filteredScans.length === 0">No scans match "{{ searchQuery }}".</p>
        <button
          v-for="scan in filteredScans"
          :key="keyOf(scan)"
          type="button"
          class="scan-card"
          :class="{ active: keyOf(scan) === selectedKey }"
          @click="selectScan(scan)"
        >
          <div class="scan-row">
            <div>
              <div class="scan-brand">{{ scan.brand || 'Unknown' }}</div>
              <div class="scan-meta">{{ scan.category || '' }} · {{ formatDate(scan.generatedAt) }}</div>
            </div>
            <span v-if="typeof scan.score !== 'number'" class="scan-score na">no data</span>
            <span v-else class="scan-score" :style="{ color: scoreColor(scan.score) }">{{ scan.score }}</span>
          </div>
        </button>
      </div>

      <div class="detail-pane">
        <template v-if="!selectedScan">
          <p class="empty placeholder">Select a scan from the list to see full details.</p>
        </template>
        <template v-else>
          <button type="button" class="back" @click="backToList">&larr; Back to list</button>
          <template v-if="selectedPayload">
            <ScanDetail :payload="selectedPayload" />
            <a class="share-link" :href="`/result.html#d=${encodeURIComponent(selectedScan.encoded)}`" target="_blank" rel="noopener">
              Open as shareable link &#8599;
            </a>
          </template>
          <p class="empty" v-else>This record couldn't be rendered — its stored data doesn't match the expected format.</p>
        </template>
      </div>
    </div>
  </main>
</template>

<style scoped>
main { max-width: 1100px; margin: 0 auto; padding: 48px 20px 80px; }
h1 { font-size: 1.5rem; margin: 0 0 4px; }
p.sub { color: var(--muted); margin-top: 0; margin-bottom: 24px; }

.gate {
  background: var(--card); border: 1px solid var(--border);
  border-radius: 14px; padding: 8px 20px 20px; max-width: 480px;
}
.gate label { display: block; font-size: 0.85rem; font-weight: 600; margin-top: 18px; margin-bottom: 6px; }
.gate input {
  width: 100%; padding: 10px 12px; font-size: 1rem;
  border: 1px solid var(--border); border-radius: 8px;
  background: transparent; color: var(--fg);
}
.gate button {
  margin-top: 20px; width: 100%; padding: 12px 16px; font-size: 1rem;
  font-weight: 600; border: none; border-radius: 8px;
  background: var(--accent); color: #fff; cursor: pointer;
}
.gate button:disabled { opacity: 0.6; cursor: wait; }
.status { margin-top: 14px; font-size: 0.9rem; color: var(--muted); }
.status.error { color: var(--critical); }

.empty { color: var(--muted); font-size: 0.9rem; }

/* ---- master-detail dashboard ---- */
.dashboard { margin-top: 24px; display: block; }

.list-pane { display: block; }
.list-controls { display: flex; gap: 8px; margin-bottom: 12px; }
.list-controls .search {
  flex: 1; min-width: 0; padding: 10px 12px; font-size: 0.95rem;
  border: 1px solid var(--border); border-radius: 8px;
  background: var(--card); color: var(--fg);
}
.list-controls select {
  padding: 10px 12px; font-size: 0.9rem;
  border: 1px solid var(--border); border-radius: 8px;
  background: var(--card); color: var(--fg);
}

.scan-card {
  display: block; width: 100%; text-align: left;
  background: var(--card); border: 1px solid var(--border);
  border-radius: 12px; padding: 14px 16px; margin-bottom: 10px;
  color: var(--fg); font: inherit; cursor: pointer;
}
.scan-card:hover { border-color: var(--accent); }
.scan-card.active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.scan-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.scan-brand { font-weight: 600; }
.scan-meta { color: var(--muted); font-size: 0.85rem; margin-top: 2px; }
.scan-score {
  flex: none; font-weight: 700; font-size: 1.1rem;
  font-variant-numeric: proportional-nums;
}
.scan-score.na { color: var(--faint); font-weight: 500; font-size: 0.85rem; }

.detail-pane {
  display: none;
  background: var(--card); border: 1px solid var(--border);
  border-radius: 14px; padding: 20px; margin-top: 20px;
}
.detail-pane .placeholder { padding: 20px 0; text-align: center; }
.detail-pane :deep(.scan-detail) .card { background: var(--bg); }
.back {
  display: inline-block; margin-bottom: 16px; padding: 6px 10px;
  border: 1px solid var(--border); border-radius: 8px;
  background: transparent; color: var(--fg); font: inherit; cursor: pointer;
}
.back:hover { border-color: var(--accent); }
.share-link {
  display: inline-block; margin-top: 12px; font-size: 0.9rem;
  text-decoration: underline; text-underline-offset: 2px;
}

.has-selection .list-pane { display: none; }
.has-selection .detail-pane { display: block; }

@media (min-width: 900px) {
  .dashboard { display: grid; grid-template-columns: 360px 1fr; align-items: start; gap: 24px; }
  .list-pane { display: block !important; max-height: 80vh; overflow-y: auto; }
  .detail-pane { display: block; margin-top: 0; position: sticky; top: 24px; max-height: 80vh; overflow-y: auto; }
}
</style>
