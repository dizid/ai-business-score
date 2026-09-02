<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { scoreBand } from '../../../shared/aivis-core.mjs';
import { authFetch } from '../lib/auth';
import Icon from '../../shared/Icon.vue';
import ScanDetail from '../../shared/ScanDetail.vue';
import { EXAMPLE_REPORT } from '../exampleReport';

const router = useRouter();

interface CompanyRow {
  id: string;
  brand: string;
  website: string;
  category: string;
  is_legacy_import: boolean;
  scan_count: number;
  latest_score: number | null;
  prev_score: number | null;
  delta: number | null;
  latest_scan_status: 'pending' | 'running' | 'completed' | 'failed' | null;
  last_scanned_at: string | null;
  created_at: string;
}

// Mirrors netlify/functions/_shared/plan.mts's REGRESSION_ALERT_THRESHOLD —
// duplicated here rather than imported since frontend/functions code isn't
// wired to share .mts constants across that build boundary. Keep in sync.
const REGRESSION_ALERT_THRESHOLD = 15;
const LONG_UNSCANNED_DAYS = 14;

type SortMode = 'recent' | 'score' | 'regression';
const sortMode = ref<SortMode>('recent');

interface Profile {
  plan_tier: string;
  subscription_status: string | null;
}

interface AlertRow {
  id: string;
  company_id: string;
  brand: string;
  prior_score: number;
  new_score: number;
  delta: number;
  created_at: string;
}

const companies = ref<CompanyRow[]>([]);
const alerts = ref<AlertRow[]>([]);
const profile = ref<Profile>({ plan_tier: 'free', subscription_status: null });
const loading = ref(true);
const loadError = ref('');
const upgrading = ref(false);
const upgradeError = ref('');

const showExample = ref(false);
const showCreate = ref(false);
const creating = ref(false);
const createError = ref('');
const createUpgradeRequired = ref(false);
const detailsRevealed = ref(false);
const editingDetails = ref(false);
const enriching = ref(false);
const enrichError = ref('');
const form = ref({
  brand: '',
  website: '',
  category: '',
  use_case: '',
  region: '',
  customer_segment: '',
  competitors: '',
  language: 'en',
});

const BAND_COLOR: Record<string, string> = {
  leading: 'var(--good)',
  visible: 'var(--warning)',
  weak: 'var(--serious)',
  invisible: 'var(--critical)',
  unavailable: 'var(--faint)',
};

function scoreColor(score: number | null) {
  return typeof score === 'number' ? BAND_COLOR[scoreBand(score)] : 'var(--faint)';
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

// "Needs attention": a real regression, a failed scan, never scanned, or
// scanned so long ago the data is stale — everything the header count and
// the "needs attention" sort surface. Ignores companies currently
// pending/running (nothing actionable until that scan resolves).
function needsAttention(c: CompanyRow): boolean {
  if (c.latest_scan_status === 'pending' || c.latest_scan_status === 'running') return false;
  if (c.latest_scan_status === 'failed') return true;
  if (c.scan_count === 0) return true;
  if (c.delta !== null && c.delta <= -REGRESSION_ALERT_THRESHOLD) return true;
  const age = daysSince(c.last_scanned_at);
  if (age !== null && age > LONG_UNSCANNED_DAYS) return true;
  return false;
}

const scoredCompanies = computed(() => companies.value.filter((c) => typeof c.latest_score === 'number'));

const portfolioStats = computed(() => {
  const scored = scoredCompanies.value;
  if (scored.length === 0) return null;
  const scores = scored.map((c) => c.latest_score as number);
  const avg = Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
  const best = scored.reduce((a, b) => ((b.latest_score as number) > (a.latest_score as number) ? b : a));
  const worst = scored.reduce((a, b) => ((b.latest_score as number) < (a.latest_score as number) ? b : a));
  const attentionCount = companies.value.filter(needsAttention).length;
  return { avg, best, worst, attentionCount };
});

const sortedCompanies = computed(() => {
  const rows = [...companies.value];
  if (sortMode.value === 'score') {
    return rows.sort((a, b) => (b.latest_score ?? -1) - (a.latest_score ?? -1));
  }
  if (sortMode.value === 'regression') {
    return rows.sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0));
  }
  return rows.sort((a, b) => new Date(b.last_scanned_at ?? b.created_at).getTime() - new Date(a.last_scanned_at ?? a.created_at).getTime());
});

