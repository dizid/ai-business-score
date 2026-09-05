// Foreground Stripe Checkout for the $19 one-time single-scan SKU — POST
// /create-single-scan-checkout-session. Deliberately NOT hard-auth-gated
// like every other checkout function: it serves two callers with the same
// product —
//   1. An anonymous visitor (no account yet): body is { email, website }.
//      The webhook creates the account's eventual home (an ownerless
//      companies row), runs the scan, and emails a claim link.
//   2. A logged-in free-tier user topping up past their cap without
//      subscribing: body is { company_id } and a valid bearer token —
//      verified against that company's ownership before trusting it.
// Auth is read optionally (a valid bearer promotes the request to case 2;
// anything else falls back to case 1) rather than two separate endpoints,
// since it's the same $19 charge either way.
import type { Config } from '@netlify/functions';
import { requireAuth, AuthError } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';
import { stripe, checkoutTemporarilyDisabled } from './_shared/stripe.mts';
import { corsHeaders, handleOptions } from './_shared/cors.mts';
import { normalizeUrl } from '../../shared/aivis-core.mjs';

declare const Netlify: { env: { get(key: string): string | undefined } };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  // 2026-09-04 — checkout hard-disabled, free-only cost-control pass. See
  // _shared/stripe.mts's checkoutTemporarilyDisabled() comment for why and
  // how to revert. Placed before the priceId lookup and before the
  // anonymous-vs-topup branch below, so one early return covers both paths.
  return checkoutTemporarilyDisabled(corsHeaders(req));

  const priceId = Netlify.env.get('STRIPE_SINGLE_SCAN_PRICE_ID');
  if (!priceId) {
    return new Response(JSON.stringify({ error: 'Server misconfigured: STRIPE_SINGLE_SCAN_PRICE_ID not set' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  let body: { email?: string; website?: string; company_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  // Optional auth — a missing/invalid token just means "anonymous caller",
  // not a request error, unlike every hard-requireAuth function elsewhere.
  let userId: string | null = null;
  try {
    userId = await requireAuth(req);
  } catch (err) {
    if (!(err instanceof AuthError)) throw err;
  }

  const db = sql();
  const origin = new URL(req.url).origin;

  let metadata: Record<string, string>;
  let successUrl: string;
  let cancelUrl: string;

  if (userId && body.company_id) {
    const companies = await db`
      SELECT id FROM public.companies WHERE id = ${body.company_id} AND owner_user_id = ${userId}
    `;
    if (companies.length === 0) {
      return new Response(JSON.stringify({ error: 'Company not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
      });
    }
    // @ts-expect-error — dead code below the temporary checkoutTemporarilyDisabled()
    // early return above; TS loses body.company_id's narrowing in unreachable
    // code. Left verbatim (not restructured) so re-enabling is a one-line revert.
    metadata = { type: 'single_scan_purchase', mode: 'topup', company_id: body.company_id };
    successUrl = `${origin}/app/companies/${body.company_id}?singlescan=success`;
    cancelUrl = `${origin}/app/companies/${body.company_id}?singlescan=cancelled`;
  } else {
    const email = (body.email || '').trim();
    const website = (body.website || '').trim();
    if (!EMAIL_RE.test(email) || !website) {
      return new Response(JSON.stringify({ error: 'A valid email and website are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
      });
    }
    metadata = { type: 'single_scan_purchase', mode: 'anonymous', email, website: normalizeUrl(website) };
    successUrl = `${origin}/app/scan?session_id={CHECKOUT_SESSION_ID}`;
    cancelUrl = `${origin}/?singlescan=cancelled`;
  }

  try {
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: userId || undefined,
      customer_email: !userId ? metadata.email : undefined,
      metadata,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session.url) {
      throw new Error('Stripe did not return a Checkout URL');
    }

    return new Response(JSON.stringify({ ok: true, url: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  } catch (err) {
    console.error('Failed to create Stripe single-scan Checkout session:', err);
    return new Response(JSON.stringify({ error: 'Failed to start checkout' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }
};

export const config: Config = {
  path: '/create-single-scan-checkout-session',
};
