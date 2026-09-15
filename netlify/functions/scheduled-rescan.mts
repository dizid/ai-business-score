// Scheduled weekly re-scans — added 2026-08-26, the top open item from
// docs/improvement-roadmap.md's priority list and the strategic-pathways
// review that picked it: without this, nothing about the Pro tier
// produces value between manual clicks, so a rational buyer could just
// purchase one-off scans instead of subscribing. The first scheduled/cron
// Netlify Function in this repo — every other background job so far is
// triggered by a live user action (scan.mts -> run-scan-background.mts).
//
// Runs once daily (not weekly) and checks each company's own last-scan
// date, rather than a single shared weekly tick — companies opt in on
// different days, and a shared weekly cron would misalign everyone's
// cadence onto whichever one day it fires. Reuses scan.mts's own
// insert-pending-row-then-fetch-/run-scan-background trigger pattern;
// run-scan-background.mts has no auth gate and does its own atomic
// pending->running claim, so it's already safe to invoke from a
// non-request context like this one.
import type { Config } from '@netlify/functions';
import { sql } from './_shared/db.mts';
import { PRO_PLAN_MONTHLY_SCAN_LIMIT } from './_shared/plan.mts';

declare const Netlify: { env: { get(key: string): string | undefined } };

// Stuck-scan reap, folded in here 2026-09-15 (was its own standalone cron,
// reap-stuck-scans.mts, every 15-then-30 minutes). Why it exists at all:
// run-scan-background.mts's atomic pending->running claim always reaches an
// UPDATE ... SET status='completed'|'failed' on every normal exit path, but
// nothing catches the abnormal ones (the Background Function process itself
// getting killed — platform ceiling, OOM, a cold-start crash, or an
// uncaught error outside that try block). When that happens, a scan row is
// left at status='running' (or 'pending', if the trigger fetch was dropped
// before scan.mts's own catch block could run) forever — and the `due`
// query directly below explicitly excludes any company with a
// pending/running scan, so one permanently-stuck scan would silently and
// permanently disable that company's weekly Pro auto-rescan with no error,
// no email, no way to notice short of manually querying `scans`.
//
// Moved here (rather than kept as its own cron) after root-causing a real
// Neon cost spike Marc flagged (147.1 compute hours / $15.64 for two weeks)
// down to that standalone cron's wake-up frequency keeping the Neon
// compute endpoint from ever fully auto-suspending, while a DB check showed
// **zero scans had ever actually been reaped** in the ~10 days that cron
// ran — the failure mode this protects against is real but has not
// happened yet in this app's history. Rather than delete the safety net
// outright, it now rides for free on this function's own once-daily
// schedule instead of paying for a dedicated 15/30-minute one. The only
// give-up: a genuinely stuck scan now shows as "running" in the live-
// polling UI for up to ~24h (until the next daily run) instead of ~20-50
// min — an acceptable trade given it's never fired once, and this is a
// silent-breakage safety net, not a user-facing SLA.
const STUCK_THRESHOLD_MINUTES = 20;

export default async () => {
  const db = sql();

  await db`
    UPDATE public.scans
    SET status = 'failed',
        error_message = 'Scan did not finish in time (the background process likely crashed or was interrupted) — automatically marked as failed.'
    WHERE status = 'running' AND started_at < now() - (${STUCK_THRESHOLD_MINUTES} * interval '1 minute')
  `;
  await db`
    UPDATE public.scans
    SET status = 'failed',
        error_message = 'Scan was never picked up for processing — automatically marked as failed.'
    WHERE status = 'pending' AND created_at < now() - (${STUCK_THRESHOLD_MINUTES} * interval '1 minute')
  `;

  // Due: scan_frequency='weekly', owner is currently Pro (a downgraded
  // owner's companies just stop matching here — no separate reset needed),
  // no scan currently in flight for this company, and no completed scan in
  // the last 7 days. A company that's never completed a scan (or only has
  // failed ones — generated_at is only ever set on completion, never on
  // failure) is due every day until one succeeds.
  const due = await db`
    SELECT c.id, c.brand, c.website, c.category, c.owner_user_id
    FROM public.companies c
    JOIN public.user_profiles up ON up.user_id = c.owner_user_id
    WHERE c.scan_frequency = 'weekly'
      AND up.plan_tier = 'pro'
      AND NOT EXISTS (
        SELECT 1 FROM public.scans s
        WHERE s.company_id = c.id
          AND (s.status IN ('pending', 'running') OR s.generated_at >= now() - interval '7 days')
      )
  `;

  if (due.length === 0) {
    console.log('scheduled-rescan: no companies due');
    return;
  }

  // No incoming Request to derive an origin from the way scan.mts does
  // (new URL(req.url).origin) — Netlify's injected primary site URL is the
  // equivalent for a non-request context. Needs live verification post-
  // deploy that this resolves to https://foreground.info.
  const origin = Netlify.env.get('URL');
  if (!origin) {
    console.error('scheduled-rescan: URL env var not set, cannot trigger scans');
    return;
  }

  let triggered = 0;
  let skippedOverLimit = 0;

  for (const company of due) {
    // Same monthly fair-use cap scan.mts enforces for a manual scan (see
    // its own comment and plan.mts's PRO_PLAN_MONTHLY_SCAN_LIMIT) — reused
    // here so auto-scans can't bypass the margin guardrail that cap was
    // specifically added for when model count grew per-scan cost. Silent
    // skip for v1, no "you hit your limit" notification — deliberately out
    // of scope, see the implementation plan.
    const [{ count }] = await db`
      SELECT count(*)::int AS count FROM public.scans s
      JOIN public.companies c ON c.id = s.company_id
      WHERE c.owner_user_id = ${company.owner_user_id} AND s.created_at >= date_trunc('month', now())
    `;
    if (count >= PRO_PLAN_MONTHLY_SCAN_LIMIT) {
      skippedOverLimit++;
      continue;
    }

    const inserted = await db`
      INSERT INTO public.scans (id, company_id, status, brand, website, category, trigger_source)
      VALUES (gen_random_uuid(), ${company.id}, 'pending', ${company.brand}, ${company.website}, ${company.category}, 'scheduled')
      RETURNING id
    `;
    const scanId = inserted[0].id as string;

    try {
      await fetch(`${origin}/run-scan-background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId }),
      });
      triggered++;
    } catch (err) {
      console.error(`scheduled-rescan: failed to trigger background scan for ${scanId}:`, err);
      await db`
        UPDATE public.scans SET status = 'failed', error_message = 'Failed to start scheduled scan'
        WHERE id = ${scanId}
      `;
    }
  }

  console.log(
    `scheduled-rescan: ${due.length} due, ${triggered} triggered, ${skippedOverLimit} skipped (over monthly limit)`
  );
};

// Daily at 06:00 UTC. No `path` — mutually exclusive with `schedule` in
// @netlify/functions' Config type; this function is never reachable via
// HTTP, only Netlify's own scheduler (or a manual `netlify functions:invoke`
// for testing).
export const config: Config = {
  schedule: '0 6 * * *',
};
