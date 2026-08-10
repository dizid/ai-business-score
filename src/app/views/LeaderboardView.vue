<script setup lang="ts">
// Public route — no auth guard in router.ts, so this uses plain fetch(),
// never authFetch()/authHeaders(). Only opted-in companies (is_public=true,
// set via CompaniesListView's create form or CompanyDetailView's toggle)
// ever appear here — see leaderboard.mts for the ownership/consent logic.
// Deliberately styled with the same tokens as the rest of the app shell
// (not the "Top Banana" marketing palette) — this is product UI a real
// user reads, the jungle brand stays marketing/social-only per brand/BRAND.md.
import { onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { scoreBand } from '../../../shared/aivis-core.mjs';

interface Combo {
  category: string;
  region: string;
  count: number;
}

interface Entry {
  rank: number;
  id: string;
  brand: string;
  website: string;
  category: string;
  region: string;
  score: number;
  band: string;
}

const route = useRoute();
const router = useRouter();

const combos = ref<Combo[]>([]);
const entries = ref<Entry[]>([]);
const loading = ref(true);
const loadError = ref('');
const form = reactive({ category: '', region: '' });

const BAND_COLOR: Record<string, string> = {
  leading: 'var(--good)',
  visible: 'var(--warning)',
  weak: 'var(--serious)',
  invisible: 'var(--critical)',
  unavailable: 'var(--faint)',
};

function scoreColor(score: number) {
  return BAND_COLOR[scoreBand(score)] ?? 'var(--faint)';
}

async function load() {
  loading.value = true;
  loadError.value = '';
  const category = typeof route.query.category === 'string' ? route.query.category : '';
  const region = typeof route.query.region === 'string' ? route.query.region : '';
  form.category = category;
  form.region = region;

  try {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (region) params.set('region', region);
    const res = await fetch(`/leaderboard${params.toString() ? `?${params}` : ''}`);
    const data = await res.json();
    if (!data.ok) {
      loadError.value = data.error || 'Failed to load leaderboard.';
      return;
    }
    if (category && region) {
      entries.value = data.leaderboard;
      combos.value = [];
    } else {
      combos.value = data.combos;
      entries.value = [];
    }
  } catch (err) {
    loadError.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}

function browse(combo: Combo) {
  router.push({ name: 'leaderboard', query: { category: combo.category, region: combo.region } });
}

function onSubmit() {
  if (!form.category.trim() || !form.region.trim()) return;
  router.push({ name: 'leaderboard', query: { category: form.category.trim(), region: form.region.trim() } });
}

onMounted(load);
watch(() => route.query, load);
</script>

<template>
  <main>
    <router-link class="back-link" to="/app">&larr; Back to AIVis</router-link>
    <h1>Public leaderboard</h1>
    <p class="sub">See who's ranked highest for AI search visibility in a category and region — only businesses that opted in appear here.</p>

    <form class="picker" @submit.prevent="onSubmit">
      <input type="text" v-model="form.category" placeholder="Category (e.g. emergency plumber)" />
      <input type="text" v-model="form.region" placeholder="Region (e.g. Rotterdam)" />
      <button type="submit">See ranking</button>
    </form>

    <p class="status error" v-if="loadError">{{ loadError }}</p>
    <p class="empty" v-else-if="loading">Loading…</p>

    <template v-else-if="entries.length || (route.query.category && route.query.region)">
      <h2>{{ route.query.category }} · {{ route.query.region }}</h2>
      <p class="empty" v-if="entries.length === 0">No opted-in businesses with a score yet for this category and region.</p>
      <div class="list" v-else>
        <div class="entry" v-for="e in entries" :key="e.id">
          <span class="rank">#{{ e.rank }}</span>
          <div class="brand-col">
            <div class="brand">{{ e.brand }}</div>
            <div class="meta">{{ e.website }}</div>
          </div>
          <span class="score" :style="{ color: scoreColor(e.score) }">{{ e.score }}</span>
        </div>
      </div>
    </template>

    <template v-else>
      <h2>Browse</h2>
      <p class="empty" v-if="combos.length === 0">No public leaderboards yet — be the first to opt a company in.</p>
      <div class="combo-list" v-else>
        <button type="button" class="combo" v-for="c in combos" :key="`${c.category}|${c.region}`" @click="browse(c)">
          {{ c.category }} in {{ c.region }} <span class="count">({{ c.count }})</span>
        </button>
      </div>
    </template>
  </main>
</template>

<style scoped>
main { max-width: 700px; margin: 0 auto; padding: 48px 20px 80px; }
.back-link { font-size: 0.85rem; color: var(--muted); text-decoration: underline; }
h1 { font-size: 1.5rem; margin: 12px 0 4px; }
h2 { font-size: 1.1rem; margin: 32px 0 12px; }
p.sub { color: var(--muted); margin: 0; }

.picker { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
.picker input {
  flex: 1 1 200px; padding: 10px 12px; font-size: 0.95rem;
  border: 1px solid var(--border); border-radius: 8px; background: transparent; color: var(--fg);
}
.picker button {
  flex: none; padding: 10px 16px; font-size: 0.9rem; font-weight: 600;
  border: none; border-radius: 8px; background: var(--accent); color: #fff; cursor: pointer;
}

.status.error { margin-top: 16px; font-size: 0.9rem; color: var(--critical); }
.empty { color: var(--muted); font-size: 0.9rem; }

.list { display: flex; flex-direction: column; gap: 10px; }
.entry {
  display: flex; align-items: center; gap: 14px;
  background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px;
}
.rank { flex: none; width: 34px; font-weight: 700; color: var(--muted); }
.brand-col { flex: 1; min-width: 0; }
.brand { font-weight: 600; }
.meta { color: var(--muted); font-size: 0.85rem; overflow-wrap: anywhere; }
.score { flex: none; font-weight: 700; font-size: 1.2rem; font-variant-numeric: proportional-nums; }

.combo-list { display: flex; flex-direction: column; gap: 8px; }
.combo {
  text-align: left; padding: 12px 16px; font-size: 0.95rem;
  border: 1px solid var(--border); border-radius: 10px; background: var(--card); color: var(--fg); cursor: pointer;
}
.combo:hover { border-color: var(--accent); }
.combo .count { color: var(--muted); }
</style>
