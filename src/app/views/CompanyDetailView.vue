<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ScanDetail from '../../shared/ScanDetail.vue';
import CompanyProgressChart from './CompanyProgressChart.vue';
import Icon from '../../shared/Icon.vue';
import Breadcrumb from '../components/Breadcrumb.vue';
import { authFetch } from '../lib/auth';
import { formatDateTime } from '../lib/format';
import { useCompany } from '../composables/useCompany';
import { useScanSelection } from '../composables/useScanSelection';
import { useCheckout } from '../composables/useCheckout';
import { usePollScan } from '../composables/usePollScan';

const route = useRoute();
const router = useRouter();

const {
  company, profile, scans, loading, loadError, isProUser, allowDeepAdvice,
  load: loadCompany,
} = useCompany(() => route.params.id as string);
const {
  selectedIndex, selectedScan, selectedScanStatus, selectedPayload,
  selectScan, selectScanById, keyOf,
} = useScanSelection(scans);

// Scan-history dropdown (replaces the old permanent list column so the
// report itself gets full width) — same click-outside/Escape convention
// as AccountMenu.vue's dropdown.
const showHistory = ref(false);
const historyRef = ref<HTMLElement | null>(null);
function toggleHistory() {
  showHistory.value = !showHistory.value;
}
function closeHistory() {
  showHistory.value = false;
}
function pickScan(index: number) {
  selectScan(index);
  closeHistory();
}
function onHistoryDocClick(e: MouseEvent) {
  if (showHistory.value && historyRef.value && !historyRef.value.contains(e.target as Node)) closeHistory();
}
function onHistoryKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeHistory();
}
onMounted(() => {
  document.addEventListener('click', onHistoryDocClick);
  document.addEventListener('keydown', onHistoryKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onHistoryDocClick);
  document.removeEventListener('keydown', onHistoryKeydown);
});

interface CategoryBenchmark {
  companyCount: number;
  avgScore: number | null;
  medianScore: number | null;
  sufficientData: boolean;
  minSampleSize: number;
}
// Fetched once per company load (category is a company-level field, not
// per-scan) — best-effort, a failure here shouldn't block the rest of the
// page from rendering, same "additive, never blocking" treatment as
// everything else optional on this view.
const categoryBenchmark = ref<CategoryBenchmark | null>(null);
async function loadCategoryBenchmark(companyId: string) {
  try {
    const res = await authFetch(`/category-benchmark?company_id=${companyId}`);
    const data = await res.json();
    if (data.ok) categoryBenchmark.value = data;
  } catch {
    // best-effort — leave categoryBenchmark null, ScanDetail.vue's card
    // simply doesn't render rather than showing a broken state.
  }
}

const autoScanUpdating = ref(false);

const deepAdviceLoading = ref(false);
const sentimentJudgeLoadingKey = ref<string | null>(null);

// Non-completed scans have no generatedAt yet (only ever set on completion),
// so the history list would otherwise show "unknown date" for a scan that's
// simply still running, queued, or failed — a real, current status reads
// better than a falsely-implied missing timestamp.
function scanListStatusLabel(status: string) {
  if (status === 'running') return 'Running…';
  if (status === 'pending') return 'Queued…';
  if (status === 'failed') return 'Failed';
  return 'unknown date';
}

async function load() {
  await loadCompany();
  // Scans come back newest-first (see CompanyProgressChart's own sort
  // comment) — auto-selecting index 0 shows the latest report immediately
  // instead of a blank "select a scan" placeholder, so the detail pane
  // never opens empty when there's already a result to show.
  selectedIndex.value = scans.value.length ? 0 : null;
  if (company.value) {
    document.title = `${company.value.brand} — Foreground`;
    loadCategoryBenchmark(company.value.id);
  }
}

const {
  scanning, scanStatus, scanError, scanUpgradeRequired, pendingScanId,
  startScan, recheckPendingScan,
} = usePollScan(scans, load);
const { upgrading, startCheckout } = useCheckout((message) => { scanError.value = message; });

// Thin wrapper preserving the template/onMounted call sites' original
// no-arg shape — usePollScan's startScan takes a companyId explicitly since
// the composable itself has no notion of "the current company."
function runNewScan() {
  if (!company.value) return;
  startScan(company.value.id);
}

// isProUser now comes from useCompany() above — same underlying check
// allowDeepAdvice further down uses, both derived from `profile.plan_tier`.

