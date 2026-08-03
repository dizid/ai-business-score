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
    <router-view />
  </div>
</template>

<style scoped>
.shell { min-height: 100vh; }
.topbar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 20px 24px; border-bottom: 1px solid var(--border);
}
.wordmark {
  display: flex; align-items: center; gap: 8px;
  font-weight: 700; font-size: 0.95rem; letter-spacing: 0.01em; color: var(--muted);
  text-decoration: none;
}
.wordmark svg { flex: none; }
.user-row { display: flex; align-items: center; gap: 12px; font-size: 0.85rem; color: var(--muted); }
.user-row button.link {
  background: none; border: none; padding: 0; color: var(--muted);
  text-decoration: underline; cursor: pointer; font-size: 0.85rem;
}
</style>
