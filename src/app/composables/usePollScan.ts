// Scan kickoff + status-polling state machine — split out of
// CompanyDetailView.vue (2026-09-12 architecture refactor), the single most
// complex piece of that view's script (~90 lines) and the one governing the
// live progress UI a user watches for minutes during a real scan.
//
// Takes `scans` (from useCompany.ts) and `reload` (the caller's own load()
// wrapper) rather than an abstract single-purpose callback: both the
// completed-scan path and the connection-hiccup recovery path need to
// inspect the freshly-reloaded scans list after reloading, not just get
// notified that a reload happened.
import { onUnmounted, ref, type Ref } from 'vue';
import { authFetch } from '../lib/auth';

// Backoff schedule for a *hard* fetch failure while polling (network blip,
// DNS hiccup, the fetch itself throwing) — not a clean HTTP error response
// from the server, which is handled separately via `!data.ok` and gives up
// immediately since that's a real, informative error. A transient fetch
// failure used to abandon polling permanently on the very first blip,
// surfacing as a raw "TypeError: Failed to fetch" with no recovery.
const POLL_RETRY_BACKOFFS_MS = [2000, 4000, 8000];

// Formats the live { completed, total, currentModels } progress the backend
// writes incrementally during a scan (run-scan-background.mts) into a
// one-line status. Falls back to a generic "Running checks…" line if
// progress hasn't arrived yet (e.g. the very first poll, or a scan
// finalized before the `progress` column existed) rather than showing a
// broken "0/0" line — no minute estimate here since that's tied to
// provider count/concurrency, which has already gone stale once (see
// HOSTED_MODELS in run-scan-background.mts). `currentModels` is an array
// since more than one model can be in flight at once under concurrent
// provider lanes.
function formatRunningStatus(progress: { completed: number; total: number; currentModels: string[] } | null) {
  if (!progress || !progress.total) return 'Running checks…';
  const checking = progress.currentModels?.length ? ` — checking ${progress.currentModels.join(', ')}…` : '';
  return `Running checks: ${progress.completed}/${progress.total} done${checking}`;
}

export function usePollScan(scans: Ref<Record<string, unknown>[]>, reload: () => Promise<void>) {
  const scanning = ref(false);
  const scanStatus = ref('');
  const scanError = ref('');
  const scanUpgradeRequired = ref(false);
  // Tracked outside pollScan's own recursive param so the terminal-error
  // "Check again" button (added for QA-FIXES-PLAN.md #3a) can still know
  // which scan to re-check after polling has already given up.
  const pendingScanId = ref<string | null>(null);
  let pollHandle: ReturnType<typeof setTimeout> | null = null;

  function stopPolling() {
    if (pollHandle) {
      clearTimeout(pollHandle);
      pollHandle = null;
    }
  }

  async function pollScan(scanId: string, retriesLeft = POLL_RETRY_BACKOFFS_MS.length) {
    pendingScanId.value = scanId;
    try {
      const res = await authFetch(`/scans/${scanId}`);
      const data = await res.json();
      if (!data.ok) {
        scanError.value = data.error || 'Failed to check scan status.';
        scanning.value = false;
        return;
      }
      if (data.status === 'completed') {
        scanning.value = false;
        scanStatus.value = '';
        pendingScanId.value = null;
        await reload();
        return;
      }
      if (data.status === 'failed') {
        scanning.value = false;
        pendingScanId.value = null;
        scanError.value = data.errorMessage || 'Scan failed.';
        return;
      }
      scanStatus.value = data.status === 'running' ? formatRunningStatus(data.progress) : 'Queued…';
      pollHandle = setTimeout(() => pollScan(scanId), 2000);
    } catch (err) {
      if (retriesLeft > 0) {
        const backoffMs = POLL_RETRY_BACKOFFS_MS[POLL_RETRY_BACKOFFS_MS.length - retriesLeft];
        scanStatus.value = 'Connection hiccup, retrying…';
        pollHandle = setTimeout(() => pollScan(scanId, retriesLeft - 1), backoffMs);
        return;
      }
      // Retries exhausted — the scan may well have completed or failed
      // server-side despite our connection trouble, so re-sync before
      // giving up. A scan that already resolved (now present in scans.value
      // after reload) just shows normally instead of dead-ending on an
      // error the user can't act on (QA-FIXES-PLAN.md #3a).
      scanning.value = false;
      await reload();
      if (scans.value.some((s) => (s as { id?: string }).id === scanId)) {
        pendingScanId.value = null;
      } else {
        scanError.value = (err as Error).message;
      }
    }
  }

  // "Check again" button for the terminal connection-error state — retries
  // reload() (not a full page reload) rather than leaving the user stuck
  // once polling has given up.
  async function recheckPendingScan() {
    await reload();
    if (!pendingScanId.value) return;
    if (scans.value.some((s) => (s as { id?: string }).id === pendingScanId.value)) {
      pendingScanId.value = null;
      scanError.value = '';
    }
  }

  async function startScan(companyId: string) {
    scanning.value = true;
    scanError.value = '';
    scanUpgradeRequired.value = false;
    scanStatus.value = 'Starting scan…';
    try {
      const res = await authFetch('/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId }),
      });
      const data = await res.json();
      if (!data.ok) {
        scanError.value = data.error || 'Failed to start scan.';
        scanUpgradeRequired.value = !!data.upgradeRequired;
        scanning.value = false;
        return;
      }
      pollScan(data.scanId);
    } catch (err) {
      scanError.value = (err as Error).message;
      scanning.value = false;
    }
  }

  // Consumers can't forget cleanup — this fires on the owning component's
  // unmount automatically, same as the view's own onUnmounted(stopPolling)
  // did before this was extracted.
  onUnmounted(stopPolling);

  return { scanning, scanStatus, scanError, scanUpgradeRequired, pendingScanId, startScan, recheckPendingScan };
}
