// AIVis Stripe Checkout — POST /create-checkout-session, auth-gated. Mints a
// hosted Stripe Checkout Session for the Pro subscription and hands back its
// URL; the frontend does a plain redirect, no custom card form. Same
// auth-then-db shape as every other function here (authenticate(), per
// _shared/auth.mts's shared helper).
import type { Config } from '@netlify/functions';
import { authenticate } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';
import { stripe } from './_shared/stripe.mts';
import { isPro } from './_shared/plan.mts';
import { corsHeaders, handleOptions } from './_shared/cors.mts';
import { jsonResponse, errorResponse } from './_shared/http.mts';

declare const Netlify: { env: { get(key: string): string | undefined } };

export default async (req: Request) => {
  // 2026-09-12 (architecture refactor): this is a normal browser-called POST
  // endpoint (the frontend calls it directly to start checkout) — unlike
  // stripe-webhook.mts/reap-stuck-scans.mts/scheduled-rescan.mts/
  // ops-failure-digest.mts/run-scan-background.mts, which deliberately never
  // want CORS handling (unauthenticated/signature-verified/cron/background),
  // this file had simply never had it wired in. Added here, not because a
  // cross-origin caller is expected today, but for the same defensive
  // reasoning cors.mts's own header comment gives for every other real
  // endpoint.
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const cors = corsHeaders(req);

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405, {}, cors);
  }

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const userId = auth;

  const priceId = Netlify.env.get('STRIPE_PRICE_ID');
  if (!priceId) {
    return errorResponse('Server misconfigured: STRIPE_PRICE_ID not set', 500, {}, cors);
  }

  const db = sql();
  // Same lazy-provision pattern companies.mts uses for its POST handler —
  // first billing-related write for a user creates their profile row.
  await db`INSERT INTO public.user_profiles (user_id) VALUES (${userId}) ON CONFLICT (user_id) DO NOTHING`;

  const profiles = await db`
    SELECT plan_tier, stripe_customer_id FROM public.user_profiles WHERE user_id = ${userId}
  `;
  const profile = profiles[0];
  if (isPro(profile?.plan_tier)) {
    return errorResponse('Already on the Pro plan', 400, {}, cors);
  }

  const origin = new URL(req.url).origin;

  try {
    const session = await stripe().checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: userId,
      customer: profile?.stripe_customer_id || undefined,
      success_url: `${origin}/app/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/app?checkout=cancelled`,
    });

    if (!session.url) {
      throw new Error('Stripe did not return a Checkout URL');
    }

    return jsonResponse({ ok: true, url: session.url }, { cors });
  } catch (err) {
    console.error('Failed to create Stripe Checkout session:', err);
    return errorResponse('Failed to start checkout', 500, {}, cors);
  }
};

export const config: Config = {
  path: '/create-checkout-session',
};
