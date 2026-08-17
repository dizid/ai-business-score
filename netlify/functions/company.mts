// AIVis single company — auth + ownership-scoped, returns the company plus
// its full scan history (transformed to the camelCase payload shape
// ScanDetail.vue/validatePayload() already expect).
import type { Config, Context } from '@netlify/functions';
import { requireAuth, authErrorResponse, AuthError } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';
import { toScanPayload } from './_shared/scanRow.mts';
import { corsHeaders, handleOptions } from './_shared/cors.mts';

export default async (req: Request, context: Context) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== 'GET') {
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

  const scanRows = await db`
    SELECT * FROM public.scans WHERE company_id = ${companyId} ORDER BY generated_at DESC NULLS LAST
  `;

  return new Response(
    JSON.stringify({
      ok: true,
      company: companies[0],
      scans: scanRows.map(toScanPayload),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } }
  );
};

export const config: Config = {
  path: '/companies/:id',
};