// Toggles companies.scan_frequency between 'off' and 'weekly'. A non-Pro
// caller PATCHing 'weekly' gets a 402 upgradeRequired from company.mts, so
// route straight into checkout instead of round-tripping the PATCH first.
async function toggleAutoScan() {
  if (!company.value || autoScanUpdating.value) return;
  const nextFrequency = company.value.scan_frequency === 'weekly' ? 'off' : 'weekly';
  if (nextFrequency === 'weekly' && !isProUser.value) {
    startCheckout();
    return;
  }
  autoScanUpdating.value = true;
  try {
    const res = await authFetch(`/companies/${company.value.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scan_frequency: nextFrequency }),
    });
    const data = await res.json();
    if (!data.ok) {
      scanError.value = data.error || 'Failed to update automatic scans.';
      return;
    }
    company.value = data.company;
  } catch (err) {
    scanError.value = (err as Error).message;
  } finally {
    autoScanUpdating.value = false;
  }
}

const scanTrend = computed(() =>
  scans.value.map((s, index) => ({
    id: keyOf(s, index),
    generatedAt: typeof s.generatedAt === 'string' ? s.generatedAt : '',
    score: typeof s.score === 'number' ? s.score : null,
  }))
);

// selectedScan/selectedScanStatus/selectedPayload/selectScanById now come
// from useScanSelection() above.

// Entry point for ScanReportView.vue's dedicated Report page, for the
// scan currently being viewed.
const reportHref = computed(() =>
  selectedPayload.value ? `/app/companies/${route.params.id}/report?scan=${selectedPayload.value.id}` : null
);

// Deep advice is Pro-gated (Milestone 1 of the monetization plan) — locked
// means "signed in, has a completed scan, but not entitled," distinct from
// simply not being allowed at all (result.html's unauthenticated context).
// allowDeepAdvice comes from useCompany() above.
const deepAdviceLocked = computed(() => !allowDeepAdvice.value && !selectedPayload.value?.deepAdvice);

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

async function runSentimentJudge(promptIndex: number, model: string) {
  if (selectedIndex.value === null || !selectedPayload.value) return;
  sentimentJudgeLoadingKey.value = `${promptIndex}:${model}`;
  try {
    const res = await authFetch(`/scans/${selectedPayload.value.id}/judge-sentiment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ promptIndex, model }),
    });
    const data = await res.json();
    if (!data.ok) {
      scanError.value = data.error || 'Failed to judge sentiment.';
      return;
    }
    // Same replace-by-id reasoning as runDeepAdvice above.
    const idx = scans.value.findIndex((s) => s.id === data.scan.id);
    if (idx !== -1) scans.value[idx] = data.scan;
  } catch (err) {
    scanError.value = (err as Error).message;
  } finally {
    sentimentJudgeLoadingKey.value = null;
  }
}

// selectScan now comes from useScanSelection() above.

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
// stopPolling's onUnmounted cleanup now lives inside usePollScan() itself.
watch(() => route.params.id, load);
</script>