function formatAlertAge(iso: string): string {
  const age = daysSince(iso);
  if (age === null) return '';
  if (age < 1) return 'today';
  if (age < 2) return 'yesterday';
  return `${Math.floor(age)}d ago`;
}

function formatLastScanned(c: CompanyRow): string {
  if (!c.last_scanned_at) return 'Never scanned';
  const age = daysSince(c.last_scanned_at);
  if (age === null) return 'Never scanned';
  if (age < 1) return 'Scanned today';
  if (age < 2) return 'Scanned yesterday';
  return `Scanned ${Math.floor(age)}d ago`;
}

async function loadCompanies() {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await authFetch('/companies');
    const data = await res.json();
    if (!data.ok) {
      loadError.value = data.error || 'Failed to load brands.';
      return;
    }
    companies.value = data.companies;
    if (data.profile) profile.value = data.profile;
    alerts.value = data.alerts || [];
  } catch (err) {
    loadError.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}

async function startCheckout() {
  upgrading.value = true;
  upgradeError.value = '';
  try {
    const res = await authFetch('/create-checkout-session', { method: 'POST' });
    const data = await res.json();
    if (!data.ok) {
      upgradeError.value = data.error || 'Failed to start checkout.';
      upgrading.value = false;
      return;
    }
    window.location.href = data.url;
  } catch (err) {
    upgradeError.value = (err as Error).message;
    upgrading.value = false;
  }
}

function resetForm() {
  form.value = { brand: '', website: '', category: '', use_case: '', region: '', customer_segment: '', competitors: '', language: 'en' };
  detailsRevealed.value = false;
  editingDetails.value = false;
  enrichError.value = '';
  createError.value = '';
  createUpgradeRequired.value = false;
}

// Enrichment succeeded and the user hasn't asked to edit: show a compact
// confirm card instead of forcing a click through all 7 fields. Falls back
// to the full editable form on enrich failure, since those fields are
// blank and need real input.
const showSummary = computed(() => detailsRevealed.value && !editingDetails.value && !enrichError.value);

function editDetails() {
  editingDetails.value = true;
}

function toggleCreate() {
  if (showCreate.value) {
    showCreate.value = false;
  } else {
    resetForm();
    showCreate.value = true;
  }
}

// Step 1 -> 2: research the URL via /enrich to pre-fill the rest of the
// fields. Best-effort — enrich.mts always returns 200 (even on internal
// failure, {ok:false}), so a failure just means "start from blank, editable
// fields" rather than blocking the flow.
async function onEnrich() {
  enriching.value = true;
  enrichError.value = '';
  try {
    const res = await authFetch('/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ website: form.value.website }),
    });
    const data = await res.json();
    if (data.ok) {
      form.value = {
        brand: data.brand,
        website: data.website || form.value.website,
        category: data.category,
        use_case: data.use_case,
        region: data.region,
        customer_segment: data.customer_segment,
        competitors: (data.competitors || []).join(', '),
        language: data.language === 'nl' ? 'nl' : 'en',
      };
    } else {
      enrichError.value = data.error || "Couldn't auto-fill from that URL — fill in the details below.";
    }
  } catch (err) {
    enrichError.value = "Couldn't auto-fill from that URL — fill in the details below.";
  } finally {
    enriching.value = false;
    detailsRevealed.value = true;
  }
}

function backToUrl() {
  detailsRevealed.value = false;
  editingDetails.value = false;
  enrichError.value = '';
}

function onSubmit() {
  if (!detailsRevealed.value) {
    onEnrich();
  } else {
    onCreate();
  }
}

