<script setup lang="ts">
// Full score-regression alert history across the caller's whole portfolio —
// the "See all alerts" destination CompaniesListView.vue's dashboard widget
// links out to. That widget only ever shows the last 30 days' worth,
// latest-scan-only, capped at 10, dismissed alerts excluded (see its own
// comment); this page is the complete, undismissed-and-dismissed record,
// via GET /alerts (alerts.mts).
import { computed, onMounted, ref } from 'vue';
import { authFetch } from '../lib/auth';
import { formatDate } from '../lib/format';
import Breadcrumb from '../components/Breadcrumb.vue';

interface AlertRow {
  id: string;
  company_id: string;
  brand: string;
  prior_score: number;
  new_score: number;
  delta: number;
  created_at: string;
  dismissed_at: string | null;
}

const alerts = ref<AlertRow[]>([]);
const loading = ref(true);
const loadError = ref('');
const dismissingAlertId = ref<string | null>(null);

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await authFetch('/alerts');
    const data = await res.json();
    if (!data.ok) {
      loadError.value = data.error || 'Failed to load alert history.';
      return;
    }
    alerts.value = data.alerts;
  } catch (err) {
    loadError.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function dismissAlert(alertId: string) {
  dismissingAlertId.value = alertId;
  try {
    const res = await authFetch(`/alerts/${alertId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dismissed: true }),
    });
    const data = await res.json();
    if (data.ok) {
      const row = alerts.value.find((a) => a.id === alertId);
      if (row) row.dismissed_at = data.alert.dismissed_at;
    }
  } finally {
    dismissingAlertId.value = null;
  }
}

const activeCount = computed(() => alerts.value.filter((a) => !a.dismissed_at).length);
</script>

<template>
  <main>
    <Breadcrumb :crumbs="[{ label: 'Companies', to: '/app' }, { label: 'Alert history' }]" />
    <h1>Alert history</h1>
    <p class="sub">Every score-regression alert across your portfolio — the dashboard widget only shows the 10 most recent, undismissed ones from the last 30 days; this is the full record.</p>

    <p class="status error" v-if="loadError">{{ loadError }}</p>
    <p class="status" v-else-if="loading">Loading…</p>
    <p class="empty" v-else-if="alerts.length === 0">No alerts yet — you'll see a regression alert here if a tracked company's score drops significantly between scans.</p>

    <template v-else>
      <p class="active-count">{{ activeCount }} active, {{ alerts.length - activeCount }} dismissed.</p>
      <div class="alert-list">
        <div class="alert-row" v-for="alert in alerts" :key="alert.id" :class="{ dismissed: alert.dismissed_at }">
          <router-link class="alert-link" :to="`/app/companies/${alert.company_id}`">
            <strong>{{ alert.brand }}</strong> dropped {{ Math.abs(alert.delta) }} points
            ({{ alert.prior_score }} → {{ alert.new_score }}) · {{ formatDate(alert.created_at) }}
          </router-link>
          <span v-if="alert.dismissed_at" class="dismissed-tag">Dismissed</span>
          <button
            v-else
            type="button"
            class="alert-dismiss"
            :disabled="dismissingAlertId === alert.id"
            @click="dismissAlert(alert.id)"
          >{{ dismissingAlertId === alert.id ? 'Dismissing…' : 'Dismiss' }}</button>
        </div>
      </div>
    </template>
  </main>
</template>

<style scoped>
main { max-width: var(--page-max-wide); margin: 0 auto; padding: var(--space-2xl) var(--space-md) var(--space-xl); }
h1 { font-family: var(--font-display); font-size: var(--text-xl); font-weight: 700; margin: 0 0 4px; }
p.sub { color: var(--muted); margin: 0 0 20px; }
.status { color: var(--muted); font-size: 0.9rem; }
.status.error { color: var(--critical); }
.empty { color: var(--muted); font-size: 0.9rem; }
.active-count { color: var(--muted); font-size: 0.85rem; margin: 0 0 12px; }

.alert-list {
  background: var(--card); border: 1px solid var(--border); border-radius: 12px;
  padding: 8px 18px; box-shadow: var(--shadow);
}
.alert-row {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 10px 0; border-bottom: 1px solid var(--border);
}
.alert-row:last-child { border-bottom: none; }
.alert-row.dismissed { opacity: 0.55; }
.alert-link { font-size: 0.9rem; color: var(--fg); text-decoration: none; min-width: 0; }
.alert-link:hover { color: var(--critical); }
.dismissed-tag { flex: none; font-size: 0.76rem; color: var(--faint); font-style: italic; }
.alert-dismiss {
  flex: none; padding: 4px 10px; font-size: 0.76rem; font-weight: 600;
  border: 1px solid var(--border); border-radius: 999px;
  background: transparent; color: var(--muted); cursor: pointer;
}
.alert-dismiss:hover:not(:disabled) { border-color: var(--critical); color: var(--critical); }
.alert-dismiss:disabled { opacity: 0.6; cursor: wait; }
</style>
