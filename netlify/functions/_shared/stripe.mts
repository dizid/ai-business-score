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

// 2026-09-04 — free-only cost-control pass (see root CLAUDE.md's Deployment
// section for the full reasoning and exact revert steps). A guard of this
// same name/shape briefly existed 2026-09-02→09-04 for an unrelated reason
// (a live→test-mode safety gate while beta testers could have been charged
// real money) and was deleted once that incident's only caller was removed.
// This is a deliberate product decision, not an incident response: checkout
// is off because the product is running free-only for now, not because
// Stripe mode is unsafe. To revert, delete this function and remove its
// call site from create-checkout-session.mts and
// create-single-scan-checkout-session.mts.
export function checkoutTemporarilyDisabled(extraHeaders: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({ error: 'Checkout is temporarily unavailable — Foreground is running as a free product for now.' }),
    { status: 503, headers: { 'Content-Type': 'application/json', ...extraHeaders } }
  );
}
