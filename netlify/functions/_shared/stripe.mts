// Shared Stripe client for Netlify Functions, same cached-singleton shape as
// _shared/db.mts's sql(). One secret key for the whole site (test or live
// mode is a property of the key itself, not something this module decides).
import Stripe from 'stripe';

declare const Netlify: { env: { get(key: string): string | undefined } };

let cachedStripe: Stripe | null = null;

export function stripe(): Stripe {
  if (cachedStripe) return cachedStripe;
  const secretKey = Netlify.env.get('STRIPE_SECRET_KEY');
  if (!secretKey) {
    throw new Error('Server misconfigured: STRIPE_SECRET_KEY not set');
  }
  cachedStripe = new Stripe(secretKey);
  return cachedStripe;
}

// Temporary safety gate (added 2026-09-02, remove once resolved): Marc
// asked for Stripe back in test mode so beta testers can never be charged
// real money, but STRIPE_SECRET_KEY is currently a LIVE restricted key
// (rk_live_..., scoped to Checkout Sessions: Write only) with live Price
// IDs behind it — no test-mode secret key is available in this environment
// to do the real swap (Stripe never lets a key see the other mode's
// objects, and a fresh test key/Prices can only come from Marc via the
// Stripe Dashboard). Until that swap happens, every checkout-creating
// function hard-refuses instead of risking one more real charge.
// stripe-webhook.mts is deliberately untouched — any already-real
// subscription's lifecycle events (renewal/cancellation) must keep
// processing correctly; this only blocks *creating new* checkout sessions.
export function checkoutTemporarilyDisabled(extraHeaders: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({ error: 'Checkout is temporarily unavailable during beta testing — please check back soon.' }),
    { status: 503, headers: { 'Content-Type': 'application/json', ...extraHeaders } },
  );
}
