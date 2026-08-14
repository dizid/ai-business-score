<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { signIn } from '../lib/auth';

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
main { max-width: 420px; margin: 0 auto; padding: 48px 20px 80px; }
h1 { font-size: 1.5rem; margin-bottom: 24px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 8px 20px 20px; }
label { display: block; font-size: 0.85rem; font-weight: 600; margin-top: 18px; margin-bottom: 6px; }
input {
  width: 100%; padding: 10px 12px; font-size: 1rem;
  border: 1px solid var(--border); border-radius: 8px; background: transparent; color: var(--fg);
}
input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
button {
  margin-top: 28px; width: 100%; padding: 12px 16px; font-size: 1rem; font-weight: 600;
  border: none; border-radius: 8px; background: var(--accent); color: var(--accent-ink); cursor: pointer;
}
button:disabled { opacity: 0.6; cursor: wait; }
.status.error { margin-top: 16px; font-size: 0.9rem; color: var(--critical); }
.switch { text-align: center; margin-top: 20px; font-size: 0.9rem; color: var(--muted); }
</style>
