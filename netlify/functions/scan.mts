// AIVis scan trigger — Milestone 5 of the SaaS-pivot plan (see
// /home/marc/.claude/plans/cheerful-leaping-dragon.md). Creates a pending
// scan row and fires a Background Function to do the actual 20-30s of
// work, returning almost immediately — confirmed via the Milestone 0
// spike that a background-function trigger returns in well under 1s on
// this site's plan. Auth + company-ownership scoped; replaces the old
// passphrase-gated, synchronous, Blobs-backed /scan entirely.
import type { Config } from '@netlify/functions';
import { authenticate } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';
import { FREE_PLAN_SCAN_LIMIT, isPro, resolveMonthlyScanLimit } from './_shared/plan.mts';
import { corsHeaders, handleOptions } from './_shared/cors.mts';
import { jsonResponse, errorResponse } from './_shared/http.mts';

export default async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const cors = corsHeaders(req);

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405, {}, cors);
  }

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const userId = auth;

  let body: { company_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, {}, cors);
  }

  const companyId = body.company_id;
  if (!companyId) {
    return errorResponse('company_id is required', 400, {}, cors);
  }

  const db = sql();
  const companies = await db`
    SELECT * FROM public.companies WHERE id = ${companyId} AND owner_user_id = ${userId}
  `;
  if (companies.length === 0) {
    return errorResponse('Company not found', 404, {}, cors);
  }
  const company = companies[0];

  const profiles = await db`SELECT plan_tier, monthly_scan_limit_override FROM public.user_profiles WHERE user_id = ${userId}`;
  if (!isPro(profiles[0]?.plan_tier)) {
    const [{ count }] = await db`
      SELECT count(*)::int AS count FROM public.scans s
      JOIN public.companies c ON c.id = s.company_id
      WHERE c.owner_user_id = ${userId}
    `;
    if (count >= FREE_PLAN_SCAN_LIMIT) {
      return errorResponse(
        `You've used all ${FREE_PLAN_SCAN_LIMIT} free scans on the free plan. Upgrade to Pro for more.`,
        402,
        { upgradeRequired: true, limit: FREE_PLAN_SCAN_LIMIT },
        cors
      );
    }
  } else {
    // Pro fair-use cap — monthly, not lifetime (see PRO_PLAN_MONTHLY_SCAN_LIMIT's
    // comment in _shared/plan.mts). resolveMonthlyScanLimit lets a handful of
    // test accounts run above the standard cap via a hand-set DB override —
    // see that function's own comment.
    const scanLimit = resolveMonthlyScanLimit(profiles[0]?.monthly_scan_limit_override);
    const [{ count }] = await db`
      SELECT count(*)::int AS count FROM public.scans s
      JOIN public.companies c ON c.id = s.company_id
      WHERE c.owner_user_id = ${userId} AND s.created_at >= date_trunc('month', now())
    `;

    if (count >= scanLimit) {
      return errorResponse(
        `Pro plan is limited to ${scanLimit} scans this month (fair use) — resets at the start of next month.`,
        402,
        { limit: scanLimit },
        cors
      );
    }
  }

  const inserted = await db`
    INSERT INTO public.scans (id, company_id, status, brand, website, category)
    VALUES (gen_random_uuid(), ${companyId}, 'pending', ${company.brand}, ${company.website}, ${company.category})
    RETURNING id
  `;
  const scanId = inserted[0].id as string;

  const origin = new URL(req.url).origin;
  try {
    await fetch(`${origin}/run-scan-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scanId }),
    });
  } catch (err) {
    console.error(`Failed to trigger background scan for ${scanId}:`, err);
    await db`
      UPDATE public.scans SET status = 'failed', error_message = 'Failed to start scan'
      WHERE id = ${scanId}
    `;
    return errorResponse('Failed to start scan', 500, {}, cors);
  }

  return jsonResponse({ ok: true, scanId }, { status: 202, cors });
};

export const config: Config = {
  path: '/scan',
};
