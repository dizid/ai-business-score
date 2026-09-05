// AIVis Stripe Checkout — POST /create-checkout-session, auth-gated. Mints a
// hosted Stripe Checkout Session for the Pro subscription and hands back its
// URL; the frontend does a plain redirect, no custom card form. Same
// auth-then-db shape as every other function here (requireAuth copy-pasted,
// no shared middleware, per this repo's convention).
import type { Config } from '@netlify/functions';
import { requireAuth, authErrorResponse, AuthError } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';
import { stripe, checkoutTemporarilyDisabled } from './_shared/stripe.mts';
import { isPro } from './_shared/plan.mts';

declare const Netlify: { env: { get(key: string): string | undefined } };

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2026-09-04 — checkout hard-disabled, free-only cost-control pass. See
  // _shared/stripe.mts's checkoutTemporarilyDisabled() comment for why and
  // how to revert.
  return checkoutTemporarilyDisabled();

  let userId: string;
  try {
    userId = await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }

  const priceId = Netlify.env.get('STRIPE_PRICE_ID');
  if (!priceId) {
    return new Response(JSON.stringify({ error: 'Server misconfigured: STRIPE_PRICE_ID not set' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
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
    return new Response(JSON.stringify({ error: 'Already on the Pro plan' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
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

    return new Response(JSON.stringify({ ok: true, url: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Failed to create Stripe Checkout session:', err);
    return new Response(JSON.stringify({ error: 'Failed to start checkout' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config: Config = {
  path: '/create-checkout-session',
};
