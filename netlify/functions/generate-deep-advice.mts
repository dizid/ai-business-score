// On-demand deep advice — Milestone 6 of the SaaS-pivot plan. Triggered by a
// "Generate deeper advice" button on a completed scan (not automatic — see
// aivis-core.mjs's buildDeepAdvicePrompt comment for why). One additional
// grounded Perplexity call; result stored on the scan row.
import type { Config, Context } from '@netlify/functions';
import { callModel, buildDeepAdvicePrompt, parseDeepAdviceResponse } from '../../shared/aivis-core.mjs';
import { requireAuth, authErrorResponse, AuthError } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';
import { toScanPayload } from './_shared/scanRow.mts';
import { corsHeaders, handleOptions } from './_shared/cors.mts';
import { isPro } from './_shared/plan.mts';

declare const Netlify: { env: { get(key: string): string | undefined } };

export default async (req: Request, context: Context) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  let userId: string;
  try {
    userId = await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }

  const db = sql();
  const scanId = context.params.id;

  const rows = await db`
    SELECT scans.* FROM public.scans
    JOIN public.companies ON companies.id = scans.company_id
    WHERE scans.id = ${scanId} AND companies.owner_user_id = ${userId}
  `;
  if (rows.length === 0) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }
  const scanRow = rows[0];

  // Entitled via Pro, or via a $19 one-time single-scan purchase covering
  // this exact scan (Milestone 2 of the 2026-08-24 monetization plan) —
  // that SKU bundles deep advice for the one scan it paid for.
  const profiles = await db`SELECT plan_tier FROM public.user_profiles WHERE user_id = ${userId}`;
  if (!isPro(profiles[0]?.plan_tier)) {
    const purchases = await db`
      SELECT id FROM public.single_scan_purchases WHERE scan_id = ${scanId}
    `;
    if (purchases.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Deep advice is a Pro feature.', upgradeRequired: true }),
        { status: 402, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } },
      );
    }
  }

  if (scanRow.status !== 'completed') {
    return new Response(JSON.stringify({ error: 'Scan is not completed yet' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  const apiKey = Netlify.env.get('PERPLEXITY_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured: PERPLEXITY_API_KEY not set' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  try {
    const prompt = buildDeepAdvicePrompt(toScanPayload(scanRow));
    // Deliberately Perplexity-only, not the direct-API path — see
    // enrich.mts's comment (a real OpenAI call measured at 30.5s live,
    // over this regular synchronous function's execution ceiling).
    const result = await callModel({ perplexity: apiKey }, 'openai/gpt-5-mini', prompt, 20000);
    const deepAdvice = parseDeepAdviceResponse(result.text);

    const updated = await db`
      UPDATE public.scans SET deep_advice = ${JSON.stringify(deepAdvice)}, deep_advice_generated_at = now()
      WHERE id = ${scanId}
      RETURNING *
    `;
    return new Response(JSON.stringify({ ok: true, scan: toScanPayload(updated[0]) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }
};

export const config: Config = {
  path: '/scans/:id/deep-advice',
};
