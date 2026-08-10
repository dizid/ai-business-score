// AIVis Stripe webhook — POST /stripe-webhook. Deliberately does NOT use
// requireAuth: Stripe authenticates itself via an HMAC signature over the
// raw request body (stripe-signature header + STRIPE_WEBHOOK_SECRET), not a
// Neon Auth bearer JWT. This is its own auth mechanism, verified below.
import type { Config } from '@netlify/functions';
import { sql } from './_shared/db.mts';
import { stripe } from './_shared/stripe.mts';

declare const Netlify: { env: { get(key: string): string | undefined } };

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const webhookSecret = Netlify.env.get('STRIPE_WEBHOOK_SECRET');
  if (!webhookSecret) {
    console.error('Server misconfigured: STRIPE_WEBHOOK_SECRET not set');
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const signature = req.headers.get('stripe-signature');
  const rawBody = await req.text();
  if (!signature) {
    return new Response(JSON.stringify({ error: 'Missing stripe-signature header' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err);
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = sql();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.client_reference_id;
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
      const subscriptionId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
      if (userId && customerId && subscriptionId) {
        await db`
          UPDATE public.user_profiles
          SET plan_tier = 'pro',
              stripe_customer_id = ${customerId},
              stripe_subscription_id = ${subscriptionId},
              subscription_status = 'active'
          WHERE user_id = ${userId}
        `;
      } else {
        console.error('checkout.session.completed missing client_reference_id/customer/subscription', event.id);
      }
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
      const status = subscription.status;
      const stillActive = status === 'active' || status === 'trialing';
      if (customerId) {
        await db`
          UPDATE public.user_profiles
          SET subscription_status = ${status},
              plan_tier = ${stillActive ? 'pro' : 'free'}
          WHERE stripe_customer_id = ${customerId}
        `;
      }
      break;
    }

    default:
      // Unhandled event types are a no-op, not an error.
      break;
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config: Config = {
  path: '/stripe-webhook',
};
