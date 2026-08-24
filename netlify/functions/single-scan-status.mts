// Public status endpoint for a $19 single-scan purchase (Milestone 2 of the
// 2026-08-24 monetization plan) — no auth, looked up by an unguessable
// token instead. Two lookup keys, matching the two moments a caller might
// hit this: `session_id` right after the Stripe Checkout redirect (before
// the buyer has ever seen their own access_token — the webhook that mints
// it may not have landed yet), or `token` from the emailed receipt link
// (or the URL after the frontend has swapped session_id for the real
// token). Mirrors scan-status.mts's response shape once a scan exists.
import type { Config } from '@netlify/functions';
import { sql } from './_shared/db.mts';
import { toScanPayload } from './_shared/scanRow.mts';
import { corsHeaders, handleOptions } from './_shared/cors.mts';

export default async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const sessionId = url.searchParams.get('session_id');
  if (!token && !sessionId) {
    return new Response(JSON.stringify({ error: 'token or session_id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  const db = sql();
  const purchases = token
    ? await db`SELECT * FROM public.single_scan_purchases WHERE access_token = ${token}`
    : await db`SELECT * FROM public.single_scan_purchases WHERE stripe_checkout_session_id = ${sessionId}`;

  if (purchases.length === 0) {
    // Not an error — the webhook that creates this row runs asynchronously
    // relative to the Checkout redirect, so a request right after payment
    // can easily arrive first. The frontend keeps polling on this state.
    return new Response(JSON.stringify({ ok: true, purchaseStatus: 'processing' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  const purchase = purchases[0];
  const scans = await db`SELECT * FROM public.scans WHERE id = ${purchase.scan_id}`;
  if (scans.length === 0) {
    // Shouldn't happen (the webhook always creates the scan row before the
    // purchase row) — treat the same as "still processing" rather than 500.
    return new Response(JSON.stringify({ ok: true, purchaseStatus: 'processing' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  const scan = scans[0];
  return new Response(
    JSON.stringify({
      ok: true,
      purchaseStatus: 'ready',
      accessToken: purchase.access_token,
      companyId: purchase.company_id,
      claimed: purchase.user_id !== null,
      status: scan.status,
      errorMessage: scan.error_message,
      progress: scan.progress ?? null,
      startedAt: scan.started_at ?? null,
      scan: scan.status === 'completed' ? toScanPayload(scan) : null,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } }
  );
};

export const config: Config = {
  path: '/single-scan-status',
};
