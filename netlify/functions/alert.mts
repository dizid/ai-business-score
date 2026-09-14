// AIVis single alert — PATCH only, auth + ownership-scoped (joined through
// companies, same pattern company.mts uses for its own PATCH). Currently
// only supports dismissing an alert (one-directional — no "undismiss"
// requested); the shape leaves room for a future PATCH {dismissed: false}
// without a breaking change if that's ever wanted.
import type { Config, Context } from '@netlify/functions';
import { authenticate } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';
import { corsHeaders, handleOptions } from './_shared/cors.mts';
import { jsonResponse, errorResponse } from './_shared/http.mts';

export default async (req: Request, context: Context) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const cors = corsHeaders(req);

  if (req.method !== 'PATCH') {
    return errorResponse('Method not allowed', 405, {}, cors);
  }

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const userId = auth;

  const alertId = context.params.id;
  const db = sql();

  let body: { dismissed?: boolean };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, {}, cors);
  }

  if (body.dismissed !== true) {
    return errorResponse('dismissed must be true', 400, {}, cors);
  }

  // Ownership check + write in one statement, same "UPDATE ... WHERE
  // owner_user_id = $userId" pattern company.mts's PATCH uses — a
  // non-matching id (wrong owner, or doesn't exist) just returns 0 rows
  // rather than needing a separate SELECT to check first.
  const updated = await db`
    UPDATE public.score_alerts a
    SET dismissed_at = now()
    FROM public.companies c
    WHERE a.id = ${alertId} AND a.company_id = c.id AND c.owner_user_id = ${userId}
    RETURNING a.id, a.company_id, a.prior_score, a.new_score, a.delta, a.created_at, a.dismissed_at
  `;

  if (updated.length === 0) {
    return errorResponse('Not found', 404, {}, cors);
  }

  return jsonResponse({ ok: true, alert: updated[0] }, { cors });
};

export const config: Config = {
  path: '/alerts/:id',
};
