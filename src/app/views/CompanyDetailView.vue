<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { validatePayload } from '../../shared/scanPayload';
import ScanDetail from '../../shared/ScanDetail.vue';
import CompanyProgressChart from './CompanyProgressChart.vue';
import CompetitorTrendChart from './CompetitorTrendChart.vue';
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
  scan_frequency: 'off' | 'weekly';
}

interface Profile {
  plan_tier: string;
  subscription_status: string | null;
}

const company = ref<CompanyRow | null>(null);
const profile = ref<Profile>({ plan_tier: 'free', subscription_status: null });
const scans = ref<Record<string, unknown>[]>([]);
const loading = ref(true);
const loadError = ref('');
const selectedIndex = ref<number | null>(null);

const scanning = ref(false);
const scanStatus = ref('');
const scanError = ref('');
const scanUpgradeRequired = ref(false);
const upgrading = ref(false);
const scanTopupAvailable = ref(false);
const toppingUp = ref(false);
const topupBanner = ref<'success' | 'cancelled' | ''>('');
const startingSingleScan = ref(false);
const singleScanBanner = ref<'success' | 'cancelled' | ''>('');
const autoScanUpdating = ref(false);
let pollHandle: ReturnType<typeof setTimeout> | null = null;

const deepAdviceLoading = ref(false);
const sentimentJudgeLoadingKey = ref<string | null>(null);

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
    profile.value = data.profile || { plan_tier: 'free', subscription_status: null };
    scans.value = data.scans;
    // Scans come back newest-first (see CompanyProgressChart's own sort
    // comment) — auto-selecting index 0 shows the latest report immediately
    // instead of a blank "select a scan" placeholder, so the detail pane
    // never opens empty when there's already a result to show.
    selectedIndex.value = scans.value.length ? 0 : null;
    if (company.value) {
      document.title = `${company.value.brand} — Foreground`;
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

// Formats the live { completed, total, currentModels } progress the backend
// now writes incrementally during a scan (run-scan-background.mts) into a
// one-line status — replaces the old static "Running checks (~5-8 min)…"
// that gave no signal of what was actually happening for the whole wait.
// Falls back to the old static text if progress hasn't arrived yet (e.g.
// the very first poll, or a scan finalized before the `progress` column
// existed) rather than showing a broken "0/0" line. `currentModels` (was
// `currentModel: string | null`) became an array once provider lanes
// started running concurrently — more than one model can be in flight at
// once now, not just one.
function formatRunningStatus(progress: { completed: number; total: number; currentModels: string[] } | null) {
  if (!progress || !progress.total) return 'Running checks (~5-8 min)…';
  const checking = progress.currentModels?.length ? ` — checking ${progress.currentModels.join(', ')}…` : '';
  return `Running checks: ${progress.completed}/${progress.total} done${checking}`;
}

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
    scanStatus.value = data.status === 'running' ? formatRunningStatus(data.progress) : 'Queued…';
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
  scanTopupAvailable.value = false;
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
      scanTopupAvailable.value = !!data.topupAvailable;
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

// Same shape as startCheckout above — kept duplicated rather than shared,
// matching this codebase's convention of copy-pasted per-file auth/billing
// calls over a shared abstraction.
async function startTopupCheckout() {
  if (!company.value) return;
  toppingUp.value = true;
  try {
    const res = await authFetch('/create-topup-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: company.value.id }),
    });
    const data = await res.json();
    if (!data.ok) {
      scanError.value = data.error || 'Failed to start checkout.';
      toppingUp.value = false;
      return;
    }
    window.location.href = data.url;
  } catch (err) {
    scanError.value = (err as Error).message;
    toppingUp.value = false;
  }
}

// A $19 one-time scan for a free-tier user out of scans who doesn't want to
// subscribe (Milestone 2 of the 2026-08-24 monetization plan) — same shape
// as startCheckout/startTopupCheckout above, kept duplicated for the same
// reason.
async function startSingleScanCheckout() {
  if (!company.value) return;
  startingSingleScan.value = true;
  try {
    const res = await authFetch('/create-single-scan-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: company.value.id }),
    });
    const data = await res.json();
    if (!data.ok) {
      scanError.value = data.error || 'Failed to start checkout.';
      startingSingleScan.value = false;
      return;
    }
    window.location.href = data.url;
  } catch (err) {
    scanError.value = (err as Error).message;
    startingSingleScan.value = false;
  }
}

// Weekly auto-scans (scheduled-rescan.mts) are Pro-only — reused for the
// toggle below, same underlying check as allowDeepAdvice further down.
const isProUser = computed(() => profile.value.plan_tier === 'pro');

// Toggles companies.scan_frequency between 'off' and 'weekly'. A non-Pro
// caller PATCHing 'weekly' gets a 402 upgradeRequired from company.mts —
// route that into the same upgrade CTA the rest of this view already uses
// rather than a bespoke error message.
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

