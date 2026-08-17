// Polled by the frontend every ~2s while a scan is pending/running. Auth +
// ownership-scoped via a join through companies (same pattern as
// history.mts used before it was retired).
import type { Config, Context } from '@netlify/functions';
import { requireAuth, authErrorResponse, AuthError } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';
import { toScanPayload } from './_shared/scanRow.mts';
import { corsHeaders, handleOptions } from './_shared/cors.mts';

export default async (req: Request, context: Context) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  let userId: string;
  try {
    userId = await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }

  const scanId = context.params.id;
  const db = sql();

  const rows = await db`
    SELECT scans.* FROM public.scans
    JOIN public.companies ON companies.id = scans.company_id
    WHERE scans.id = ${scanId} AND companies.owner_user_id = ${userId}
  `;
  if (rows.length === 0) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  const row = rows[0];
  return new Response(
    JSON.stringify({
      ok: true,
      status: row.status,
      errorMessage: row.error_message,
      // Live call-progress while running — {completed, total, currentModel}
      // written incrementally by run-scan-background.mts, null for scans
      // that are still pending (not claimed yet) or finalized before this
      // column existed. See the `progress` column comment for the shape.
      progress: row.progress ?? null,
      scan: row.status === 'completed' ? toScanPayload(row) : null,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } }
  );
};

export const config: Config = {
  path: '/scans/:id',
};