async function onCreate() {
  creating.value = true;
  createError.value = '';
  createUpgradeRequired.value = false;
  try {
    const res = await authFetch('/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form.value),
    });
    const data = await res.json();
    if (!data.ok) {
      createError.value = data.error || 'Failed to create brand.';
      createUpgradeRequired.value = !!data.upgradeRequired;
      return;
    }
    showCreate.value = false;
    resetForm();
    // Land on the new company's detail view and auto-trigger its first scan
    // (CompanyDetailView.vue's onMounted watches for autoscan=1) instead of
    // staying on the list, where a brand-new company would show the same
    // bare `0` a real zero-score brand shows — ambiguous and confusing.
    router.push({ name: 'company', params: { id: data.company.id }, query: { autoscan: '1' } });
  } catch (err) {
    createError.value = (err as Error).message;
  } finally {
    creating.value = false;
  }
}

onMounted(loadCompanies);
</script>

<template>
  <main>
    <div class="head-row">
      <div>
        <h1>Brands</h1>
        <p class="sub">Track AI search visibility over time for each business you're watching.</p>
      </div>
      <div class="head-actions">
        <span class="plan-badge" :class="{ pro: profile.plan_tier === 'pro' }">
          {{ profile.plan_tier === 'pro' ? 'Pro' : 'Free plan' }}
        </span>
        <button type="button" class="upgrade-btn" v-if="profile.plan_tier !== 'pro'" :disabled="upgrading" @click="startCheckout">
          {{ upgrading ? 'Redirecting…' : 'Upgrade to Pro' }}
        </button>
        <button type="button" @click="toggleCreate">{{ showCreate ? 'Cancel' : '+ New brand' }}</button>
      </div>
    </div>
    <p class="status error" v-if="upgradeError">{{ upgradeError }}</p>

    <div class="portfolio-strip" v-if="portfolioStats && !showCreate && !showExample">
      <div class="portfolio-stat">
        <span class="portfolio-value">{{ portfolioStats.avg }}</span>
        <span class="portfolio-label">Portfolio average</span>
      </div>
      <div class="portfolio-stat">
        <span class="portfolio-value" :style="{ color: scoreColor(portfolioStats.best.latest_score) }">{{ portfolioStats.best.latest_score }}</span>
        <span class="portfolio-label">Best — {{ portfolioStats.best.brand }}</span>
      </div>
      <div class="portfolio-stat">
        <span class="portfolio-value" :style="{ color: scoreColor(portfolioStats.worst.latest_score) }">{{ portfolioStats.worst.latest_score }}</span>
        <span class="portfolio-label">Worst — {{ portfolioStats.worst.brand }}</span>
      </div>
      <div class="portfolio-stat" :class="{ warn: portfolioStats.attentionCount > 0 }">
        <span class="portfolio-value">{{ portfolioStats.attentionCount }}</span>
        <span class="portfolio-label">Needing attention</span>
      </div>
    </div>

    <div class="alerts-section" v-if="alerts.length > 0 && !showCreate && !showExample">
      <h2 class="alerts-heading">Alerts</h2>
      <router-link
        v-for="alert in alerts"
        :key="alert.id"
        class="alert-row"
        :to="`/app/companies/${alert.company_id}`"
      >
        <strong>{{ alert.brand }}</strong> dropped {{ Math.abs(alert.delta) }} points
        ({{ alert.prior_score }} → {{ alert.new_score }}) · {{ formatAlertAge(alert.created_at) }}
      </router-link>
    </div>

    <form class="card create-card" v-if="showCreate" @submit.prevent="onSubmit">
      <div class="step-indicator" aria-hidden="true">
        <span class="step-dot" :class="{ active: !detailsRevealed, done: detailsRevealed }">1</span>
        <span class="step-line" :class="{ done: detailsRevealed }"></span>
        <span class="step-dot" :class="{ active: detailsRevealed }">2</span>
      </div>
      <div class="step-labels">
        <span :class="{ active: !detailsRevealed }">Website</span>
        <span :class="{ active: detailsRevealed }">Review details</span>
      </div>
      <template v-if="!detailsRevealed">
        <label>Website</label>
        <input type="text" v-model="form.website" required placeholder="acmeplumbing.com" autofocus />
        <p class="hint-text">We'll look up the site and pre-fill the rest — you can edit anything before creating.</p>

        <button type="submit" :disabled="enriching || !form.website.trim()">{{ enriching ? 'Looking it up…' : 'Continue' }}</button>
      </template>

      <template v-else-if="showSummary">
        <button type="button" class="back-link" @click="backToUrl">&larr; Change URL</button>
        <div class="summary-card">
          <div class="summary-row"><span class="summary-label">Brand</span><span>{{ form.brand }}</span></div>
          <div class="summary-row"><span class="summary-label">Website</span><span>{{ form.website }}</span></div>
          <div class="summary-row"><span class="summary-label">Category</span><span>{{ form.category }}</span></div>
          <div class="summary-row"><span class="summary-label">Use case</span><span>{{ form.use_case }}</span></div>
          <div class="summary-row"><span class="summary-label">Region</span><span>{{ form.region }}</span></div>
          <div class="summary-row"><span class="summary-label">Segment</span><span>{{ form.customer_segment }}</span></div>
          <div class="summary-row"><span class="summary-label">Competitors</span><span>{{ form.competitors }}</span></div>
        </div>
        <button type="submit" :disabled="creating">{{ creating ? 'Creating…' : 'Create brand' }}</button>
        <button type="button" class="edit-details-link" @click="editDetails">Edit details first</button>
      </template>

      <template v-else>
        <button type="button" class="back-link" @click="backToUrl">&larr; Change URL</button>
        <div class="status error" v-if="enrichError">{{ enrichError }}</div>

        <label>Brand name</label>
        <input type="text" v-model="form.brand" required />

        <label>Website</label>
        <input type="text" v-model="form.website" required placeholder="acmeplumbing.com" />

        <label>Category</label>
        <input type="text" v-model="form.category" required placeholder="emergency plumber" />

        <label>Use case</label>
        <input type="text" v-model="form.use_case" required placeholder="a burst pipe at home" />

        <label>Region</label>
        <input type="text" v-model="form.region" required placeholder="Rotterdam" />

        <label>Customer segment</label>
        <input type="text" v-model="form.customer_segment" required placeholder="homeowners" />

        <label>Competitors <span class="hint">(comma-separated, 2-3)</span></label>
        <input type="text" v-model="form.competitors" required placeholder="Bob's Pipes, QuickFlow Plumbing" />

        <label>Scan language <span class="hint">(auto-detected, editable)</span></label>
        <select v-model="form.language">
          <option value="en">English</option>
          <option value="nl">Dutch</option>
        </select>

        <button type="submit" :disabled="creating">{{ creating ? 'Creating…' : 'GO' }}</button>
      </template>

      <div class="status error" v-if="createError">
        {{ createError }}
        <button type="button" class="inline-upgrade" v-if="createUpgradeRequired" :disabled="upgrading" @click="startCheckout">
          Upgrade to Pro
        </button>
      </div>
    </form>

    <p class="status error" v-if="loadError">{{ loadError }}</p>
    <div class="skeleton" v-else-if="loading" aria-hidden="true">
      <div class="skeleton-card" v-for="n in 3" :key="n"></div>
    </div>

    <div class="empty-state" v-else-if="companies.length === 0 && !showCreate && !showExample">
      <div class="empty-icon" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8.5" stroke="currentColor" stroke-width="1.6"></circle>
          <path d="M6.5 10.5l2.3 2.3L13.5 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.35"></path>
        </svg>
      </div>
      <h2>No brands yet</h2>
      <p>Add a business to see whether it shows up when AI search engines are asked about its category.</p>
      <button type="button" class="empty-cta" @click="toggleCreate">+ Add your first brand</button>
      <button type="button" class="example-link" @click="showExample = true">See what a report looks like →</button>
    </div>

    <div class="example-wrap" v-else-if="showExample">
      <button type="button" class="back-link example-back" @click="showExample = false">&larr; Back</button>
      <div class="example-banner">Example report — illustrative data, not a real scan.</div>
      <ScanDetail :payload="EXAMPLE_REPORT" theme="dashboard" />
    </div>

    <template v-else-if="companies.length > 0">
      <div class="list-controls">
        <label for="sort-select">Sort by</label>
        <select id="sort-select" v-model="sortMode">
          <option value="recent">Last scanned</option>
          <option value="score">Score</option>
          <option value="regression">Biggest drop first</option>
        </select>
      </div>
      <div class="list">
        <router-link
          v-for="company in sortedCompanies"
          :key="company.id"
          class="company-card"
          :class="{ attention: needsAttention(company) }"
          :to="`/app/companies/${company.id}`"
        >
          <div>
            <div class="brand">
              {{ company.brand }}
              <span class="legacy-tag" v-if="company.is_legacy_import">legacy import</span>
              <span class="attention-tag" v-if="needsAttention(company)">needs attention</span>
            </div>
            <div class="meta">{{ company.category }} · {{ company.website }} · {{ company.scan_count }} scan(s)</div>
            <div class="meta scan-meta">
              {{ formatLastScanned(company) }}
              <template v-if="company.latest_scan_status === 'running' || company.latest_scan_status === 'pending'"> · scan in progress</template>
              <template v-else-if="company.latest_scan_status === 'failed'"> · last scan failed</template>
            </div>
          </div>
          <div class="score-wrap">
            <span v-if="company.delta !== null" class="delta-badge" :class="company.delta > 0 ? 'up' : company.delta < 0 ? 'down' : 'flat'">
              {{ company.delta > 0 ? '↑' : company.delta < 0 ? '↓' : '·' }}{{ company.delta !== 0 ? Math.abs(company.delta) : '' }}
            </span>
            <span v-if="typeof company.latest_score !== 'number'" class="score na">no data</span>
            <template v-else>
              <span class="score-dot" :style="{ background: scoreColor(company.latest_score) }"></span>
              <span class="score" :style="{ color: scoreColor(company.latest_score) }">{{ company.latest_score }}</span>
            </template>
            <Icon name="chevron" class="chevron" />
          </div>
        </router-link>
      </div>
    </template>
  </main>