// Same source data as scanTrend, reshaped for CompetitorTrendChart's
// multi-series need (brand mention count + competitor tallies per scan) —
// GET /companies/:id already returns competitorTallies on every scan row
// via toScanPayload(), so no backend change was needed for this.
const competitorTrend = computed(() =>
  scans.value.map((s, index) => ({
    id: keyOf(s, index),
    generatedAt: typeof s.generatedAt === 'string' ? s.generatedAt : '',
    brandMentionCount: typeof s.citedCount === 'number' ? s.citedCount : 0,
    competitorTallies: Array.isArray(s.competitorTallies)
      ? (s.competitorTallies as { name: string; mentionCount: number; ambiguous: boolean }[])
      : [],
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

// Deep advice is Pro-gated (Milestone 1 of the monetization plan) — locked
// means "signed in, has a completed scan, but not entitled," distinct from
// simply not being allowed at all (result.html's unauthenticated context).
const allowDeepAdvice = computed(() => profile.value.plan_tier === 'pro');
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
  // Landed back here from a top-up Checkout redirect (?topup=success or
  // ?topup=cancelled) — same strip-after-read pattern as ?autoscan above.
  // Deliberately not routed through BillingSuccessView.vue: its poll-until
  // plan_tier==='pro' logic would resolve instantly for an already-Pro user
  // regardless of whether the webhook actually landed, so it's the wrong
  // tool for confirming a top-up purchase.
  if (route.query.topup === 'success' || route.query.topup === 'cancelled') {
    topupBanner.value = route.query.topup;
    const cleanedQuery = { ...route.query };
    delete cleanedQuery.topup;
    router.replace({ query: cleanedQuery });
  }
  // Landed back here from a $19 single-scan Checkout redirect
  // (?singlescan=success or ?singlescan=cancelled) — same strip-after-read
  // pattern as ?topup above. Unlike a top-up (which just raises a quota,
  // nothing new to show), a success here means the webhook creates a real
  // new scan — retry load() a few times so it appears without a manual
  // refresh, since the webhook runs asynchronously relative to this redirect.
  if (route.query.singlescan === 'success' || route.query.singlescan === 'cancelled') {
    singleScanBanner.value = route.query.singlescan;
    const cleanedQuery = { ...route.query };
    delete cleanedQuery.singlescan;
    router.replace({ query: cleanedQuery });
    if (singleScanBanner.value === 'success') {
      const baselineCount = scans.value.length;
      for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await load();
        if (scans.value.length > baselineCount) break;
      }
    }
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
          <div class="scan-status topup-banner" v-if="topupBanner === 'success'">
            Purchase received — your extra scans are ready.
            <button type="button" class="dismiss" @click="topupBanner = ''">Dismiss</button>
          </div>
          <div class="scan-status" v-else-if="topupBanner === 'cancelled'">
            Checkout cancelled — no charge was made.
            <button type="button" class="dismiss" @click="topupBanner = ''">Dismiss</button>
          </div>
          <div class="scan-status topup-banner" v-if="singleScanBanner === 'success'">
            Purchase received — your scan is starting.
            <button type="button" class="dismiss" @click="singleScanBanner = ''">Dismiss</button>
          </div>
          <div class="scan-status" v-else-if="singleScanBanner === 'cancelled'">
            Checkout cancelled — no charge was made.
            <button type="button" class="dismiss" @click="singleScanBanner = ''">Dismiss</button>
          </div>
          <button type="button" :disabled="scanning" @click="runNewScan">
            {{ scanning ? 'Scanning…' : 'Run new scan' }}
          </button>
          <button
            type="button"
            class="auto-scan-toggle"
            :class="{ active: company.scan_frequency === 'weekly' }"
            :disabled="autoScanUpdating"
            :title="isProUser ? '' : 'Automatic weekly scans are a Pro feature'"
            @click="toggleAutoScan"
          >
            Automatic weekly scans: {{ company.scan_frequency === 'weekly' ? 'On' : 'Off' }}
          </button>
          <div class="scan-status" v-if="scanStatus">{{ scanStatus }}</div>
          <div class="scan-status error" v-if="scanError">
            {{ scanError }}
            <button type="button" class="inline-upgrade" v-if="scanUpgradeRequired" :disabled="upgrading" @click="startCheckout">
              Upgrade to Pro
            </button>
            <button type="button" class="inline-upgrade" v-if="scanUpgradeRequired" :disabled="startingSingleScan" @click="startSingleScanCheckout">
              Buy one scan — $19
            </button>
            <button type="button" class="inline-upgrade" v-if="scanTopupAvailable" :disabled="toppingUp" @click="startTopupCheckout">
              Buy more scans
            </button>
          </div>
        </div>
      </div>

      <p class="empty" v-if="scans.length === 0 && !scanError && !scanning">
        No scans yet for this company — click "Run new scan" to check its AI search visibility.
      </p>

      <CompanyProgressChart v-if="scans.length >= 2" :scans="scanTrend" @select-point="selectScanById" />
      <CompetitorTrendChart v-if="scans.length >= 2" :scans="competitorTrend" @select-point="selectScanById" />

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
              theme="dashboard"
              :allow-deep-advice="allowDeepAdvice"
              :deep-advice-locked="deepAdviceLocked"
              :deep-advice-loading="deepAdviceLoading"
              :allow-sentiment-judge="true"
              :sentiment-judge-loading-key="sentimentJudgeLoadingKey"
              @generate-deep-advice="runDeepAdvice"
              @judge-sentiment="runSentimentJudge"
              @upgrade="startCheckout"
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
  background: transparent !important; color: var(--muted) !important;
  border: 1px solid var(--border) !important; box-shadow: none !important;
}
.auto-scan-toggle.active { border-color: var(--accent) !important; color: var(--fg) !important; }
.scan-status { margin-top: 8px; font-size: 0.82rem; color: var(--muted); max-width: 280px; }
.scan-status.error { color: var(--critical); }
.inline-upgrade {
  display: block; margin-top: 6px; padding: 4px 10px; font-size: 0.8rem; font-weight: 600;
  border: 1px solid var(--critical); border-radius: 999px; background: transparent; color: var(--critical); cursor: pointer;
}
.inline-upgrade:disabled { opacity: 0.6; cursor: wait; }
.topup-banner { color: var(--success-text); }
.dismiss {
  display: inline; margin-left: 6px; padding: 0; border: none; background: none;
  color: inherit; text-decoration: underline; font-size: inherit; cursor: pointer;
}

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
