// AIVis single company — auth + ownership-scoped, returns the company plus
// its full scan history (transformed to the camelCase payload shape
// ScanDetail.vue/validatePayload() already expect).
import type { Config, Context } from '@netlify/functions';
import { requireAuth, authErrorResponse, AuthError } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';
import { toScanPayload } from './_shared/scanRow.mts';
import { corsHeaders, handleOptions } from './_shared/cors.mts';
import { isPro } from './_shared/plan.mts';

const SCAN_FREQUENCIES = ['off', 'weekly'];

export default async (req: Request, context: Context) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== 'GET' && req.method !== 'PATCH') {
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

  const companyId = context.params.id;
  const db = sql();

  const companies = await db`
    SELECT * FROM public.companies WHERE id = ${companyId} AND owner_user_id = ${userId}
  `;
  if (companies.length === 0) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  if (req.method === 'PATCH') {
    let body: { scan_frequency?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
      });
    }

    if (!SCAN_FREQUENCIES.includes(body.scan_frequency as string)) {
      return new Response(
        JSON.stringify({ error: `scan_frequency must be one of: ${SCAN_FREQUENCIES.join(', ')}` }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } },
      );
    }

    // Weekly auto-scans are a Pro feature — it's what makes the recurring
    // subscription rational vs. buying one-off scans as needed. 'off'
    // requires no plan check so a downgraded user can always turn it off.
    if (body.scan_frequency === 'weekly') {
      const profiles = await db`SELECT plan_tier FROM public.user_profiles WHERE user_id = ${userId}`;
      if (!isPro(profiles[0]?.plan_tier)) {
        return new Response(
          JSON.stringify({ error: 'Automatic weekly scans are a Pro feature.', upgradeRequired: true }),
          { status: 402, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } },
        );
      }
    }

    const updated = await db`
      UPDATE public.companies SET scan_frequency = ${body.scan_frequency}
      WHERE id = ${companyId} AND owner_user_id = ${userId}
      RETURNING *
    `;

    return new Response(JSON.stringify({ ok: true, company: updated[0] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  const scanRows = await db`
    SELECT * FROM public.scans WHERE company_id = ${companyId} ORDER BY generated_at DESC NULLS LAST
  `;

  // Same profile shape companies.mts's list endpoint already returns — needed
  // here too so CompanyDetailView.vue can gate deep advice on plan_tier.
  const profiles = await db`
    SELECT plan_tier, subscription_status FROM public.user_profiles WHERE user_id = ${userId}
  `;
  const profile = profiles[0] || { plan_tier: 'free', subscription_status: null };

  return new Response(
    JSON.stringify({
      ok: true,
      company: companies[0],
      scans: scanRows.map(toScanPayload),
      profile,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } }
  );
};

export const config: Config = {
  path: '/companies/:id',
};