</template>

<style scoped>
main { max-width: var(--page-max); margin: 0 auto; padding: var(--space-2xl) var(--space-md) var(--space-xl); }
.head-row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: var(--space-md); margin-bottom: 28px; }
h1 { font-family: var(--font-display); font-size: var(--text-xl); font-weight: 700; letter-spacing: -0.01em; margin: 0 0 4px; }
p.sub { color: var(--muted); margin: 0; }
.head-actions { flex: none; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.head-row button {
  flex: none; padding: 10px 16px; font-size: 0.9rem; font-weight: 600;
  border: none; border-radius: 8px; background: var(--accent); color: var(--accent-ink); cursor: pointer;
  box-shadow: var(--shadow); transition: transform 0.15s ease, opacity 0.15s ease;
}
.head-row button:hover:not(:disabled) { transform: translateY(-1px); }
.head-row button:disabled { opacity: 0.6; cursor: wait; transform: none; }
.plan-badge {
  font-size: 0.78rem; font-weight: 600; color: var(--muted);
  border: 1px solid var(--border); border-radius: 999px; padding: 5px 12px; box-shadow: none;
}
.plan-badge.pro { color: var(--good); border-color: color-mix(in srgb, var(--good) 45%, transparent); background: color-mix(in srgb, var(--good) 10%, transparent); }
.upgrade-btn { background: transparent !important; border: 1px solid var(--accent) !important; color: var(--accent) !important; box-shadow: none !important; }
.upgrade-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 10%, transparent) !important; }
.inline-upgrade {
  margin-left: 10px; padding: 4px 10px; font-size: 0.82rem; font-weight: 600;
  border: 1px solid var(--critical); border-radius: 999px; background: transparent; color: var(--critical); cursor: pointer;
}
.inline-upgrade:disabled { opacity: 0.6; cursor: wait; }

