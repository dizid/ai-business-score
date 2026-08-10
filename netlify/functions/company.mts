// AIVis single company — auth + ownership-scoped, returns the company plus
// its full scan history (transformed to the camelCase payload shape
// ScanDetail.vue/validatePayload() already expect).
import type { Config, Context } from '@netlify/functions';
import { requireAuth, authErrorResponse, AuthError } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';
import { toScanPayload } from './_shared/scanRow.mts';

export default async (req: Request, context: Context) => {
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
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

  if (req.method === 'PATCH') {
    // Toggles public-leaderboard listing after creation — companies.mts's
    // POST only sets is_public at creation time, this is how an existing
    // company opts in/out later. Same ownership scoping as GET below.
    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const isPublic = body.is_public === true;
    const updated = await db`
      UPDATE public.companies SET is_public = ${isPublic}, updated_at = now()
      WHERE id = ${companyId} AND owner_user_id = ${userId}
      RETURNING *
    `;
    if (updated.length === 0) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true, company: updated[0] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const companies = await db`
    SELECT * FROM public.companies WHERE id = ${companyId} AND owner_user_id = ${userId}
  `;
  if (companies.length === 0) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const scanRows = await db`
    SELECT * FROM public.scans WHERE company_id = ${companyId} ORDER BY generated_at DESC NULLS LAST
  `;

  const urls = await db`
    SELECT * FROM public.company_urls WHERE company_id = ${companyId} ORDER BY is_primary DESC, created_at ASC
  `;

  return new Response(
    JSON.stringify({
      ok: true,
      company: companies[0],
      scans: scanRows.map(toScanPayload),
      urls,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};

export const config: Config = {
  path: '/companies/:id',
};
