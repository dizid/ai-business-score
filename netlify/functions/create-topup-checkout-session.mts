// Foreground Stripe Checkout for Pro scan top-up packs — POST
// /create-topup-checkout-session, auth-gated. Mirrors create-checkout-session.mts's
// shape (mode: 'payment' instead of 'subscription' — a one-time charge, not
// recurring billing). Only Pro users can buy a pack; it extends the existing
// PRO_PLAN_MONTHLY_SCAN_LIMIT, it doesn't substitute for the Pro upgrade.
import type { Config } from '@netlify/functions';
import { requireAuth, authErrorResponse, AuthError } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';
import { stripe, checkoutTemporarilyDisabled } from './_shared/stripe.mts';
import { isPro, SCAN_CREDIT_PACK_SIZE, MAX_CREDIT_PACKS_PER_MONTH } from './_shared/plan.mts';

declare const Netlify: { env: { get(key: string): string | undefined } };

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return checkoutTemporarilyDisabled();

  let userId: string;
  try {
    userId = await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }

  const topupPriceId = Netlify.env.get('STRIPE_TOPUP_PRICE_ID');
  if (!topupPriceId) {
    return new Response(JSON.stringify({ error: 'Server misconfigured: STRIPE_TOPUP_PRICE_ID not set' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { company_id?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const db = sql();

  const profiles = await db`
    SELECT plan_tier, stripe_customer_id FROM public.user_profiles WHERE user_id = ${userId}
  `;
  const profile = profiles[0];
  if (!isPro(profile?.plan_tier)) {
    return new Response(
      JSON.stringify({ error: 'Top-up packs are only available on the Pro plan. Upgrade to Pro first.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const [{ packsThisMonth }] = await db`
    SELECT count(*)::int AS "packsThisMonth"
    FROM public.scan_credit_purchases
    WHERE user_id = ${userId} AND purchased_at >= date_trunc('month', now())
  `;
  if (packsThisMonth >= MAX_CREDIT_PACKS_PER_MONTH) {
    return new Response(
      JSON.stringify({
        error: `You've already bought the maximum ${MAX_CREDIT_PACKS_PER_MONTH} top-up packs this month — resets at the start of next month.`,
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // company_id is optional — only used to send the user back to the right
  // page after checkout. Validate ownership rather than trusting an
  // unvalidated id in the redirect target; fall back to the companies list.
  let redirectPath = '/app';
  if (body.company_id) {
    const companies = await db`
      SELECT id FROM public.companies WHERE id = ${body.company_id} AND owner_user_id = ${userId}
    `;
    if (companies.length > 0) {
      redirectPath = `/app/companies/${companies[0].id}`;
    }
  }

  const origin = new URL(req.url).origin;

  try {
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: topupPriceId, quantity: 1 }],
      client_reference_id: userId,
      customer: profile?.stripe_customer_id || undefined,
      metadata: { type: 'scan_credit_pack', credits: String(SCAN_CREDIT_PACK_SIZE) },
      success_url: `${origin}${redirectPath}?topup=success`,
      cancel_url: `${origin}${redirectPath}?topup=cancelled`,
    });

    if (!session.url) {
      throw new Error('Stripe did not return a Checkout URL');
    }

    return new Response(JSON.stringify({ ok: true, url: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Failed to create Stripe top-up Checkout session:', err);
    return new Response(JSON.stringify({ error: 'Failed to start checkout' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config: Config = {
  path: '/create-topup-checkout-session',
};
