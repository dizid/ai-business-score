<script setup lang="ts">
// Lands here after a successful Stripe Checkout redirect. The webhook that
// actually flips user_profiles.plan_tier to 'pro' fires asynchronously
// relative to this redirect, so poll /companies until it shows up — same
// recursive-setTimeout pattern CompanyDetailView.vue's pollScan() uses.
import { onMounted, onUnmounted, ref } from 'vue';
import { authFetch } from '../lib/auth';

const status = ref<'checking' | 'active' | 'timeout'>('checking');
let pollHandle: ReturnType<typeof setTimeout> | null = null;
const MAX_ATTEMPTS = 15; // ~30s at 2s intervals
let attempts = 0;

async function poll() {
  attempts += 1;
  try {
    const res = await authFetch('/companies');
    const data = await res.json();
    if (data.ok && data.profile?.plan_tier === 'pro') {
      status.value = 'active';
      return;
    }
  } catch {
    // keep polling — a transient failure here shouldn't stop the check
  }
  if (attempts >= MAX_ATTEMPTS) {
    status.value = 'timeout';
    return;
  }
  pollHandle = setTimeout(poll, 2000);
}

onMounted(poll);
onUnmounted(() => {
  if (pollHandle) clearTimeout(pollHandle);
});
</script>

<template>
  <main>
    <div class="card">
      <template v-if="status === 'checking'">
        <h1>Activating your Pro plan…</h1>
        <p class="sub">This usually takes a few seconds.</p>
      </template>
      <template v-else-if="status === 'active'">
        <h1>You're on Pro 🎉</h1>
        <p class="sub">Unlimited companies and scans are unlocked.</p>
        <router-link class="cta" to="/app">Go to your companies</router-link>
      </template>
      <template v-else>
        <h1>Still activating</h1>
        <p class="sub">
          Payment went through, but the upgrade is taking longer than usual to show up.
          It'll apply automatically — check back in a minute.
        </p>
        <router-link class="cta" to="/app">Back to your companies</router-link>
      </template>
    </div>
  </main>
</template>

<style scoped>
main { max-width: 480px; margin: 0 auto; padding: 80px 20px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 32px; text-align: center; }
h1 { font-size: 1.3rem; margin: 0 0 8px; }
.sub { color: var(--muted); margin: 0 0 20px; }
.cta {
  display: inline-block; padding: 10px 20px; font-size: 0.9rem; font-weight: 600;
  border-radius: 8px; background: var(--accent); color: var(--accent-ink); text-decoration: none;
}
</style>
