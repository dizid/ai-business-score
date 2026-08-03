// AIVis scan history — lists every scan the authenticated user's companies
// own, newest first. Auth-scoped (Milestone 2 of the SaaS-pivot plan):
// previously a single shared SCAN_PASSPHRASE gated the whole store and every
// caller saw every scan ever run; now each user only sees scans belonging to
// companies they own.
//
// LIMIT 50 is a cheap safety cap, not real pagination — pagination stays an
// explicit non-goal for now.

import type { Config } from '@netlify/functions';
import { requireAuth, authErrorResponse, AuthError } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';

export default async (req: Request) => {
  if (req.method !== 'POST') {
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

  const db = sql();
  const scans = await db`
    SELECT scans.*
    FROM public.scans
    JOIN public.companies ON companies.id = scans.company_id
    WHERE companies.owner_user_id = ${userId}
    ORDER BY scans.generated_at DESC NULLS LAST
    LIMIT 50
  `;

  return new Response(JSON.stringify({ ok: true, scans }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config: Config = {
  path: '/history',
};
