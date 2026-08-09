<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { scoreBand } from '../../../shared/aivis-core.mjs';
import { authFetch } from '../lib/auth';

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

const companies = ref<CompanyRow[]>([]);
const loading = ref(true);
const loadError = ref('');

const showCreate = ref(false);
const creating = ref(false);
const createError = ref('');
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
  } catch (err) {
    loadError.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  form.value = { brand: '', website: '', category: '', use_case: '', region: '', customer_segment: '', competitors: '' };
  detailsRevealed.value = false;
  enrichError.value = '';
  createError.value = '';
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
  try {
    const res = await authFetch('/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form.value),
    });
    const data = await res.json();
    if (!data.ok) {
      createError.value = data.error || 'Failed to create company.';
      return;
    }
    showCreate.value = false;
    resetForm();
    await loadCompanies();
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
      <button type="button" @click="toggleCreate">{{ showCreate ? 'Cancel' : '+ New company' }}</button>
    </div>

    <form class="card create-card" v-if="showCreate" @submit.prevent="onSubmit">
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

        <button type="submit" :disabled="creating">{{ creating ? 'Creating…' : 'GO' }}</button>
      </template>

      <div class="status error" v-if="createError">{{ createError }}</div>
    </form>

    <p class="status error" v-if="loadError">{{ loadError }}</p>
    <p class="empty" v-else-if="loading">Loading…</p>
    <p class="empty" v-else-if="companies.length === 0">No companies yet — add one to run your first scan.</p>

    <div class="list" v-else>
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
        <span v-if="typeof company.latest_score !== 'number'" class="score na">no data</span>
        <span v-else class="score" :style="{ color: scoreColor(company.latest_score) }">{{ company.latest_score }}</span>
      </router-link>
    </div>
  </main>
</template>

<style scoped>
main { max-width: 800px; margin: 0 auto; padding: 48px 20px 80px; }
.head-row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 24px; }
h1 { font-size: 1.5rem; margin: 0 0 4px; }
p.sub { color: var(--muted); margin: 0; }
.head-row button {
  flex: none; padding: 10px 16px; font-size: 0.9rem; font-weight: 600;
  border: none; border-radius: 8px; background: var(--accent); color: #fff; cursor: pointer;
}

.card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 8px 20px 20px; margin-bottom: 24px; }
.card label { display: block; font-size: 0.85rem; font-weight: 600; margin-top: 18px; margin-bottom: 6px; }
.card label .hint { font-weight: 400; color: var(--muted); }
.hint-text { color: var(--muted); font-size: 0.85rem; margin: 8px 0 0; }
.back-link {
  display: block; margin: 18px 0 4px; padding: 0; border: none; background: none;
  color: var(--muted); font-size: 0.85rem; text-decoration: underline; cursor: pointer;
}
.card input {
  width: 100%; padding: 10px 12px; font-size: 1rem;
  border: 1px solid var(--border); border-radius: 8px; background: transparent; color: var(--fg);
}
.card input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
.card button[type="submit"] {
  margin-top: 24px; width: 100%; padding: 12px 16px; font-size: 1rem; font-weight: 600;
  border: none; border-radius: 8px; background: var(--accent); color: #fff; cursor: pointer;
}
.card button:disabled { opacity: 0.6; cursor: wait; }

.status.error { margin-top: 12px; font-size: 0.9rem; color: var(--critical); }
.empty { color: var(--muted); font-size: 0.9rem; }

.list { display: flex; flex-direction: column; gap: 10px; }
.company-card {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  background: var(--card); border: 1px solid var(--border); border-radius: 12px;
  padding: 14px 16px; text-decoration: none; color: var(--fg);
}
.company-card:hover { border-color: var(--accent); }
.brand { font-weight: 600; }
.legacy-tag {
  font-size: 0.7rem; font-weight: 600; color: var(--muted);
  border: 1px solid var(--border); border-radius: 999px; padding: 2px 8px; margin-left: 8px;
}
.meta { color: var(--muted); font-size: 0.85rem; margin-top: 2px; }
.score { flex: none; font-weight: 700; font-size: 1.1rem; font-variant-numeric: proportional-nums; }
.score.na { color: var(--faint); font-weight: 500; font-size: 0.85rem; }
</style>
