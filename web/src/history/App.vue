<script setup lang="ts">
import { ref } from 'vue';
import { scoreBand } from '../../shared/aivis-core.mjs';

interface ScanRecord {
  brand?: string;
  category?: string;
  generatedAt?: string;
  score?: number | null;
  encoded: string;
}

const passphrase = ref('');
const loading = ref(false);
const status = ref('');
const statusIsError = ref(false);
const scans = ref<ScanRecord[]>([]);
const hasLoaded = ref(false);

// Same band thresholds as result.html, but imported from aivis-core.mjs
// instead of re-derived — the vanilla-JS version had no module graph and
// had to hand-copy these thresholds; this version doesn't.
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

    <div id="list">
      <p class="empty" v-if="hasLoaded && scans.length === 0">No scans saved yet — run one from the home page.</p>
      <a
        v-for="scan in scans"
        :key="scan.encoded"
        class="scan-card"
        :href="`/result.html#d=${encodeURIComponent(scan.encoded)}`"
      >
        <div class="scan-row">
          <div>
            <div class="scan-brand">{{ scan.brand || 'Unknown' }}</div>
            <div class="scan-meta">{{ scan.category || '' }} · {{ formatDate(scan.generatedAt) }}</div>
          </div>
          <span v-if="typeof scan.score !== 'number'" class="scan-score na">no data</span>
          <span v-else class="scan-score" :style="{ color: scoreColor(scan.score) }">{{ scan.score }}</span>
        </div>
      </a>
    </div>
  </main>
</template>

<style scoped>
main { max-width: 640px; margin: 0 auto; padding: 48px 20px 80px; }
h1 { font-size: 1.5rem; margin: 0 0 4px; }
p.sub { color: var(--muted); margin-top: 0; margin-bottom: 24px; }

.gate {
  background: var(--card); border: 1px solid var(--border);
  border-radius: 14px; padding: 8px 20px 20px;
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

.scan-card {
  display: block;
  background: var(--card); border: 1px solid var(--border);
  border-radius: 12px; padding: 14px 16px; margin-bottom: 10px;
  text-decoration: none; color: var(--fg);
}
.scan-card:hover { border-color: var(--accent); }
.scan-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.scan-brand { font-weight: 600; }
.scan-meta { color: var(--muted); font-size: 0.85rem; margin-top: 2px; }
.scan-score {
  flex: none; font-weight: 700; font-size: 1.1rem;
  font-variant-numeric: proportional-nums;
}
.scan-score.na { color: var(--faint); font-weight: 500; font-size: 0.85rem; }
#list { margin-top: 8px; }
.empty { color: var(--muted); font-size: 0.9rem; }
</style>
