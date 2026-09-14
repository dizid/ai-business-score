// AIVis alert history — GET only, auth-scoped. Full history of score
// regressions across the caller's whole portfolio, dismissed and active
// alike, unlike companies.mts's GET response, which only carries a
// widget-sized slice (last 30 days, latest-scan-only, capped at 10,
// dismissed excluded — see that file's own comment). This is the "See all
// alerts" destination that widget links out to.
import type { Config } from '@netlify/functions';
import { authenticate } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';
import { corsHeaders, handleOptions } from './_shared/cors.mts';
import { jsonResponse, errorResponse } from './_shared/http.mts';

// A real cursor-paginated API is more machinery than this app's own scale
// justifies today — same "bounded by realistic portfolio sizes" reasoning
// _shared/scoreHistory.mts's own comment already gives for a similar
// per-company-loop tradeoff. 200 alerts is generous headroom for a "track a
// handful of companies" account; revisit if that stops being true.
const MAX_ALERTS = 200;

export default async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const cors = corsHeaders(req);

  if (req.method !== 'GET') {
    return errorResponse('Method not allowed', 405, {}, cors);
  }

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const userId = auth;

  const db = sql();

  const alerts = await db`
    SELECT a.id, a.company_id, c.brand, a.prior_score, a.new_score, a.delta, a.created_at, a.dismissed_at
    FROM public.score_alerts a
    JOIN public.companies c ON c.id = a.company_id
    WHERE c.owner_user_id = ${userId}
    ORDER BY a.created_at DESC
    LIMIT ${MAX_ALERTS}
  `;

  return jsonResponse({ ok: true, alerts }, { cors });
};

export const config: Config = {
  path: '/alerts',
};
