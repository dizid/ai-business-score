// Stuck-scan reaper — added 2026-09-05 after a validity audit of scan
// results found this gap: run-scan-background.mts's atomic pending->running
// claim (and its own try/catch around the main loop) always reaches an
// UPDATE ... SET status = 'completed'|'failed' on every normal exit path,
// but nothing catches the abnormal ones — the Netlify Background Function
// process itself getting killed (platform ceiling, OOM, a cold-start crash,
// or an uncaught synchronous error outside that try block). When that
// happens, a scan row is left at status='running' (or even 'pending', if
// the trigger fetch was dropped before scan.mts's own catch block could run)
// forever. No code anywhere previously reconciled this — worse,
// scheduled-rescan.mts explicitly EXCLUDES any company with a scan
// WHERE status IN ('pending','running') from ever being auto-rescanned
// again, so one permanently-stuck scan silently and permanently disabled
// that company's weekly Pro auto-rescan feature with no error, no email,
// and no way to notice short of manually querying `scans`.
//
// Third scheduled/cron function in this repo, same shape as
// scheduled-rescan.mts / ops-failure-digest.mts. Runs every 15 minutes
// (not daily like those two) since a stuck scan should be caught and
// reconciled quickly, not up to a day later.
import type { Config } from '@netlify/functions';
import { sql } from './_shared/db.mts';

// SCAN_DEADLINE_MS in run-scan-background.mts is 720000 (12 min), and
// Netlify Background Functions have their own ~15-minute hard ceiling on
// top of that soft budget — 20 minutes gives comfortable margin past both,
// so this never reaps a scan that's merely running long, only one that's
// genuinely dead. Also used for 'pending' rows: a normal claim happens
// within seconds of insert (scan.mts/scheduled-rescan.mts both insert then
// immediately trigger run-scan-background), so a pending row surviving this
// long was never picked up at all.
const STUCK_THRESHOLD_MINUTES = 20;

export default async () => {
  const db = sql();

  // Multiplying a plain numeric parameter by a literal `interval '1 minute'`
  // is a normal, fully-supported Postgres operation — unlike trying to
  // interpolate the interval's own unit string directly, which
  // ops-failure-digest.mts's own comment already found this driver's tagged
  // template doesn't support.
  const stuckRunning = await db`
    UPDATE public.scans
    SET status = 'failed',
        error_message = 'Scan did not finish in time (the background process likely crashed or was interrupted) — automatically marked as failed.'
    WHERE status = 'running' AND started_at < now() - (${STUCK_THRESHOLD_MINUTES} * interval '1 minute')
    RETURNING id, company_id, brand
  `;

  const stuckPending = await db`
    UPDATE public.scans
    SET status = 'failed',
        error_message = 'Scan was never picked up for processing — automatically marked as failed.'
    WHERE status = 'pending' AND created_at < now() - (${STUCK_THRESHOLD_MINUTES} * interval '1 minute')
    RETURNING id, company_id, brand
  `;

  const reaped = stuckRunning.length + stuckPending.length;
  if (reaped === 0) {
    console.log('reap-stuck-scans: nothing to reap');
    return;
  }

  console.log(
    `reap-stuck-scans: reaped ${reaped} stuck scan(s) — ${stuckRunning.length} running, ${stuckPending.length} pending. ` +
    [...stuckRunning, ...stuckPending].map((s) => `${s.id} (${s.brand})`).join(', ')
  );
};

// Every 15 minutes. No `path` — mutually exclusive with `schedule` in
// @netlify/functions' Config type, same as scheduled-rescan.mts/
// ops-failure-digest.mts — only reachable via Netlify's own scheduler.
export const config: Config = {
  schedule: '*/15 * * * *',
};
