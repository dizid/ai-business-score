// Does the actual 6-call scan (unchanged logic from the old synchronous
// /scan) after being triggered by scan.mts. Background Functions get up to
// 15 minutes of wall-clock time and Netlify returns 202 to the trigger
// immediately, so this can safely take the full 20-30s real Perplexity
// calls need — the constraint that forced the old /scan to stay
// synchronous-and-tight-timeout no longer applies.
import type { Config } from '@netlify/functions';
import {
  PROMPT_TEMPLATES,
  MODELS,
  callModel,
  aggregateProspect,
  computeScore,
  selectAdvice,
} from '../../shared/aivis-core.mjs';
import { sql } from './_shared/db.mts';

declare const Netlify: { env: { get(key: string): string | undefined } };

export default async (req: Request) => {
  let scanId: string | undefined;
  try {
    ({ scanId } = (await req.json()) as { scanId?: string });
  } catch {
    console.error('run-scan-background: invalid JSON body');
    return;
  }
  if (!scanId) {
    console.error('run-scan-background: missing scanId');
    return;
  }

  const db = sql();

  // Atomic pending -> running transition: no-ops (and does no paid work) if
  // this scanId was already picked up, whether by a legitimate retry or a
  // duplicate trigger.
  const claimed = await db`
    UPDATE public.scans SET status = 'running'
    WHERE id = ${scanId} AND status = 'pending'
    RETURNING *
  `;
  if (claimed.length === 0) {
    console.error(`run-scan-background: scan ${scanId} not pending, skipping`);
    return;
  }
  const scanRow = claimed[0];

  const companies = await db`SELECT * FROM public.companies WHERE id = ${scanRow.company_id}`;
  if (companies.length === 0) {
    await db`
      UPDATE public.scans SET status = 'failed', error_message = 'Company no longer exists'
      WHERE id = ${scanId}
    `;
    return;
  }
  const company = companies[0];

  const apiKey = Netlify.env.get('PERPLEXITY_API_KEY');
  if (!apiKey) {
    await db`
      UPDATE public.scans SET status = 'failed', error_message = 'Server misconfigured: PERPLEXITY_API_KEY not set'
      WHERE id = ${scanId}
    `;
    return;
  }

  const prospect = {
    brand: company.brand,
    website: company.website,
    competitors: company.competitors || [],
    category: company.category,
    use_case: company.use_case,
    region: company.region,
    customer_segment: company.customer_segment,
  };

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
        const message = (err as Error).message;
        console.error(
          `Scan call failed [scan ${scanId}, prompt ${task.promptIndex}, ${task.model}]: ${message}`
        );
        return { ok: false, error: message, model: task.model, promptIndex: task.promptIndex };
      }
    })
  );

  try {
    const agg = aggregateProspect(prospect, callResults);
    const score = computeScore(agg.perPromptRank, agg.completedCalls);
    const advice = selectAdvice(agg);

    await db`
      UPDATE public.scans SET
        status = 'completed',
        cited_count = ${agg.citedCount},
        completed_calls = ${agg.completedCalls},
        failed_calls = ${agg.failedCalls},
        ambiguous_brand_flag = ${agg.ambiguousBrandFlag},
        per_prompt_rank = ${JSON.stringify(agg.perPromptRank)},
        competitor_tallies = ${JSON.stringify(agg.competitorTallies)},
        raw_responses = ${JSON.stringify(agg.rawResponses)},
        score = ${score},
        advice = ${JSON.stringify(advice)},
        generated_at = now()
      WHERE id = ${scanId}
    `;
  } catch (err) {
    console.error(`run-scan-background: failed to finalize scan ${scanId}:`, err);
    await db`
      UPDATE public.scans SET status = 'failed', error_message = ${(err as Error).message}
      WHERE id = ${scanId}
    `;
  }
};

export const config: Config = {
  path: '/run-scan-background',
};
