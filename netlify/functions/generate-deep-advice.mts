// On-demand deep advice — Milestone 6 of the SaaS-pivot plan. Triggered by a
// "Generate deeper advice" button on a completed scan (not automatic — see
// aivis-core.mjs's buildDeepAdvicePrompt comment for why). One additional
// grounded Perplexity call; result stored on the scan row.
import type { Config, Context } from '@netlify/functions';
import { callModel, buildDeepAdvicePrompt, parseDeepAdviceResponse } from '../../shared/aivis-core.mjs';
import { authenticate } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';
import { toScanPayload } from './_shared/scanRow.mts';
import { corsHeaders, handleOptions } from './_shared/cors.mts';
import { isPro } from './_shared/plan.mts';
import { jsonResponse, errorResponse } from './_shared/http.mts';

declare const Netlify: { env: { get(key: string): string | undefined } };

export default async (req: Request, context: Context) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const cors = corsHeaders(req);

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405, {}, cors);
  }

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const userId = auth;

  const db = sql();
  const scanId = context.params.id;

  const rows = await db`
    SELECT scans.* FROM public.scans
    JOIN public.companies ON companies.id = scans.company_id
    WHERE scans.id = ${scanId} AND companies.owner_user_id = ${userId}
  `;
  if (rows.length === 0) {
    return errorResponse('Not found', 404, {}, cors);
  }
  const scanRow = rows[0];

  const profiles = await db`SELECT plan_tier FROM public.user_profiles WHERE user_id = ${userId}`;
  if (!isPro(profiles[0]?.plan_tier)) {
    return errorResponse('Deep advice is a Pro feature. Upgrade to Pro to unlock it.', 402, { upgradeRequired: true }, cors);
  }

  if (scanRow.status !== 'completed') {
    return errorResponse('Scan is not completed yet', 400, {}, cors);
  }

  const apiKey = Netlify.env.get('PERPLEXITY_API_KEY');
  if (!apiKey) {
    return errorResponse('Server misconfigured: PERPLEXITY_API_KEY not set', 500, {}, cors);
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
    return jsonResponse({ ok: true, scan: toScanPayload(updated[0]) }, { cors });
  } catch (err) {
    return jsonResponse({ ok: false, error: (err as Error).message }, { cors });
  }
};

export const config: Config = {
  path: '/scans/:id/deep-advice',
};
