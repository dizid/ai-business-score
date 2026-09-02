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

// Added 2026-09-02 as a safety gate on ALL THREE checkout-creating
// functions while STRIPE_SECRET_KEY was still live-mode. STRIPE_SECRET_KEY/
// STRIPE_PRICE_ID/STRIPE_SINGLE_SCAN_PRICE_ID/STRIPE_WEBHOOK_SECRET are now
// back to a scoped test-mode restricted key + fresh test Prices (Marc
// created "Foreground (test mode)", Write-only on Checkout Sessions/
// Products/Prices/Webhook Endpoints — isolated from every other Dizid
// product on the same Stripe account, at his explicit request), so
// create-checkout-session.mts and create-single-scan-checkout-session.mts
// were re-enabled the same day. STRIPE_TOPUP_PRICE_ID was NOT part of that
// swap — top-up packs are already slated for removal (see TODO.md's "Remove
// the top-up-pack purchase path") and production's STRIPE_TOPUP_PRICE_ID is
// still a stray live Price from an unrelated concurrent-session mistake —
// so create-topup-checkout-session.mts keeps using this gate rather than
// being wired up to test mode too. Remove this once that cleanup lands.
export function checkoutTemporarilyDisabled(extraHeaders: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({ error: 'Checkout is temporarily unavailable during beta testing — please check back soon.' }),
    { status: 503, headers: { 'Content-Type': 'application/json', ...extraHeaders } },
  );
}