<template>
  <main>
    <div class="status error" v-if="loadError">
      {{ loadError }}
      <button type="button" class="inline-upgrade" @click="load">Try again</button>
    </div>
    <div class="skeleton" v-else-if="loading" aria-hidden="true">
      <div class="skeleton-bar skeleton-crumb"></div>
      <div class="skeleton-bar skeleton-title"></div>
      <div class="skeleton-card" v-for="n in 3" :key="n"></div>
    </div>

    <template v-else-if="company">
      <Breadcrumb :crumbs="[{ label: 'Companies', to: '/app' }, { label: company.brand }]" />
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
          <router-link
            v-if="scans.length"
            :to="`/app/companies/${company.id}/competitors`"
            class="competitors-link"
          >vs. Competitors &rarr;</router-link>
          <button
            type="button"
            class="auto-scan-toggle"
            :class="{ active: company.scan_frequency === 'weekly' }"
            :disabled="autoScanUpdating"
            :title="isProUser ? '' : 'Automatic weekly scans aren\'t available on the free plan right now'"
            @click="toggleAutoScan"
          >
            Automatic weekly scans: {{ company.scan_frequency === 'weekly' ? 'On' : 'Off' }}
          </button>
          <div class="scan-status" v-if="scanStatus">{{ scanStatus }}</div>
          <div class="scan-status error" v-if="scanError">
            {{ scanError }}
            <button type="button" class="inline-upgrade" v-if="pendingScanId" @click="recheckPendingScan">
              Check again
            </button>
            <button type="button" class="inline-upgrade" v-if="scanUpgradeRequired" :disabled="upgrading" @click="startCheckout">
              Upgrade to Pro
            </button>
          </div>
        </div>
      </div>

      <p class="empty" v-if="scans.length === 0 && !scanError && !scanning">
        No scans yet for this company — click "Run new scan" to check its AI search visibility.
      </p>

      <CompanyProgressChart v-if="scans.length >= 2" :scans="scanTrend" @select-point="selectScanById" />

      <div class="dashboard" v-if="scans.length">
        <div class="history-toolbar" ref="historyRef">
          <button
            type="button"
            class="history-toggle"
            :aria-expanded="showHistory"
            @click="toggleHistory"
          >
            Scan history
            <Icon name="caret-down" class="caret" :class="{ open: showHistory }" />
          </button>
          <div class="history-panel" v-if="showHistory">
            <h2 class="list-heading">Scan history</h2>
            <button
              v-for="(scan, index) in scans"
              :key="keyOf(scan, index)"
              type="button"
              class="scan-card"
              :class="{ active: index === selectedIndex }"
              @click="pickScan(index)"
            >
              <div class="scan-row">
                <div class="scan-meta">
                  {{ (scan as any).status === 'completed' || !(scan as any).status ? formatDateTime(scan.generatedAt) : scanListStatusLabel((scan as any).status) }}
                  <span v-if="index === 0" class="latest-tag">Latest</span>
                </div>
                <div class="scan-row-right">
                  <span v-if="typeof scan.score !== 'number'" class="scan-score na">no data</span>
                  <span v-else class="scan-score">{{ scan.score }}</span>
                  <Icon name="chevron" class="chevron" />
                </div>
              </div>
            </button>
          </div>
        </div>

        <div class="detail-pane">
          <template v-if="!selectedScan">
            <p class="empty placeholder">Select a scan from "Scan history" above to see full details.</p>
          </template>
          <template v-else>
            <ScanDetail
              v-if="selectedPayload"
              :payload="selectedPayload"
              theme="dashboard"
              :allow-deep-advice="allowDeepAdvice"
              :deep-advice-locked="deepAdviceLocked"
              :deep-advice-loading="deepAdviceLoading"
              :allow-sentiment-judge="true"
              :sentiment-judge-loading-key="sentimentJudgeLoadingKey"
              :category-benchmark="categoryBenchmark"
              :report-href="reportHref"
              @generate-deep-advice="runDeepAdvice"
              @judge-sentiment="runSentimentJudge"
              @upgrade="startCheckout"
            />
            <p class="empty" v-else-if="selectedScanStatus === 'failed'">
              This scan didn't complete: {{ (selectedScan as any)?.errorMessage || 'Something went wrong running the checks.' }}
            </p>
            <p class="empty" v-else-if="selectedScanStatus === 'pending' || selectedScanStatus === 'running'">
              This scan is still in progress — check back in a few minutes, or select it again once it finishes.
            </p>
            <p class="empty" v-else>This record couldn't be rendered — its stored data doesn't match the expected format.</p>
          </template>
        </div>
      </div>
    </template>
  </main>
</template>

<style scoped>
main { max-width: var(--page-max-wide); margin: 0 auto; padding: var(--space-2xl) var(--space-md) var(--space-xl); }
.head-row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: var(--space-md); margin-bottom: 24px; }
.head-row > div:first-child { min-width: 0; }
h1 { font-family: var(--font-display); font-size: var(--text-xl); font-weight: 700; margin: 0 0 4px; }
.legacy-tag {
  font-size: 0.7rem; font-weight: 600; color: var(--muted);
  border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px; margin-left: 8px; vertical-align: middle;
}
p.sub { color: var(--muted); margin: 0; overflow-wrap: anywhere; }
.scan-trigger { flex: none; text-align: right; }
.scan-trigger button {
  padding: 10px 16px; font-size: 0.9rem; font-weight: 600;
  border: none; border-radius: 8px; background: var(--accent); color: var(--accent-ink); cursor: pointer;
  box-shadow: var(--shadow); transition: transform 0.15s ease;
}
.scan-trigger button:hover:not(:disabled) { transform: translateY(-1px); }
.scan-trigger button:disabled { opacity: 0.6; cursor: wait; transform: none; }
.auto-scan-toggle {
  margin-top: 8px; margin-left: 0;
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--card) !important; color: var(--fg) !important;
  border: 1px solid var(--border) !important; box-shadow: var(--shadow) !important;
}
/* CSS-only toggle-switch track+knob, drawn as a pseudo-element so no extra
   markup is needed — a hard-edged radial-gradient "dot" inside a pill track,
   sliding from left (off) to right (active) via background-position math. */
