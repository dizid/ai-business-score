<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { resetPassword } from '../lib/auth';
import Icon from '../../shared/Icon.vue';

const route = useRoute();
// Set by Neon Auth's own redirect after the emailed link round-trips
// through its /reset-password/:token callback — see auth.ts's
// requestPasswordReset comment for the full flow. Missing/blank means this
// page was opened directly rather than via a real reset email.
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''));

const newPassword = ref('');
const confirmPassword = ref('');
const submitting = ref(false);
const error = ref('');
const done = ref(false);

async function onSubmit() {
  error.value = '';
  if (newPassword.value !== confirmPassword.value) {
    error.value = "Passwords don't match.";
    return;
  }
  submitting.value = true;
  try {
    await resetPassword(newPassword.value, token.value);
    done.value = true;
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
    <h1>Set a new password</h1>

    <div class="card" v-if="!token">
      <p class="status error">
        This reset link is invalid or has expired.
        <router-link to="/app/forgot-password">Request a new one</router-link>.
      </p>
    </div>

    <div class="card" v-else-if="done">
      <p class="status success">Password updated — you can log in with it now.</p>
      <router-link class="switch-btn" to="/app/login">Log in</router-link>
    </div>

    <form class="card" v-else @submit.prevent="onSubmit">
      <label>New password</label>
      <input type="password" v-model="newPassword" required autocomplete="new-password" minlength="8" autofocus />

      <label>Confirm new password</label>
      <input type="password" v-model="confirmPassword" required autocomplete="new-password" minlength="8" />

      <button type="submit" :disabled="submitting">{{ submitting ? 'Updating…' : 'Update password' }}</button>
      <div class="status error" v-if="error">{{ error }}</div>
    </form>
    <p class="switch" v-if="!done"><router-link to="/app/login">Back to log in</router-link></p>
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
.switch-btn {
  display: block; margin-top: 20px; width: 100%; box-sizing: border-box; text-align: center;
  padding: 12px 16px; font-size: 1rem; font-weight: 600; text-decoration: none;
  border-radius: 8px; background: var(--accent); color: var(--accent-ink);
  box-shadow: var(--shadow); transition: transform 0.15s ease;
}
.switch-btn:hover { transform: translateY(-1px); }
.status.error {
  margin-top: 16px; padding: 10px 12px; border-radius: 8px; font-size: 0.88rem; color: var(--critical);
  background: color-mix(in srgb, var(--critical) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--critical) 28%, transparent);
}
.status.error a { color: inherit; font-weight: 600; }
.status.success {
  margin: 0; padding: 10px 12px; border-radius: 8px; font-size: 0.9rem; color: var(--good);
  background: color-mix(in srgb, var(--good) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--good) 28%, transparent);
}
.switch { text-align: center; margin-top: 24px; font-size: 0.9rem; color: var(--muted); }
.switch a { font-weight: 600; }
</style>
