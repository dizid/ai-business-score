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