.portfolio-strip {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px;
  margin-bottom: 24px;
}
.portfolio-stat {
  background: var(--card); border: 1px solid var(--border); border-radius: 10px;
  padding: 14px 16px; box-shadow: var(--shadow);
}
.portfolio-stat.warn { border-color: color-mix(in srgb, var(--critical) 40%, var(--border)); }
.portfolio-value { display: block; font-size: 1.5rem; font-weight: 700; font-variant-numeric: proportional-nums; }
.portfolio-stat.warn .portfolio-value { color: var(--critical); }
.portfolio-label { display: block; font-size: 0.78rem; color: var(--muted); margin-top: 2px; }

.alerts-section {
  background: color-mix(in srgb, var(--critical) 6%, var(--card));
  border: 1px solid color-mix(in srgb, var(--critical) 30%, var(--border));
  border-radius: 12px; padding: 16px 18px; margin-bottom: 24px;
}
.alerts-heading { font-size: 0.85rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; color: var(--critical); margin: 0 0 10px; }
.alert-row {
  display: block; padding: 7px 0; font-size: 0.88rem; color: var(--fg);
  text-decoration: none; border-bottom: 1px solid color-mix(in srgb, var(--critical) 12%, transparent);
}
.alert-row:last-child { border-bottom: none; }
.alert-row:hover { color: var(--critical); }

