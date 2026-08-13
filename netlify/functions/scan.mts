// AIVis scan trigger — Milestone 5 of the SaaS-pivot plan (see
// /home/marc/.claude/plans/cheerful-leaping-dragon.md). Creates a pending
// scan row and fires a Background Function to do the actual 20-30s of
// work, returning almost immediately — confirmed via the Milestone 0
// spike that a background-function trigger returns in well under 1s on
// this site's plan. Auth + company-ownership scoped; replaces the old
// passphrase-gated, synchronous, Blobs-backed /scan entirely.
import type { Config } from '@netlify/functions';
import { requireAuth, authErrorResponse, AuthError } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';
import { FREE_PLAN_SCAN_LIMIT, PRO_PLAN_MONTHLY_SCAN_LIMIT, isPro } from './_shared/plan.mts';
import { corsHeaders, handleOptions } from './_shared/cors.mts';

export default async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  let userId: string;
  try {
    userId = await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }

  let body: { company_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  const companyId = body.company_id;
  if (!companyId) {
    return new Response(JSON.stringify({ error: 'company_id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  const db = sql();
  const companies = await db`
    SELECT * FROM public.companies WHERE id = ${companyId} AND owner_user_id = ${userId}
  `;
  if (companies.length === 0) {
    return new Response(JSON.stringify({ error: 'Company not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }
  const company = companies[0];

  const profiles = await db`SELECT plan_tier FROM public.user_profiles WHERE user_id = ${userId}`;
  if (!isPro(profiles[0]?.plan_tier)) {
    const [{ count }] = await db`
      SELECT count(*)::int AS count FROM public.scans s
      JOIN public.companies c ON c.id = s.company_id
      WHERE c.owner_user_id = ${userId}
    `;
    if (count >= FREE_PLAN_SCAN_LIMIT) {
      return new Response(
        JSON.stringify({
          error: `Free plan is limited to ${FREE_PLAN_SCAN_LIMIT} scans total. Upgrade to Pro for unlimited scans.`,
          upgradeRequired: true,
          limit: FREE_PLAN_SCAN_LIMIT,
        }),
        { status: 402, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } },
      );
    }
  } else {
    // Pro fair-use cap — monthly, not lifetime (see PRO_PLAN_MONTHLY_SCAN_LIMIT's
    // comment in _shared/plan.mts). No upgradeRequired here — Pro is already
    // the top tier, there's nothing to upsell, so the frontend's generic
    // scanError display just shows a plain message without rendering an
    // "Upgrade to Pro" CTA that would have nowhere to send the user.
    const [{ count }] = await db`
      SELECT count(*)::int AS count FROM public.scans s
      JOIN public.companies c ON c.id = s.company_id
      WHERE c.owner_user_id = ${userId} AND s.created_at >= date_trunc('month', now())
    `;
    if (count >= PRO_PLAN_MONTHLY_SCAN_LIMIT) {
      return new Response(
        JSON.stringify({
          error: `Pro plan is limited to ${PRO_PLAN_MONTHLY_SCAN_LIMIT} scans per month (fair use) — resets at the start of next month.`,
          limit: PRO_PLAN_MONTHLY_SCAN_LIMIT,
        }),
        { status: 402, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } },
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
    return new Response(JSON.stringify({ error: 'Failed to start scan' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  return new Response(JSON.stringify({ ok: true, scanId }), {
    status: 202,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });
};

export const config: Config = {
  path: '/scan',
};
