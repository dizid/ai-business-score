// AIVis Stripe webhook — POST /stripe-webhook. Deliberately does NOT use
// requireAuth: Stripe authenticates itself via an HMAC signature over the
// raw request body (stripe-signature header + STRIPE_WEBHOOK_SECRET), not a
// Neon Auth bearer JWT. This is its own auth mechanism, verified below.
import type { Config } from '@netlify/functions';
import { sql } from './_shared/db.mts';
import { stripe } from './_shared/stripe.mts';
import { SCAN_CREDIT_PACK_SIZE } from './_shared/plan.mts';
import { sendSingleScanReceiptEmail } from './_shared/email.mts';
import { callModelWithRetry, buildEnrichPrompt, parseEnrichmentResponse } from '../../shared/aivis-core.mjs';

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

      // A Pro scan top-up pack (mode: 'payment') — distinct from the
      // subscription checkout below (mode: 'subscription'). Both flags
      // checked as belt-and-suspenders: mode alone is sufficient today
      // since this is the only one-time SKU, but metadata.type is the
      // durable disambiguator once a second one-time SKU exists (see
      // PLAN_NEXT_PHASE.md's Milestone E report_purchases plan).
      if (session.mode === 'payment' && session.metadata?.type === 'scan_credit_pack') {
        const topupUserId = session.client_reference_id;
        const credits = Number(session.metadata.credits) || SCAN_CREDIT_PACK_SIZE;
        const paymentIntentId =
          typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
        if (topupUserId) {
          await db`
            INSERT INTO public.scan_credit_purchases
              (user_id, credits, stripe_checkout_session_id, stripe_payment_intent_id, amount_cents)
            VALUES (${topupUserId}, ${credits}, ${session.id}, ${paymentIntentId ?? null}, ${session.amount_total ?? null})
            ON CONFLICT (stripe_checkout_session_id) DO NOTHING
          `;
        } else {
          console.error('checkout.session.completed (top-up) missing client_reference_id', event.id);
        }
        break;
      }

      // A $19 one-time single-scan purchase (Milestone 2 of the 2026-08-24
      // monetization plan) — two sub-modes sharing one SKU/table, see
      // create-single-scan-checkout-session.mts's own comment for why.
      // Unlike the scan-credit-pack branch above, this one has real side
      // effects beyond one row (creates a company/scan and triggers real
      // Perplexity spend), so the idempotency check has to run FIRST —
      // Stripe's at-least-once webhook delivery must never double-create.
      if (session.mode === 'payment' && session.metadata?.type === 'single_scan_purchase') {
        const existing = await db`
          SELECT id FROM public.single_scan_purchases WHERE stripe_checkout_session_id = ${session.id}
        `;
        if (existing.length > 0) {
          break; // already processed this exact Checkout session
        }

        const paymentIntentId =
          typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
        const origin = new URL(req.url).origin;

        if (session.metadata.mode === 'topup') {
          const topupUserId = session.client_reference_id;
          const companyId = session.metadata.company_id;
          if (!topupUserId || !companyId) {
            console.error('single_scan_purchase (topup) missing client_reference_id/company_id', event.id);
            break;
          }
          const companies = await db`
            SELECT brand, website, category FROM public.companies
            WHERE id = ${companyId} AND owner_user_id = ${topupUserId}
          `;
          if (companies.length === 0) {
            console.error('single_scan_purchase (topup): company no longer owned by buyer', event.id);
            break;
          }
          const company = companies[0];
          const scanRows = await db`
            INSERT INTO public.scans (id, company_id, status, brand, website, category)
            VALUES (gen_random_uuid(), ${companyId}, 'pending', ${company.brand}, ${company.website}, ${company.category})
            RETURNING id
          `;
          const scanId = scanRows[0].id;
          try {
            await fetch(`${origin}/run-scan-background`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ scanId }),
            });
          } catch (err) {
            console.error(`single_scan_purchase (topup): failed to trigger scan ${scanId}`, err);
          }
          // single_scan_purchases.email is NOT NULL — the buyer is already
          // authenticated here (no email collected in this mode's Checkout),
          // so pull it from Neon Auth's own user table rather than relaxing
          // the column.
          const users = await db`SELECT email FROM neon_auth."user" WHERE id = ${topupUserId}`;
          const buyerEmail = users[0]?.email ?? `${topupUserId}@unknown.local`;
          await db`
            INSERT INTO public.single_scan_purchases
              (email, stripe_checkout_session_id, stripe_payment_intent_id, amount_cents, company_id, scan_id, user_id)
            VALUES (${buyerEmail}, ${session.id}, ${paymentIntentId ?? null}, ${session.amount_total ?? null}, ${companyId}, ${scanId}, ${topupUserId})
            ON CONFLICT (stripe_checkout_session_id) DO NOTHING
          `;
          break;
        }

        // Anonymous mode: no account exists yet. Enrich the bare website
        // (same helpers enrich.mts wraps, called directly here since this
        // is a webhook, not a request from the still-anonymous browser) —
        // cost now scales with completed $19 charges, not page views, since
        // it only ever runs after payment clears.
        const email = session.metadata.email;
        const website = session.metadata.website;
        if (!email || !website) {
          console.error('single_scan_purchase (anonymous) missing email/website metadata', event.id);
          break;
        }

        let brand = '';
        let category = '';
        let useCase = '';
        let region = '';
        let customerSegment = '';
        let competitors: string[] = [];
        const apiKey = Netlify.env.get('PERPLEXITY_API_KEY');
        if (apiKey) {
          try {
            const result = await callModelWithRetry({ perplexity: apiKey, openai: Netlify.env.get('OPENAI_API_KEY') }, 'openai/gpt-5-mini', buildEnrichPrompt(website), 45000, 3);
            const fields = parseEnrichmentResponse(result.text);
            brand = fields.brand;
            category = fields.category;
            useCase = fields.use_case;
            region = fields.region;
            customerSegment = fields.customer_segment;
            competitors = fields.competitors;
          } catch (err) {
            console.error('single_scan_purchase (anonymous): enrichment failed, falling back to domain guess', err);
          }
        }
        if (!brand) {
          try {
            brand = new URL(website).hostname.replace(/^www\./, '');
          } catch {
            brand = website;
          }
        }
        if (!category) category = 'business';

        const companyRows = await db`
          INSERT INTO public.companies
            (owner_user_id, brand, website, category, use_case, region, customer_segment, competitors)
          VALUES (NULL, ${brand}, ${website}, ${category}, ${useCase}, ${region}, ${customerSegment}, ${competitors})
          RETURNING id
        `;
        const companyId = companyRows[0].id;

        const scanRows = await db`
          INSERT INTO public.scans (id, company_id, status, brand, website, category)
          VALUES (gen_random_uuid(), ${companyId}, 'pending', ${brand}, ${website}, ${category})
          RETURNING id
        `;
        const scanId = scanRows[0].id;

        try {
          await fetch(`${origin}/run-scan-background`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scanId }),
          });
        } catch (err) {
          console.error(`single_scan_purchase (anonymous): failed to trigger scan ${scanId}`, err);
        }

        const accessToken = crypto.randomUUID();
        await db`
          INSERT INTO public.single_scan_purchases
            (email, stripe_checkout_session_id, stripe_payment_intent_id, amount_cents, company_id, scan_id, access_token)
          VALUES (${email}, ${session.id}, ${paymentIntentId ?? null}, ${session.amount_total ?? null}, ${companyId}, ${scanId}, ${accessToken})
          ON CONFLICT (stripe_checkout_session_id) DO NOTHING
        `;

        await sendSingleScanReceiptEmail({
          to: email,
          brand,
          statusUrl: `${origin}/app/scan?token=${accessToken}`,
        });
        break;
      }

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