.list-controls {
  display: flex; align-items: center; gap: 8px; justify-content: flex-end;
  margin-bottom: 10px; font-size: 0.85rem; color: var(--muted);
}
.list-controls select {
  padding: 5px 10px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--card); color: var(--fg); font-size: 0.85rem;
}

.attention-tag {
  font-size: 0.7rem; font-weight: 600; color: var(--critical);
  border: 1px solid color-mix(in srgb, var(--critical) 45%, transparent);
  background: color-mix(in srgb, var(--critical) 10%, transparent);
  border-radius: 999px; padding: 2px 8px; margin-left: 8px;
}
.company-card.attention { border-color: color-mix(in srgb, var(--critical) 30%, var(--border)); }
.scan-meta { margin-top: 1px; }
.delta-badge {
  font-size: 0.78rem; font-weight: 700; font-variant-numeric: proportional-nums;
  border-radius: 999px; padding: 2px 8px;
}
.delta-badge.up { color: var(--good); background: color-mix(in srgb, var(--good) 12%, transparent); }
.delta-badge.down { color: var(--critical); background: color-mix(in srgb, var(--critical) 12%, transparent); }
.delta-badge.flat { color: var(--muted); background: color-mix(in srgb, var(--muted) 10%, transparent); }

.card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px 24px 26px; margin-bottom: 28px; box-shadow: var(--shadow); }
.card label { display: block; font-size: 0.83rem; font-weight: 600; color: var(--muted); margin-top: 18px; margin-bottom: 6px; }
.card label .hint { font-weight: 400; color: var(--muted); }
.hint-text { color: var(--muted); font-size: 0.85rem; margin: 8px 0 0; }
.back-link {
  display: block; margin: 0 0 4px; padding: 0; border: none; background: none;
  color: var(--muted); font-size: 0.85rem; text-decoration: underline; cursor: pointer;
}
.card input, .card select {
  width: 100%; padding: 11px 13px; font-size: 1rem;
  border: 1px solid var(--border); border-radius: 8px; background: transparent; color: var(--fg);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.card select { background: var(--card); }
.card input:hover, .card select:hover { border-color: color-mix(in srgb, var(--fg) 25%, var(--border)); }
.card input:focus, .card select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent); }
.card button[type="submit"] {
  margin-top: 24px; width: 100%; padding: 12px 16px; font-size: 1rem; font-weight: 600;
  border: none; border-radius: 8px; background: var(--accent); color: var(--accent-ink); cursor: pointer;
  box-shadow: var(--shadow); transition: transform 0.15s ease, opacity 0.15s ease;
}
.card button[type="submit"]:hover:not(:disabled) { transform: translateY(-1px); }
.card button:disabled { opacity: 0.6; cursor: wait; transform: none; }

