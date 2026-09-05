<script setup lang="ts">
// Public landing spot for the $19 one-time single-scan purchase (Milestone
// 2 of the 2026-08-24 monetization plan). No auth required — reached via
// ?session_id= (right off the Stripe redirect, before an access_token
// exists yet) or ?token= (the emailed receipt link). Polls
// /single-scan-status the same way CompanyDetailView.vue's pollScan()
// polls /scans/:id, but tolerant of "purchaseStatus: processing" — the
// webhook that creates the row runs asynchronously relative to the
// Checkout redirect, so an immediate first request commonly finds nothing
// yet.
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { isAuthenticated } from '../lib/auth';
import { authFetch } from '../lib/auth';
import { validatePayload } from '../../shared/scanPayload';
import ScanDetail from '../../shared/ScanDetail.vue';

const route = useRoute();
const router = useRouter();

const purchaseStatus = ref<'processing' | 'ready' | 'error'>('processing');
const scanStatus = ref<'pending' | 'running' | 'completed' | 'failed' | ''>('');
const errorMessage = ref('');
const accessToken = ref('');
const companyId = ref('');
const rawScan = ref<Record<string, unknown> | null>(null);
const claiming = ref(false);
const claimed = ref(false);

let pollHandle: ReturnType<typeof setTimeout> | null = null;
let attempts = 0;
// Generous — the webhook can take a few seconds, then a real scan is a
// 5-8 minute wait on top. Polls every 3s; ~15 minutes of headroom total.
const MAX_ATTEMPTS = 300;

const payload = computed(() => (rawScan.value ? validatePayload(rawScan.value) : null));

async function poll() {
  attempts += 1;
  const token = accessToken.value || (route.query.token as string) || '';
  const sessionId = (route.query.session_id as string) || '';
  const qs = token ? `token=${encodeURIComponent(token)}` : `session_id=${encodeURIComponent(sessionId)}`;

  try {
    const res = await fetch(`/single-scan-status?${qs}`);
    const data = await res.json();
    if (!data.ok) {
      purchaseStatus.value = 'error';
      errorMessage.value = data.error || 'Something went wrong loading this scan.';
      return;
    }
    if (data.purchaseStatus === 'processing') {
      if (attempts >= MAX_ATTEMPTS) {
        purchaseStatus.value = 'error';
        errorMessage.value = 'This is taking longer than expected — check back in a minute, or check your email for the receipt link.';
        return;
      }
      pollHandle = setTimeout(poll, 3000);
      return;
    }

    purchaseStatus.value = 'ready';
    // Swap ?session_id= for the real ?token= once known, so a refresh or a
    // bookmark of this page keeps working even after the Checkout session
    // itself is no longer a meaningful lookup key.
    if (data.accessToken && route.query.token !== data.accessToken) {
      accessToken.value = data.accessToken;
      router.replace({ query: { token: data.accessToken } });
    }
    companyId.value = data.companyId;
    claimed.value = !!data.claimed;
    scanStatus.value = data.status;
    errorMessage.value = data.errorMessage || '';
    rawScan.value = data.scan;

    if (data.status === 'completed' || data.status === 'failed') {
      if (isAuthenticated.value && !claimed.value) {
        await autoClaim();
      }
      return; // stop polling — terminal state
    }
    pollHandle = setTimeout(poll, 3000);
  } catch {
    // Transient network blip — keep polling rather than surfacing a raw
    // fetch error for what's usually a brief hiccup.
    if (attempts >= MAX_ATTEMPTS) {
      purchaseStatus.value = 'error';
      errorMessage.value = 'Lost connection while checking your scan — try reloading this page.';
      return;
    }
    pollHandle = setTimeout(poll, 3000);
  }
}

async function autoClaim() {
  if (!accessToken.value || claiming.value) return;
  claiming.value = true;
  try {
    const res = await authFetch('/claim-single-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken.value }),
    });
    const data = await res.json();
    if (data.ok) {
      router.replace(`/app/companies/${data.companyId}`);
    }
  } catch {
    // If auto-claim fails, the visitor still sees their result on this page
    // and can use the manual "create a free account" CTA below instead.
  } finally {
    claiming.value = false;
  }
}

onMounted(poll);
onUnmounted(() => {
  if (pollHandle) clearTimeout(pollHandle);
});
</script>

<template>
  <main>
    <template v-if="purchaseStatus === 'processing'">
      <div class="card">
        <h1>Confirming your purchase…</h1>
        <p class="sub">This usually takes a few seconds.</p>
      </div>
    </template>

    <template v-else-if="purchaseStatus === 'error'">
      <div class="card">
        <h1>Couldn't load this scan</h1>
        <p class="sub">{{ errorMessage }}</p>
      </div>
    </template>

    <template v-else-if="scanStatus === 'pending' || scanStatus === 'running'">
      <div class="card">
        <h1>Running your AI visibility scan…</h1>
        <p class="sub">Five prompts, two AI models — usually a few minutes. This page updates on its own; you can also close it and use the link in your email.</p>
      </div>
    </template>

    <template v-else-if="scanStatus === 'failed'">
      <div class="card">
        <h1>This scan didn't complete</h1>
        <p class="sub">{{ errorMessage || 'Something went wrong running the checks — reply to your receipt email and we\'ll look into it.' }}</p>
      </div>
    </template>

    <template v-else-if="payload">
      <div class="claim-banner" v-if="!isAuthenticated">
        <span>Want to track {{ payload.brand }}'s score over time?</span>
        <router-link class="cta" :to="`/app/signup?claim=${accessToken}`">Create a free account</router-link>
      </div>
      <ScanDetail :payload="payload" />
    </template>
  </main>
</template>

<style scoped>
main { max-width: var(--page-max-wide); margin: 0 auto; padding: var(--space-2xl) var(--space-md) var(--space-xl); }
.card {
  max-width: 480px; margin: 96px auto; text-align: center;
  background: var(--card); border: 1px solid var(--border); border-radius: 12px;
  padding: 36px 32px; box-shadow: var(--shadow);
}
h1 { font-size: 1.35rem; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 10px; }
.sub { color: var(--muted); margin: 0; line-height: 1.55; }
.claim-banner {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px;
  background: var(--card); border: 1px solid var(--accent); border-radius: 10px;
  padding: 14px 18px; margin-bottom: 20px; font-size: 0.92rem;
}
.claim-banner .cta {
  padding: 8px 16px; font-size: 0.88rem; font-weight: 600; white-space: nowrap;
  border-radius: 8px; background: var(--accent); color: var(--accent-ink); text-decoration: none;
}
</style>