.auto-scan-toggle::before {
  content: ''; flex: none; width: 30px; height: 17px; border-radius: 999px;
  background-color: var(--border);
  background-image: radial-gradient(circle 6px at 8px 8.5px, var(--faint) 100%, transparent 100%);
  transition: background-color 0.15s ease, background-image 0.15s ease;
}
.auto-scan-toggle:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border)) !important;
  background: color-mix(in srgb, var(--accent) 6%, var(--card)) !important;
}
.auto-scan-toggle.active {
  border-color: var(--accent) !important; color: var(--fg) !important;
  background: color-mix(in srgb, var(--accent) 10%, var(--card)) !important;
}
.auto-scan-toggle.active::before {
  background-color: var(--accent);
  background-image: radial-gradient(circle 6px at 22px 8.5px, var(--accent-ink) 100%, transparent 100%);
}
.competitors-link {
  display: inline-block; margin-top: 8px; margin-left: 8px;
  padding: 10px 16px; font-size: 0.9rem; font-weight: 600;
  border: 1px solid var(--border); border-radius: 8px; background: transparent; color: var(--fg);
}
.competitors-link:hover { border-color: var(--accent); }
.scan-status { margin-top: 8px; font-size: 0.82rem; color: var(--muted); max-width: 280px; }
.scan-status.error { color: var(--critical); }
.inline-upgrade {
  display: block; margin-top: 6px; padding: 4px 10px; font-size: 0.8rem; font-weight: 600;
  border: 1px solid var(--critical); border-radius: 999px; background: transparent; color: var(--critical); cursor: pointer;
}
.inline-upgrade:disabled { opacity: 0.6; cursor: wait; }

.status.error { font-size: 0.9rem; color: var(--critical); }
.empty { color: var(--muted); font-size: 0.9rem; }

.skeleton { padding-top: 4px; }
.skeleton-bar, .skeleton-card {
  background: linear-gradient(90deg, var(--card) 25%, var(--gridline) 50%, var(--card) 75%);
  background-size: 200% 100%; border-radius: var(--radius);
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
}
.skeleton-crumb { width: 140px; height: 14px; margin-bottom: 16px; }
.skeleton-title { width: 40%; height: 26px; margin-bottom: 24px; }
.skeleton-card { height: 54px; margin-bottom: 10px; }
@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton-bar, .skeleton-card { animation: none; background: var(--gridline); }
}

.dashboard { margin-top: 24px; }
.history-toolbar { position: relative; margin-bottom: 16px; }
.history-toggle {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 10px 16px; font-size: 0.9rem; font-weight: 600;
  border: 1px solid var(--border); border-radius: 8px; background: transparent; color: var(--fg); cursor: pointer;
  transition: border-color 0.15s ease;
}
.history-toggle:hover { border-color: var(--accent); }
.history-toggle .caret { width: 16px; height: 16px; color: var(--faint); transition: transform 0.15s ease; }
.history-toggle .caret.open { transform: rotate(180deg); }

.history-panel {
  position: absolute; top: calc(100% + 8px); left: 0; z-index: 30;
  width: min(380px, calc(100vw - 32px));
  max-height: min(60vh, 480px); overflow-y: auto;
  background: var(--card); border: 1px solid var(--border); border-radius: 10px;
  padding: 12px; box-shadow: var(--shadow);
}
.list-heading {
  font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em;
  color: var(--muted); margin: 0 0 10px; padding: 0 2px;
}

.scan-card {
  display: block; width: 100%; text-align: left;
  background: var(--card); border: 1px solid var(--border); border-left: 3px solid transparent;
  border-radius: 10px; padding: 14px 16px 14px 14px; margin-bottom: 10px;
  color: var(--fg); font: inherit; cursor: pointer;
  box-shadow: var(--shadow); transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.scan-card:hover { border-color: var(--accent); transform: translateY(-1px); }
.scan-card:hover .chevron { transform: translateX(2px); color: var(--accent); }
.scan-card.active {
  border-color: var(--accent); border-left-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 7%, var(--card));
}
.scan-card.active .chevron { color: var(--accent); }
.scan-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.scan-row-right { flex: none; display: flex; align-items: center; gap: 6px; }
.scan-meta { color: var(--muted); font-size: 0.85rem; }
.latest-tag {
  display: inline-block; margin-left: 8px; padding: 1px 8px; font-size: 0.68rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.02em; color: var(--accent-ink); background: var(--accent);
  border-radius: 999px; vertical-align: middle;
}
.scan-score { font-weight: 700; font-size: 1.1rem; font-variant-numeric: proportional-nums; }
.scan-score.na { color: var(--faint); font-weight: 500; font-size: 0.85rem; }
.chevron { width: 18px; height: 18px; color: var(--faint); transition: transform 0.15s ease, color 0.15s ease; }

.detail-pane {
  background: var(--card); border: 1px solid var(--border);
  border-radius: 12px; padding: 20px;
  box-shadow: var(--shadow);
}
.detail-pane .placeholder { padding: 20px 0; text-align: center; }
</style>
