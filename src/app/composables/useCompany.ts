// Fetch-and-hydrate a single company plus its scan history — added
// 2026-09-12 (architecture refactor) to kill the near-identical `load()`
// duplicated between CompanyDetailView.vue and CompetitorBenchmarkView.vue
// (same `authFetch`/`data.ok`/try-catch-finally shape, same
// `GET /companies/:id` response) and to give `plan_tier` gating one shared
// source instead of each view re-deriving `isProUser`/`allowDeepAdvice`
// independently.
//
// Deliberately does NOT own document.title (the two callers format it
// differently — "{brand} — Foreground" vs. "{brand} vs. Competitors —
// Foreground") or view-specific side effects like CompanyDetailView.vue's
// category-benchmark fetch or scan-selection reset — those stay in each
// view's own `onMounted`/`load` wrapper, which calls this composable's
// `load()` first and layers its own effects on top.
import { computed, ref } from 'vue';
import { authFetch } from '../lib/auth';

export interface CompanyRow {
  id: string;
  brand: string;
  website: string;
  category: string;
  use_case: string;
  region: string;
  customer_segment: string;
  competitors: string[];
  is_legacy_import: boolean;
  scan_frequency: 'off' | 'weekly';
}

export interface Profile {
  plan_tier: string;
  subscription_status: string | null;
}

// getCompanyId is a getter (not a plain string) so it always reads the
// current route param at call time — callers already re-invoke `load()`
// themselves via a `watch(() => route.params.id, load)`, so this composable
// doesn't need its own reactivity plumbing on top of that.
export function useCompany(getCompanyId: () => string) {
  const company = ref<CompanyRow | null>(null);
  const profile = ref<Profile>({ plan_tier: 'free', subscription_status: null });
  const scans = ref<Record<string, unknown>[]>([]);
  const loading = ref(true);
  const loadError = ref('');

  async function load() {
    loading.value = true;
    loadError.value = '';
    try {
      const res = await authFetch(`/companies/${getCompanyId()}`);
      const data = await res.json();
      if (!data.ok) {
        loadError.value = data.error || 'Failed to load company.';
        return;
      }
      company.value = data.company;
      profile.value = data.profile || { plan_tier: 'free', subscription_status: null };
      scans.value = data.scans;
    } catch (err) {
      loadError.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  }

  // Weekly auto-scans and deep advice are both Pro-only gates in the
  // consuming views — same underlying check, kept as two named exports
  // since each view references the one matching what it's gating.
  const isProUser = computed(() => profile.value.plan_tier === 'pro');
  const allowDeepAdvice = computed(() => profile.value.plan_tier === 'pro');

  return { company, profile, scans, loading, loadError, isProUser, allowDeepAdvice, load };
}
