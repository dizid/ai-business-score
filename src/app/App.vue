<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { user, signOut } from './lib/auth';
import Icon from '../shared/Icon.vue';
import AccountMenu from './components/AccountMenu.vue';
import ConsentBanner from './components/ConsentBanner.vue';

const router = useRouter();
const consentBanner = ref<InstanceType<typeof ConsentBanner> | null>(null);

async function handleSignOut() {
  await signOut();
  router.push({ name: 'login' });
}
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <router-link class="wordmark" to="/app">
        <Icon name="logo" />
        Foreground
      </router-link>
      <AccountMenu v-if="user" :email="user.email" @sign-out="handleSignOut" />
    </header>
    <div class="page">
      <router-view />
    </div>

    <footer class="app-footer">
      <nav class="footer-links">
        <a href="/privacy">Privacy Policy</a>
        <a href="/terms">Terms of Service</a>
        <a href="/how-it-works">How this works</a>
        <a href="/blog/">Blog</a>
        <a href="https://dizid.com" target="_blank" rel="noopener noreferrer">Made by Dizid</a>
      </nav>
      <p class="footer-support">
        Questions or support: <a href="mailto:dev@dizid.com">dev@dizid.com</a>
      </p>
      <p class="footer-note">
        Your data is stored securely and never sold — see our
        <a href="/privacy">Privacy Policy</a> for details.
        <button type="button" class="cookie-settings-link" @click="consentBanner?.open()">
          Cookie settings
        </button>
      </p>
    </footer>

    <ConsentBanner ref="consentBanner" />
  </div>
</template>

<style scoped>
.shell { min-height: 100vh; display: flex; flex-direction: column; }
.page { flex: 1; }
.topbar {
  position: sticky; top: 0; z-index: 20;
  display: flex; justify-content: space-between; align-items: center;
  padding: var(--space-md) var(--space-lg);
  background: color-mix(in srgb, var(--bg) 82%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border);
}
.wordmark {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--font-display);
  font-weight: 700; font-size: 1.05rem; letter-spacing: -0.005em; color: var(--fg);
  text-decoration: none;
}
.wordmark :deep(.icon) { color: var(--accent); }

.app-footer {
  border-top: 1px solid var(--border);
  margin-top: 40px;
  padding: 28px 24px 36px;
  text-align: center;
  font-size: 0.82rem;
  color: var(--faint);
}
.footer-links {
  display: flex; flex-wrap: wrap; justify-content: center;
  gap: 8px 20px; margin-bottom: 14px;
}
.footer-links a { color: var(--muted); text-decoration: none; transition: color 0.15s ease; }
.footer-links a:hover { color: var(--fg); text-decoration: underline; text-underline-offset: 2px; }
.footer-support { margin: 0 0 6px; }
.footer-support a { color: var(--muted); }
.footer-note { margin: 0; max-width: 480px; margin-inline: auto; }
.footer-note a { color: var(--muted); }
.cookie-settings-link {
  border: none; background: none; padding: 0; margin-left: 4px;
  font: inherit; font-size: inherit; color: var(--muted); cursor: pointer;
  text-decoration: underline; text-underline-offset: 2px;
}
.cookie-settings-link:hover { color: var(--fg); }

/* Printing a page (currently only ScanReportView.vue's "Print / Save as
   PDF" button) should never include this shell's own topbar/footer chrome
   — a component's own scoped styles can't reach this parent markup, so
   this lives here instead. Harmless no-op for every other page today
   (nothing else calls window.print()). */
@media print {
  .topbar, .app-footer { display: none !important; }
}
</style>
