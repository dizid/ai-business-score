// Claims an anonymous $19 single-scan purchase's ownerless company into the
// caller's own account (Milestone 2 of the 2026-08-24 monetization plan).
// Auth-gated — the caller must already have (or just have created) a real
// Foreground account; this only attaches an existing ownerless company to
// it, it never creates the purchase itself (the webhook already did that).
import type { Config } from '@netlify/functions';
import { requireAuth, authErrorResponse, AuthError } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';
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

  let body: { access_token?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  const accessToken = (body.access_token || '').trim();
  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'access_token is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  const db = sql();
  const purchases = await db`
    SELECT company_id FROM public.single_scan_purchases WHERE access_token = ${accessToken}
  `;
  if (purchases.length === 0 || !purchases[0].company_id) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }
  const companyId = purchases[0].company_id;

  // Lazily provision, same as companies.mts's POST handler — companies.owner_user_id
  // FKs to user_profiles(user_id), which only exists once a user has made
  // their first write here.
  await db`INSERT INTO public.user_profiles (user_id) VALUES (${userId}) ON CONFLICT (user_id) DO NOTHING`;

  const claimed = await db`
    UPDATE public.companies SET owner_user_id = ${userId}
    WHERE id = ${companyId} AND owner_user_id IS NULL
    RETURNING id
  `;
  if (claimed.length === 0) {
    // Either already claimed by this same account (revisiting the link is
    // idempotent) or by someone else (a genuine conflict).
    const owned = await db`SELECT id FROM public.companies WHERE id = ${companyId} AND owner_user_id = ${userId}`;
    if (owned.length === 0) {
      return new Response(JSON.stringify({ error: 'This scan has already been claimed by another account' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
      });
    }
  }

  await db`
    UPDATE public.single_scan_purchases SET user_id = ${userId} WHERE access_token = ${accessToken}
  `;

  return new Response(JSON.stringify({ ok: true, companyId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });
};

export const config: Config = {
  path: '/claim-single-scan',
};