/* Step indicator for the two-step create-company flow */
.step-indicator { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.step-dot {
  flex: none; width: 22px; height: 22px; border-radius: 999px; display: flex; align-items: center; justify-content: center;
  font-size: 0.72rem; font-weight: 700; color: var(--faint); border: 1.5px solid var(--border);
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.step-dot.active { color: var(--accent-ink); border-color: var(--accent); background: var(--accent); }
.step-dot.done { color: var(--accent); border-color: var(--accent); background: transparent; }
.step-line { flex: 1; height: 1.5px; background: var(--border); }
.step-line.done { background: var(--accent); }
.step-labels {
  display: flex; justify-content: space-between; font-size: 0.72rem; font-weight: 600;
  color: var(--faint); text-transform: uppercase; letter-spacing: 0.02em; margin-bottom: 4px;
}
.step-labels span.active { color: var(--accent); }

.summary-card {
  background: var(--bg); border: 1px solid var(--border); border-radius: 10px;
  padding: 4px 16px; margin-top: 4px;
}
.summary-row {
  display: flex; justify-content: space-between; gap: 12px; padding: 10px 0;
  border-bottom: 1px solid var(--border); font-size: 0.9rem;
}
.summary-row:last-child { border-bottom: none; }
.summary-label { flex: none; color: var(--muted); font-weight: 600; }
.summary-row span:last-child { flex: 1 1 auto; min-width: 0; text-align: right; overflow-wrap: anywhere; }
.edit-details-link {
  display: block; margin: 10px auto 0; padding: 0; border: none; background: none;
  color: var(--muted); font-size: 0.85rem; text-decoration: underline; cursor: pointer;
}

.status.error { margin-top: 12px; font-size: 0.9rem; color: var(--critical); }

.skeleton { padding-top: 4px; }
.skeleton-card {
  height: 62px; margin-bottom: 10px; border-radius: var(--radius-lg);
  background: linear-gradient(90deg, var(--card) 25%, var(--gridline) 50%, var(--card) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
}
@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton-card { animation: none; background: var(--gridline); }
}

.empty-state {
  text-align: center; background: var(--card); border: 1px dashed var(--border); border-radius: 12px;
  padding: 48px 24px; color: var(--muted);
}
.empty-icon {
  display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px;
  border-radius: 999px; background: color-mix(in srgb, var(--accent) 10%, transparent); color: var(--accent);
  margin-bottom: 16px;
}
.empty-state h2 { font-size: 1.1rem; font-weight: 600; color: var(--fg); margin: 0 0 6px; }
.empty-state p { margin: 0 auto 22px; max-width: 40ch; font-size: 0.92rem; }
.empty-cta {
  padding: 10px 18px; font-size: 0.9rem; font-weight: 600; border: none; border-radius: 8px;
  background: var(--accent); color: var(--accent-ink); cursor: pointer; box-shadow: var(--shadow);
  transition: transform 0.15s ease;
}
.empty-cta:hover { transform: translateY(-1px); }
.example-link {
  display: block; margin: 14px auto 0; padding: 0; border: none; background: none;
  color: var(--muted); font-size: 0.85rem; text-decoration: underline; cursor: pointer;
}

.example-wrap { position: relative; }
.example-back { margin-bottom: 12px; }
.example-banner {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  color: var(--accent); font-size: 0.85rem; font-weight: 600;
  border-radius: 8px; padding: 10px 14px; margin-bottom: 18px;
}

.list { display: flex; flex-direction: column; gap: 10px; }
.company-card {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  background: var(--card); border: 1px solid var(--border); border-radius: 12px;
  padding: 15px 18px; text-decoration: none; color: var(--fg);
  box-shadow: var(--shadow); transition: transform 0.15s ease, border-color 0.15s ease;
}
.company-card:hover { border-color: var(--accent); transform: translateY(-1px); }
.company-card:hover .chevron { transform: translateX(2px); color: var(--accent); }
.brand { font-weight: 600; }
.legacy-tag {
  font-size: 0.7rem; font-weight: 600; color: var(--muted);
  border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px; margin-left: 8px;
}
.meta { color: var(--muted); font-size: 0.85rem; margin-top: 2px; }
.score-wrap { flex: none; display: flex; align-items: center; gap: 8px; }
.score-dot { width: 8px; height: 8px; border-radius: 999px; flex: none; }
.score { font-weight: 700; font-size: 1.1rem; font-variant-numeric: proportional-nums; }
.score.na { color: var(--faint); font-weight: 500; font-size: 0.85rem; }
.chevron { width: 18px; height: 18px; color: var(--faint); transition: transform 0.15s ease, color 0.15s ease; }
</style>
