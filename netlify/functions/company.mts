// AIVis single company — auth + ownership-scoped, returns the company plus
// its full scan history (transformed to the camelCase payload shape
// ScanDetail.vue/validatePayload() already expect).
import type { Config, Context } from '@netlify/functions';
import { authenticate } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';
import { toScanPayload } from './_shared/scanRow.mts';
import { corsHeaders, handleOptions } from './_shared/cors.mts';
import { isPro } from './_shared/plan.mts';
import { jsonResponse, errorResponse } from './_shared/http.mts';

const SCAN_FREQUENCIES = ['off', 'weekly'];

export default async (req: Request, context: Context) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const cors = corsHeaders(req);

  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return errorResponse('Method not allowed', 405, {}, cors);
  }

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const userId = auth;

  const companyId = context.params.id;
  const db = sql();

  const companies = await db`
    SELECT * FROM public.companies WHERE id = ${companyId} AND owner_user_id = ${userId}
  `;
  if (companies.length === 0) {
    return errorResponse('Not found', 404, {}, cors);
  }

  if (req.method === 'PATCH') {
    let body: { scan_frequency?: string };
    try {
      body = await req.json();
    } catch {
      return errorResponse('Invalid JSON body', 400, {}, cors);
    }

    if (!SCAN_FREQUENCIES.includes(body.scan_frequency as string)) {
      return errorResponse(`scan_frequency must be one of: ${SCAN_FREQUENCIES.join(', ')}`, 400, {}, cors);
    }

    // Weekly auto-scans are a Pro feature. 'off' requires no plan check so a
    // downgraded user can always turn it off.
    if (body.scan_frequency === 'weekly') {
      const profiles = await db`SELECT plan_tier FROM public.user_profiles WHERE user_id = ${userId}`;
      if (!isPro(profiles[0]?.plan_tier)) {
        return errorResponse(
          'Automatic weekly scans are a Pro feature. Upgrade to Pro to unlock them.',
          402,
          { upgradeRequired: true },
          cors
        );
      }
    }

    const updated = await db`
      UPDATE public.companies SET scan_frequency = ${body.scan_frequency}
      WHERE id = ${companyId} AND owner_user_id = ${userId}
      RETURNING *
    `;

    return jsonResponse({ ok: true, company: updated[0] }, { cors });
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

  return jsonResponse(
    { ok: true, company: companies[0], scans: scanRows.map(toScanPayload), profile },
    { cors }
  );
};

export const config: Config = {
  path: '/companies/:id',
};
