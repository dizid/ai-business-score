// Ops failure-rate digest — added for docs/improvement-roadmap.md's
// long-standing reliability gap: "the only reason the xai/grok-4.6 timeout
// pattern got noticed was a user screenshotting a single scan's failure
// detail... no aggregate view of scans.failures across users/time." This
// repo's own history is a sequence of live-incident-then-hotfix cycles
// (429s, cascading timeouts) — the goal here is catching the next one in
// hours via an alert, not via a support ping.
//
// Deliberately a scheduled email digest, not a new admin dashboard route —
// this app has no admin/role system today, and building real cross-user
// access control was a bigger, separate decision than "add reliability
// visibility." Second scheduled/cron function in this repo, same shape as
// scheduled-rescan.mts.
import type { Config } from '@netlify/functions';
import { sql } from './_shared/db.mts';
import { sendOpsFailureDigestEmail } from './_shared/email.mts';

declare const Netlify: { env: { get(key: string): string | undefined } };

const WINDOW_HOURS = 24;
// Alert thresholds — a judgment call, not tuned against real incident data
// (this function's own alert has never fired yet). Revisit once it has.
const CALL_FAILURE_RATE_THRESHOLD = 0.15; // 15% of all model calls failed
const FAILED_SCAN_COUNT_THRESHOLD = 3; // 3+ scans failed entirely
const SINGLE_PROVIDER_FAILURE_THRESHOLD = 5; // one provider alone had 5+ failed calls

function providerOf(model: string): string {
  const i = model.indexOf('/');
  return i === -1 ? model : model.slice(0, i);
}

export default async () => {
  const db = sql();

  // WINDOW_HOURS is a hardcoded module constant (not user input), but the
  // driver's tagged template doesn't support parameterizing an INTERVAL
  // unit directly — written as a fixed 24-hour literal, kept in sync with
  // WINDOW_HOURS above by convention rather than interpolation.
  const rows = await db`
    SELECT
      status,
      COALESCE(completed_calls, 0) AS completed_calls,
      COALESCE(failed_calls, 0) AS failed_calls,
      COALESCE(failures, '[]'::jsonb) AS failures
    FROM public.scans
    WHERE created_at >= now() - interval '24 hours'
      AND status IN ('completed', 'failed')
  `;

  if (rows.length === 0) {
    console.log('ops-failure-digest: no resolved scans in the window, nothing to check');
    return;
  }

  const totalScans = rows.length;
  const failedScans = rows.filter((r) => r.status === 'failed').length;
  const totalCalls = rows.reduce((sum, r) => sum + r.completed_calls + r.failed_calls, 0);
  const totalCallFailures = rows.reduce((sum, r) => sum + r.failed_calls, 0);

  const byProvider = new Map<string, number>();
  for (const r of rows) {
    const failures = Array.isArray(r.failures) ? r.failures : [];
    for (const f of failures) {
      if (!f || typeof f.model !== 'string') continue;
      const provider = providerOf(f.model);
      byProvider.set(provider, (byProvider.get(provider) ?? 0) + 1);
    }
  }
  const failuresByProvider = [...byProvider.entries()].map(([provider, count]) => ({ provider, count }));

  const callFailureRate = totalCalls > 0 ? totalCallFailures / totalCalls : 0;
  const worstProviderCount = Math.max(0, ...failuresByProvider.map((p) => p.count));
  const shouldAlert =
    callFailureRate >= CALL_FAILURE_RATE_THRESHOLD ||
    failedScans >= FAILED_SCAN_COUNT_THRESHOLD ||
    worstProviderCount >= SINGLE_PROVIDER_FAILURE_THRESHOLD;

  console.log(
    `ops-failure-digest: ${totalScans} scans (${failedScans} failed), ${totalCalls} calls (${totalCallFailures} failed, ${(callFailureRate * 100).toFixed(1)}%), alert=${shouldAlert}`
  );

  if (!shouldAlert) return;

  const to = Netlify.env.get('OPS_ALERT_EMAIL') || 'dev@dizid.com';
  const result = await sendOpsFailureDigestEmail({
    to,
    windowHours: WINDOW_HOURS,
    totalScans,
    failedScans,
    totalCalls,
    totalCallFailures,
    failuresByProvider,
  });
  if (!result.ok) {
    console.error(`ops-failure-digest: alert email failed: ${result.error}`);
  }
};

// Daily at 07:00 UTC — an hour after scheduled-rescan.mts's 06:00 run, so
// they don't both fire in the same minute. No `path`, same as
// scheduled-rescan.mts — only reachable via Netlify's own scheduler.
export const config: Config = {
  schedule: '0 7 * * *',
};
