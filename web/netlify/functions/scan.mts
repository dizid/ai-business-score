// AIVis hosted scan — Approach B from the office-hours design doc.
// Founder-facing form (not public self-serve): runs a live check and
// redirects to a shareable result page with the data encoded in the URL
// itself. No DB — the result page never re-computes or re-calls the API, so
// repeated views of the same link always show the same (already-computed)
// result. This also sidesteps the LLM-nondeterminism/credibility risk raised
// during /plan-eng-review: two visits to the same URL can't disagree.
//
// Gated by SCAN_PASSPHRASE (a Netlify env var, not a real auth system) so a
// public POST endpoint that costs real money per call can't be hit by bots.

import type { Config } from '@netlify/functions';
import {
  PROMPT_TEMPLATES,
  MODELS,
  callModel,
  aggregateProspect,
  computeScore,
  selectAdvice,
  missingProspectFields,
  normalizeUrl,
} from '../../shared/aivis-core.mjs';

declare const Netlify: { env: { get(key: string): string | undefined } };

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const form = await req.formData();
  const passphrase = (form.get('passphrase') as string) || '';
  const expectedPassphrase = Netlify.env.get('SCAN_PASSPHRASE');
  if (!expectedPassphrase || passphrase !== expectedPassphrase) {
    return new Response('Forbidden — wrong or missing passphrase', { status: 403 });
  }

  const prospect = {
    brand: ((form.get('brand') as string) || '').trim(),
    website: ((form.get('website') as string) || '').trim(),
    competitors: ((form.get('competitors') as string) || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    category: ((form.get('category') as string) || '').trim(),
    use_case: ((form.get('use_case') as string) || '').trim(),
    region: ((form.get('region') as string) || '').trim(),
    customer_segment: ((form.get('customer_segment') as string) || '').trim(),
  };

  const missing = missingProspectFields(prospect);
  if (missing.length) {
    return new Response(`Missing fields: ${missing.join(', ')}`, { status: 400 });
  }

  const apiKey = Netlify.env.get('PERPLEXITY_API_KEY');
  if (!apiKey) {
    return new Response('Server misconfigured: PERPLEXITY_API_KEY not set', { status: 500 });
  }

  // Free-scan tier: 3 prompts x 2 models = 6 checks — smaller than the local
  // proof-script's 8x2=16. Real grounded Perplexity calls with web_search
  // took 15-20s each in live testing (not the near-instant "reply OK" smoke
  // test) — 5x2=10 calls hit a gateway "Inactivity Timeout"; 1x2=2 calls at
  // ~20s succeeded. Each call gets a hard per-call timeout so one especially
  // slow call can't blow the whole request past whatever the real ceiling is.
  const scanPrompts = PROMPT_TEMPLATES.slice(0, 3);
  const CALL_TIMEOUT_MS = 20000;
  const tasks: { prompt: string; model: string; promptIndex: number }[] = [];
  for (const [promptIndex, template] of scanPrompts.entries()) {
    const prompt = template(prospect);
    for (const model of MODELS) {
      tasks.push({ prompt, model, promptIndex });
    }
  }

  const callResults = await Promise.all(
    tasks.map(async (task) => {
      try {
        const result = await callModel(apiKey, task.model, task.prompt, CALL_TIMEOUT_MS);
        return { ok: true, ...result, model: task.model, promptIndex: task.promptIndex };
      } catch (err) {
        return { ok: false, error: (err as Error).message, model: task.model, promptIndex: task.promptIndex };
      }
    })
  );

  // Score/advice are pure, synchronous, in-memory computations on `agg` —
  // no new API calls, no added latency. Do not add a live "advice" LLM call
  // here: it would need these aggregated results as input, so it couldn't
  // join the Promise.all batch above — it would add a full sequential
  // 15-20s+ on top of the timeout budget that was already tuned down once
  // (10 calls -> gateway timeout; 6 calls @ 20s/call -> works).
  const agg = aggregateProspect(prospect, callResults);
  const score = computeScore(agg.perPromptRank, agg.completedCalls);
  const advice = selectAdvice(agg);

  const payload = {
    brand: agg.prospect.brand,
    website: normalizeUrl(agg.prospect.website),
    category: agg.prospect.category,
    citedCount: agg.citedCount,
    completedCalls: agg.completedCalls,
    failedCalls: agg.failedCalls,
    ambiguousBrandFlag: agg.ambiguousBrandFlag,
    perPromptRank: agg.perPromptRank,
    competitorTallies: agg.competitorTallies,
    score,
    advice,
    rawResponses: agg.rawResponses,
    generatedAt: new Date().toISOString(),
  };

  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

  return new Response(null, {
    status: 302,
    headers: { Location: `/result.html#d=${encoded}` },
  });
};

export const config: Config = {
  path: '/scan',
};
