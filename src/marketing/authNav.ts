// Swaps the static marketing pages' "Log in" nav link for a "Dashboard"
// link when the visitor already has an active Neon Auth session. Kept as a
// standalone client (rather than importing src/app/lib/auth.ts) so these
// script-light static pages don't pull in Vue's reactivity runtime just to
// check a session — this only ever needs a one-shot read, no reactive state.
import { createAuthClient } from 'better-auth/client';

const AUTH_BASE =
  'https://ep-polished-flower-axm1d600.neonauth.c-4.us-east-2.aws.neon.tech/neondb/auth';

const authClient = createAuthClient({ baseURL: AUTH_BASE });

async function updateNavForSession() {
  try {
    const { data } = await authClient.getSession();
    if (!data?.user) return;
    const link = document.querySelector<HTMLAnchorElement>('[data-auth-link]');
    if (!link) return;
    link.textContent = 'Dashboard';
    link.href = '/app';
  } catch {
    // Not logged in, or the session check itself failed (network blip,
    // Neon Auth briefly unreachable) — leave "Log in" as the safe default.
  }
}

updateNavForSession();
