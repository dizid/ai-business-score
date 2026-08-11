// AIVis companies — list/create, auth-scoped. Part of Milestone 4 of the
// SaaS-pivot plan (see /home/marc/.claude/plans/cheerful-leaping-dragon.md):
// the authenticated app shell's first real data endpoint.
import type { Config } from '@netlify/functions';
import { requireAuth, authErrorResponse, AuthError } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';
import { normalizeUrl } from '../../shared/aivis-core.mjs';
import { FREE_PLAN_COMPANY_LIMIT, isPro } from './_shared/plan.mts';
import { corsHeaders, handleOptions } from './_shared/cors.mts';

export default async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  let userId: string;
  try {
    userId = await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }

  const db = sql();

  if (req.method === 'GET') {
    const companies = await db`
      SELECT
        c.*,
        (SELECT count(*)::int FROM public.scans s WHERE s.company_id = c.id) AS scan_count,
        (
          SELECT s.score FROM public.scans s
          WHERE s.company_id = c.id
          ORDER BY s.generated_at DESC NULLS LAST
          LIMIT 1
        ) AS latest_score
      FROM public.companies c
      WHERE c.owner_user_id = ${userId}
      ORDER BY c.created_at DESC
    `;
    // Lazily created if this is the caller's first request of any kind —
    // matches the POST handler's on-demand provisioning below.
    const profiles = await db`
      SELECT plan_tier, subscription_status FROM public.user_profiles WHERE user_id = ${userId}
    `;
    const profile = profiles[0] || { plan_tier: 'free', subscription_status: null };
    return new Response(JSON.stringify({ ok: true, companies, profile }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  if (req.method === 'POST') {
    // FK target for companies.owner_user_id — first write for a given user
    // creates their profile row on demand rather than requiring a separate
    // provisioning step.
    await db`INSERT INTO public.user_profiles (user_id) VALUES (${userId}) ON CONFLICT (user_id) DO NOTHING`;

    const profiles = await db`SELECT plan_tier FROM public.user_profiles WHERE user_id = ${userId}`;
    if (!isPro(profiles[0]?.plan_tier)) {
      const [{ count }] = await db`
        SELECT count(*)::int AS count FROM public.companies WHERE owner_user_id = ${userId}
      `;
      if (count >= FREE_PLAN_COMPANY_LIMIT) {
        return new Response(
          JSON.stringify({
            error: `Free plan is limited to ${FREE_PLAN_COMPANY_LIMIT} company. Upgrade to Pro for unlimited companies.`,
            upgradeRequired: true,
            limit: FREE_PLAN_COMPANY_LIMIT,
          }),
          { status: 402, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } },
        );
      }
    }

    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
      });
    }

    const brand = (body.brand || '').trim();
    const website = (body.website || '').trim();
    if (!brand || !website) {
      return new Response(JSON.stringify({ error: 'brand and website are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
      });
    }
    const category = (body.category || '').trim();
    const useCase = (body.use_case || '').trim();
    const region = (body.region || '').trim();
    const customerSegment = (body.customer_segment || '').trim();
    const competitors = (body.competitors || '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);

    const inserted = await db`
      INSERT INTO public.companies (
        owner_user_id, brand, website, category, use_case, region, customer_segment, competitors
      ) VALUES (
        ${userId}, ${brand}, ${normalizeUrl(website)}, ${category}, ${useCase}, ${region}, ${customerSegment}, ${competitors}
      )
      RETURNING *
    `;
    const company = inserted[0];

    return new Response(JSON.stringify({ ok: true, company }), {
      status: 201,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });
};

export const config: Config = {
  path: '/companies',
};
