<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { validatePayload } from '../../shared/scanPayload';
import ScanDetail from '../../shared/ScanDetail.vue';
import CompanyProgressChart from './CompanyProgressChart.vue';
import Icon from '../../shared/Icon.vue';
import Breadcrumb from '../components/Breadcrumb.vue';
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
  is_public: boolean;
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
const sentimentJudgeLoadingKey = ref<string | null>(null);

const isPublic = computed(() => company.value?.is_public === true);
// scans.value entries come from toScanPayload (scanRow.mts), which doesn't
// carry the DB's `status` column — a numeric score is the already-available
// signal this view already uses elsewhere (see the scan-list "no data"
// badge below) to mean "this scan produced real, renderable data."
const hasCompletedScan = computed(() => scans.value.some((s) => typeof s.score === 'number'));
const publicToggleLoading = ref(false);
const publicToggleError = ref('');
const publicUrlCopied = ref(false);
const publicUrl = computed(() =>
  company.value ? `${window.location.origin}/reports/${company.value.id}` : ''
);

async function togglePublic() {
  if (!company.value) return;
  publicToggleLoading.value = true;
  publicToggleError.value = '';
  publicUrlCopied.value = false;
  try {
    const res = await authFetch(`/companies/${company.value.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_public: !isPublic.value }),
    });
    const data = await res.json();
    if (!data.ok) {
      publicToggleError.value = data.error || 'Failed to update sharing setting.';
      return;
    }
    company.value = { ...company.value, is_public: data.company.is_public };
  } catch (err) {
    publicToggleError.value = (err as Error).message;
  } finally {
    publicToggleLoading.value = false;
  }
}

async function copyPublicUrl() {
  try {
    await navigator.clipboard.writeText(publicUrl.value);
    publicUrlCopied.value = true;
    setTimeout(() => {
      publicUrlCopied.value = false;
    }, 2000);
  } catch {
    // Clipboard API can fail (permissions, insecure context) — the URL is
    // already visible as selectable text, so this is a nice-to-have, not
    // required for the feature to work.
  }
}

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
  try {
    const res = await authFetch(`/companies/${route.params.id}`);
    const data = await res.json();
    if (!data.ok) {
      loadError.value = data.error || 'Failed to load company.';
      return;
    }
    company.value = data.company;
    scans.value = data.scans;
    // Scans come back newest-first (see CompanyProgressChart's own sort
    // comment) — auto-selecting index 0 shows the latest report immediately
    // instead of a blank "select a scan" placeholder, so the detail pane
    // never opens empty when there's already a result to show.
    selectedIndex.value = scans.value.length ? 0 : null;
    if (company.value) {
      document.title = `${company.value.brand} — AIVis`;
    }
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
    scanStatus.value = data.status === 'running' ? 'Running checks (~5-8 min)…' : 'Queued…';
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
  scans.value.map((s, index) => ({
    id: keyOf(s, index),
    generatedAt: typeof s.generatedAt === 'string' ? s.generatedAt : '',
    score: typeof s.score === 'number' ? s.score : null,
  }))
);

function selectScanById(id: string) {
  const idx = scans.value.findIndex((s, i) => keyOf(s, i) === id);
  if (idx !== -1) selectScan(idx);
}

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
          <div class="scan-status" v-if="scanStatus">{{ scanStatus }}</div>
          <div class="scan-status error" v-if="scanError">
            {{ scanError }}
            <button type="button" class="inline-upgrade" v-if="scanUpgradeRequired" :disabled="upgrading" @click="startCheckout">
              Upgrade to Pro
            </button>
          </div>
        </div>
      </div>

      <div class="public-share">
        <div class="public-share-head">
          <div>
            <strong>Public report page</strong>
            <p class="public-share-desc">
              Publish a shareable, no-login report page for this scan — the kind of
              real, crawlable page AI search engines and Google can actually index.
            </p>
          </div>
          <button
            type="button"
            class="public-toggle"
            :class="{ on: isPublic }"
            :disabled="publicToggleLoading || (!hasCompletedScan && !isPublic)"
            @click="togglePublic"
          >
            {{ publicToggleLoading ? 'Updating…' : isPublic ? 'Make private' : 'Make public' }}
          </button>
        </div>

        <p class="public-share-hint" v-if="!hasCompletedScan && !isPublic">
          Run a scan first — a report needs at least one completed scan before it can be published.
        </p>

        <div class="public-share-consent" v-if="isPublic || hasCompletedScan">
          <p>
            <strong>Before you turn this on:</strong> anyone with the link can view this
            report, no login required, and it becomes indexable content — visible to
            search engines and AI crawlers, not just a private link. You can turn it off
            anytime; that removes it from the report URL and future crawls, though copies
            already cached or indexed elsewhere are outside AIVis's control. Only publish
            this for <strong>your own business</strong> — not a competitor or prospect
            you're tracking privately.
          </p>
        </div>

        <div class="public-share-url" v-if="isPublic">
          <label for="public-share-url-input">Shareable URL</label>
          <div class="public-share-url-row">
            <input
              id="public-share-url-input"
              type="text"
              readonly
              :value="publicUrl"
              @focus="($event.target as HTMLInputElement).select()"
            />
            <button type="button" @click="copyPublicUrl">{{ publicUrlCopied ? 'Copied!' : 'Copy' }}</button>
          </div>
        </div>

        <p class="public-share-error" v-if="publicToggleError">{{ publicToggleError }}</p>
      </div>

      <p class="empty" v-if="scans.length === 0">
        No scans yet for this company — click "Run new scan" to check its AI search visibility.
      </p>

      <CompanyProgressChart v-if="scans.length >= 2" :scans="scanTrend" @select-point="selectScanById" />

      <div class="dashboard" v-if="scans.length" :class="{ 'has-selection': selectedIndex !== null }">
        <div class="list-pane">
          <h2 class="list-heading">Scan history</h2>
          <button
            v-for="(scan, index) in scans"
            :key="keyOf(scan, index)"
            type="button"
            class="scan-card"
            :class="{ active: index === selectedIndex }"
            @click="selectScan(index)"
          >
            <div class="scan-row">
              <div class="scan-meta">
                {{ formatDate(scan.generatedAt) }}
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
              :allow-sentiment-judge="true"
              :sentiment-judge-loading-key="sentimentJudgeLoadingKey"
              @generate-deep-advice="runDeepAdvice"
              @judge-sentiment="runSentimentJudge"
            />
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
h1 { font-size: var(--text-xl); font-weight: 700; margin: 0 0 4px; }
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
.scan-status { margin-top: 8px; font-size: 0.82rem; color: var(--muted); max-width: 220px; }
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

.public-share {
  background: var(--card); border: 1px solid var(--border);
  border-radius: 12px; padding: 16px 20px 18px; margin-bottom: 20px;
  box-shadow: var(--shadow);
  border-top: 3px solid var(--faint);
  transition: border-top-color 0.2s ease;
}
.public-share:has(.public-toggle.on) { border-top-color: var(--accent); }
.public-share-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 16px; }
.public-share-head > div:first-child { min-width: 0; flex: 1; }
.public-share-desc { color: var(--muted); font-size: 0.85rem; margin: 4px 0 0; max-width: 480px; }
.public-toggle {
  flex: none; padding: 8px 14px; font-size: 0.85rem; font-weight: 600;
  border: 1px solid var(--accent); border-radius: 8px;
  background: transparent; color: var(--accent); cursor: pointer;
}
.public-toggle.on { background: var(--accent); color: var(--accent-ink); }
.public-toggle:disabled { opacity: 0.5; cursor: not-allowed; }
.public-share-hint { color: var(--muted); font-size: 0.82rem; margin: 10px 0 0; }
.public-share-consent {
  margin-top: 12px; padding: 10px 14px;
  background: color-mix(in srgb, var(--warning) 14%, var(--card));
  border: 1px solid color-mix(in srgb, var(--warning) 40%, var(--border));
  border-radius: 8px;
}
.public-share-consent p { margin: 0; font-size: 0.82rem; color: var(--fg); line-height: 1.5; }
.public-share-url { margin-top: 14px; }
.public-share-url label { display: block; font-size: 0.78rem; font-weight: 600; color: var(--muted); margin-bottom: 4px; }
.public-share-url-row { display: flex; gap: 8px; }
.public-share-url-row input {
  flex: 1; min-width: 0; padding: 8px 10px; font-size: 0.85rem;
  border: 1px solid var(--border); border-radius: 8px;
  background: var(--card); color: var(--fg); font-family: ui-monospace, monospace;
}
.public-share-url-row button {
  flex: none; padding: 8px 14px; font-size: 0.85rem; font-weight: 600;
  border: 1px solid var(--border); border-radius: 8px;
  background: transparent; color: var(--fg); cursor: pointer;
}
.public-share-url-row button:hover { border-color: var(--accent); }
.public-share-error { color: var(--critical); font-size: 0.82rem; margin: 10px 0 0; }

.dashboard { margin-top: 24px; display: block; }
.list-pane { display: block; }
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
  display: none;
  background: var(--card); border: 1px solid var(--border);
  border-radius: 12px; padding: 20px; margin-top: 20px;
  box-shadow: var(--shadow);
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
