// Neon Auth (Better Auth) client for the authenticated app shell. Neon
// Auth's server lives on a different origin than this site, so sign-up/
// sign-in/session all go cross-origin — Neon Auth is designed for exactly
// this (see the trusted_origins config on the Neon project). The client
// handles cookie-based session state; we separately mint a short-lived JWT
// (POST-free GET .../token with the session cookie, confirmed via curl
// during Milestone 2) to send as a Bearer token to *our own* backend
// functions, since those don't share Neon Auth's cookie.
import { createAuthClient } from 'better-auth/client';
import { computed, ref } from 'vue';

const AUTH_BASE =
  'https://ep-polished-flower-axm1d600.neonauth.c-4.us-east-2.aws.neon.tech/neondb/auth';

const authClient = createAuthClient({ baseURL: AUTH_BASE });

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

const user = ref<AuthUser | null>(null);
const jwt = ref<string | null>(null);
const initializing = ref(true);

const isAuthenticated = computed(() => !!user.value && !!jwt.value);

async function mintJwt(): Promise<string | null> {
  try {
    const res = await fetch(`${AUTH_BASE}/token`, { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.token === 'string' ? data.token : null;
  } catch {
    return null;
  }
}

let restored = false;

async function restoreSession() {
  if (restored) return;
  restored = true;
  initializing.value = true;
  try {
    const { data } = await authClient.getSession();
    if (data?.user) {
      user.value = { id: data.user.id, email: data.user.email, name: data.user.name };
      jwt.value = await mintJwt();
    }
  } catch {
    // A failed session check (network blip, Neon Auth briefly unreachable)
    // must not be fatal — router.beforeEach awaits this directly, so an
    // uncaught rejection here used to abort the whole navigation and leave
    // the app rendering blank. Falling through leaves user/jwt unset, i.e.
    // "not logged in," which is the correct safe default and lets
    // requiresAuth routes redirect to login normally instead of white-screening.
  } finally {
    initializing.value = false;
  }
}

async function signUp(email: string, password: string, name: string) {
  const { data, error } = await authClient.signUp.email({ email, password, name });
  if (error) throw new Error(error.message || 'Sign up failed');
  user.value = data?.user
    ? { id: data.user.id, email: data.user.email, name: data.user.name }
    : null;
  jwt.value = await mintJwt();
}

async function signIn(email: string, password: string) {
  const { data, error } = await authClient.signIn.email({ email, password });
  if (error) throw new Error(error.message || 'Sign in failed');
  user.value = data?.user
    ? { id: data.user.id, email: data.user.email, name: data.user.name }
    : null;
  jwt.value = await mintJwt();
}

async function signOut() {
  await authClient.signOut();
  user.value = null;
  jwt.value = null;
}

// Password reset, added 2026-09-02 — better-auth's email/password plugin
// ships these two endpoints by default; nothing extra to enable server-side
// beyond the email provider Neon Auth already has configured (confirmed via
// Neon MCP's get_neon_auth_config before building this: a shared
// "auth@mail.myneon.app" sender is live). `requestPasswordReset` emails a
// link that round-trips through Neon Auth's own domain first
// (`/reset-password/:token?callbackURL=...`) before redirecting the
// browser back to `redirectTo` with the real token appended as a `?token=`
// query param — ResetPasswordView.vue reads that, it's not something this
// function receives directly.
async function requestPasswordReset(email: string) {
  const { error } = await authClient.requestPasswordReset({
    email,
    redirectTo: `${window.location.origin}/app/reset-password`,
  });
  if (error) throw new Error(error.message || 'Failed to send reset email');
}

async function resetPassword(newPassword: string, token: string) {
  const { error } = await authClient.resetPassword({ newPassword, token });
  if (error) throw new Error(error.message || 'Failed to reset password');
}

function authHeaders(): Record<string, string> {
  return jwt.value ? { Authorization: `Bearer ${jwt.value}` } : {};
}

// The minted JWT is short-lived (15 min) and otherwise only ever set once,
// at login/session-restore — nothing re-mints it as the session goes on. A
// user who leaves a tab open past that window gets a 401 on their next
// action with no recovery. Wrap fetch to re-mint and retry once on 401
// instead of pushing that logic into every call site.
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const withAuth = (): RequestInit => ({
    ...options,
    headers: { ...(options.headers as Record<string, string> | undefined), ...authHeaders() },
  });

  const res = await fetch(url, withAuth());
  if (res.status !== 401) return res;

  jwt.value = await mintJwt();
  if (!jwt.value) return res;
  return fetch(url, withAuth());
}

export {
  user,
  jwt,
  initializing,
  isAuthenticated,
  restoreSession,
  signUp,
  signIn,
  signOut,
  requestPasswordReset,
  resetPassword,
  authHeaders,
  authFetch,
};
