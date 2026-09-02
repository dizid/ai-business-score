<script setup lang="ts">
import { ref, onMounted } from 'vue';

// Reads/writes the same localStorage-backed decision partials/consent.html
// sets up in app.html's <head> (window.__fgConsent) — that partial also
// exposes window.__fgLoadGA4 (partials/ga4.html), so calling .set('granted')
// here actually loads GA4, not just remembers the choice. The raw-DOM
// banner that same partial renders on the static marketing/blog pages
// deliberately skips itself here (it detects the #app mount point) since
// this component is the in-app equivalent, styled with the app's own calm
// theme tokens instead of the marketing site's gold/glass ones.
declare global {
  interface Window {
    __fgConsent?: { get(): string | null; set(value: 'granted' | 'declined'): void };
  }
}

const visible = ref(false);

onMounted(() => {
  visible.value = window.__fgConsent?.get() == null;
});

function decide(value: 'granted' | 'declined') {
  window.__fgConsent?.set(value);
  visible.value = false;
}

function open() {
  visible.value = true;
}

defineExpose({ open });
</script>

<template>
  <div v-if="visible" class="consent-banner" role="region" aria-label="Cookie consent">
    <p>
      We use one non-essential analytics cookie to see which pages get visited.
      <a href="/privacy#cookies">Learn more</a>
    </p>
    <div class="consent-actions">
      <button type="button" class="btn-decline" @click="decide('declined')">Decline</button>
      <button type="button" class="btn-accept" @click="decide('granted')">Accept</button>
    </div>
  </div>
</template>

<style scoped>
.consent-banner {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  z-index: 50;
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: 10px 20px;
  padding: 14px 20px;
  background: color-mix(in srgb, var(--bg) 92%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-top: 1px solid var(--border);
  color: var(--fg);
  font-size: var(--text-sm);
}
.consent-banner p { margin: 0; max-width: 640px; color: var(--muted); }
.consent-banner a { color: var(--accent); }
.consent-actions { display: flex; gap: 10px; flex-shrink: 0; }
.consent-banner button {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--fg);
  padding: 8px 16px;
  border-radius: var(--radius);
  font-size: var(--text-sm);
  font-family: inherit;
  cursor: pointer;
}
.btn-accept {
  background: var(--accent);
  color: var(--accent-ink);
  border-color: var(--accent);
  font-weight: 600;
}
@media (max-width: 480px) {
  .consent-banner { flex-direction: column; align-items: stretch; text-align: center; }
  .consent-actions { justify-content: center; }
}
</style>
