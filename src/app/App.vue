<script setup lang="ts">
import { useRouter } from 'vue-router';
import { user, signOut } from './lib/auth';

const router = useRouter();

async function handleSignOut() {
  await signOut();
  router.push({ name: 'login' });
}
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <router-link class="wordmark" to="/app">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="10" cy="10" r="8.5" stroke="currentColor" stroke-width="2"></circle>
          <path d="M10 5.5v5l3.2 1.9" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
        </svg>
        AIVis
      </router-link>
      <div v-if="user" class="user-row">
        <span class="user-email">{{ user.email }}</span>
        <button type="button" class="link" @click="handleSignOut">Sign out</button>
      </div>
    </header>
    <div class="page">
      <router-view />
    </div>

    <footer class="app-footer">
      <nav class="footer-links">
        <a href="/privacy">Privacy Policy</a>
        <a href="/terms">Terms of Service</a>
        <a href="/how-it-works">How this works</a>
        <a href="https://dizid.com" target="_blank" rel="noopener noreferrer">Made by Dizid</a>
      </nav>
      <p class="footer-support">
        Questions or support: <a href="mailto:dev@dizid.com">dev@dizid.com</a>
      </p>
      <p class="footer-note">
        Your data is stored securely and never sold — see our
        <a href="/privacy">Privacy Policy</a> for details.
      </p>
    </footer>
  </div>
</template>

<style scoped>
.shell { min-height: 100vh; display: flex; flex-direction: column; }
.page { flex: 1; }
.topbar {
  position: sticky; top: 0; z-index: 20;
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 24px;
  background: color-mix(in srgb, var(--bg) 82%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border);
}
.wordmark {
  display: flex; align-items: center; gap: 8px;
  font-weight: 700; font-size: 1rem; letter-spacing: -0.005em; color: var(--fg);
  text-decoration: none;
}
.wordmark svg { flex: none; color: var(--accent); }
.user-row { display: flex; align-items: center; gap: 14px; font-size: 0.85rem; color: var(--muted); }
.user-email { max-width: 40vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.user-row button.link {
  background: none; border: none; padding: 2px 0; color: var(--muted);
  text-decoration: underline; text-underline-offset: 2px; cursor: pointer; font-size: 0.85rem;
  transition: color 0.15s ease;
}
.user-row button.link:hover { color: var(--fg); }

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
</style>
