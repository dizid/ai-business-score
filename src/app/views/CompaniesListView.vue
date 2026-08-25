<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { scoreBand } from '../../../shared/aivis-core.mjs';
import { authFetch } from '../lib/auth';
import Icon from '../../shared/Icon.vue';

const router = useRouter();

interface CompanyRow {
  id: string;
  brand: string;
  website: string;
  category: string;
  is_legacy_import: boolean;
  scan_count: number;
  latest_score: number | null;
  created_at: string;
}

interface Profile {
  plan_tier: string;
  subscription_status: string | null;
}

const companies = ref<CompanyRow[]>([]);
const profile = ref<Profile>({ plan_tier: 'free', subscription_status: null });
const loading = ref(true);
const loadError = ref('');
const upgrading = ref(false);
const upgradeError = ref('');

const showCreate = ref(false);
const creating = ref(false);
const createError = ref('');
const createUpgradeRequired = ref(false);
const detailsRevealed = ref(false);
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

async function loadCompanies() {
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
    if (data.profile) profile.value = data.profile;
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
  enrichError.value = '';
  createError.value = '';
  createUpgradeRequired.value = false;
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
      createError.value = data.error || 'Failed to create company.';
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
        <h1>Companies</h1>
        <p class="sub">Track AI search visibility over time for each business you're watching.</p>
      </div>
      <div class="head-actions">
        <span class="plan-badge" :class="{ pro: profile.plan_tier === 'pro' }">
          {{ profile.plan_tier === 'pro' ? 'Pro' : 'Free plan' }}
        </span>
        <button type="button" class="upgrade-btn" v-if="profile.plan_tier !== 'pro'" :disabled="upgrading" @click="startCheckout">
          {{ upgrading ? 'Redirecting…' : 'Upgrade to Pro' }}
        </button>
        <button type="button" @click="toggleCreate">{{ showCreate ? 'Cancel' : '+ New company' }}</button>
      </div>
    </div>
    <p class="status error" v-if="upgradeError">{{ upgradeError }}</p>

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

    <div class="empty-state" v-else-if="companies.length === 0 && !showCreate">
      <div class="empty-icon" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8.5" stroke="currentColor" stroke-width="1.6"></circle>
          <path d="M6.5 10.5l2.3 2.3L13.5 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.35"></path>
        </svg>
      </div>
      <h2>No companies yet</h2>
      <p>Add a business to see whether it shows up when AI search engines are asked about its category.</p>
      <button type="button" class="empty-cta" @click="toggleCreate">+ Add your first company</button>
    </div>

    <div class="list" v-else-if="companies.length > 0">
      <router-link
        v-for="company in companies"
        :key="company.id"
        class="company-card"
        :to="`/app/companies/${company.id}`"
      >
        <div>
          <div class="brand">
            {{ company.brand }}
            <span class="legacy-tag" v-if="company.is_legacy_import">legacy import</span>
          </div>
          <div class="meta">{{ company.category }} · {{ company.website }} · {{ company.scan_count }} scan(s)</div>
        </div>
        <div class="score-wrap">
          <span v-if="typeof company.latest_score !== 'number'" class="score na">no data</span>
          <template v-else>
            <span class="score-dot" :style="{ background: scoreColor(company.latest_score) }"></span>
            <span class="score" :style="{ color: scoreColor(company.latest_score) }">{{ company.latest_score }}</span>
          </template>
          <Icon name="chevron" class="chevron" />
        </div>
      </router-link>
    </div>
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
