<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { signUp } from '../lib/auth';

const router = useRouter();

const name = ref('');
const email = ref('');
const password = ref('');
const submitting = ref(false);
const error = ref('');

async function onSubmit() {
  submitting.value = true;
  error.value = '';
  try {
    await signUp(email.value.trim(), password.value, name.value.trim());
    router.push('/app');
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main>
    <h1>Create your account</h1>
    <form class="card" @submit.prevent="onSubmit">
      <label>Name</label>
      <input type="text" v-model="name" required autocomplete="name" />

      <label>Email</label>
      <input type="email" v-model="email" required autocomplete="email" />

      <label>Password</label>
      <input type="password" v-model="password" required autocomplete="new-password" minlength="8" />

      <button type="submit" :disabled="submitting">{{ submitting ? 'Creating account…' : 'Sign up' }}</button>
      <div class="status error" v-if="error">{{ error }}</div>
    </form>
    <p class="switch">Already have an account? <router-link to="/app/login">Log in</router-link></p>
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
