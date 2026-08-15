<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { signIn } from '../lib/auth';
import Icon from '../../shared/Icon.vue';

const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const submitting = ref(false);
const error = ref('');

async function onSubmit() {
  submitting.value = true;
  error.value = '';
  try {
    await signIn(email.value.trim(), password.value);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/app';
    router.push(redirect);
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main>
    <div class="brand-mark" aria-hidden="true">
      <Icon name="logo" />
    </div>
    <h1>Log in</h1>
    <form class="card" @submit.prevent="onSubmit">
      <label>Email</label>
      <input type="email" v-model="email" required autocomplete="email" />

      <label>Password</label>
      <input type="password" v-model="password" required autocomplete="current-password" />

      <button type="submit" :disabled="submitting">{{ submitting ? 'Logging in…' : 'Log in' }}</button>
      <div class="status error" v-if="error">{{ error }}</div>
    </form>
    <p class="switch">No account yet? <router-link to="/app/signup">Sign up</router-link></p>
  </main>
</template>

<style scoped>
main { max-width: 420px; margin: 0 auto; padding: var(--space-2xl) var(--space-md) 96px; }
.brand-mark {
  display: flex; justify-content: center; margin-bottom: var(--space-md); color: var(--accent);
}
.brand-mark :deep(.icon) { width: 26px; height: 26px; }
h1 { font-size: var(--text-xl); font-weight: 600; letter-spacing: -0.01em; text-align: center; margin: 0 0 28px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 30px 28px; box-shadow: var(--shadow); }
label { display: block; font-size: 0.83rem; font-weight: 600; color: var(--muted); margin-top: 18px; margin-bottom: 6px; }
label:first-child { margin-top: 0; }
input {
  width: 100%; padding: 11px 13px; font-size: 1rem;
  border: 1px solid var(--border); border-radius: 8px; background: transparent; color: var(--fg);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
input:hover { border-color: color-mix(in srgb, var(--fg) 25%, var(--border)); }
input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent); }
button {
  margin-top: 28px; width: 100%; padding: 12px 16px; font-size: 1rem; font-weight: 600;
  border: none; border-radius: 8px; background: var(--accent); color: var(--accent-ink); cursor: pointer;
  box-shadow: var(--shadow); transition: transform 0.15s ease, opacity 0.15s ease;
}
button:hover:not(:disabled) { transform: translateY(-1px); }
button:disabled { opacity: 0.6; cursor: wait; transform: none; }
.status.error {
  margin-top: 16px; padding: 10px 12px; border-radius: 8px; font-size: 0.88rem; color: var(--critical);
  background: color-mix(in srgb, var(--critical) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--critical) 28%, transparent);
}
.switch { text-align: center; margin-top: 24px; font-size: 0.9rem; color: var(--muted); }
.switch a { font-weight: 600; }
</style>
