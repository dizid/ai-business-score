// Stripe Checkout kickoff — split out of CompanyDetailView.vue and
// CompaniesListView.vue (2026-09-12 architecture refactor), which each had
// a byte-for-byte identical startCheckout() (the duplication was even
// called out in a comment as "this codebase's convention" before this
// pass). Takes an error callback rather than owning an error ref itself, so
// each caller keeps routing failures into its own existing error-display
// location (CompanyDetailView.vue's scanError, CompaniesListView.vue's
// upgradeError) instead of this composable dictating a new one.
import { ref } from 'vue';
import { authFetch } from '../lib/auth';

export function useCheckout(onError?: (message: string) => void) {
  const upgrading = ref(false);

  async function startCheckout() {
    upgrading.value = true;
    try {
      const res = await authFetch('/create-checkout-session', { method: 'POST' });
      const data = await res.json();
      if (!data.ok) {
        onError?.(data.error || 'Failed to start checkout.');
        upgrading.value = false;
        return;
      }
      // Success intentionally leaves `upgrading` true — the browser is
      // about to navigate away to Stripe, so there's no "done loading"
      // state to return to on this page.
      window.location.href = data.url;
    } catch (err) {
      onError?.((err as Error).message);
      upgrading.value = false;
    }
  }

  return { upgrading, startCheckout };
}
