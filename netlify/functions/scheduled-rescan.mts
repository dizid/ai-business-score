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

export default async () => {
  const db = sql();

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
  // deploy that this resolves to https://aivis-scan.netlify.app.
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
    const [{ credits }] = await db`
      SELECT COALESCE(SUM(credits), 0)::int AS credits
      FROM public.scan_credit_purchases
      WHERE user_id = ${company.owner_user_id}
        AND purchased_at >= date_trunc('month', now()) - interval '1 month'
    `;
    if (count >= PRO_PLAN_MONTHLY_SCAN_LIMIT + credits) {
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
