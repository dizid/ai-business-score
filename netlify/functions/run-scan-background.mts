// Does the actual scan (10 prompts x 2 models = 20 calls as of 2026-08-09,
// up from the original 3x2=6 — see aivis-core.mjs's PROMPT_TEMPLATES/MODELS
// comments for why) after being triggered by scan.mts. Background Functions
// get up to 15 minutes of wall-clock time and Netlify returns 202 to the
// trigger immediately, so this can safely take the full 20-60s real
// Perplexity calls (with retries) need — the constraint that forced the old
// /scan to stay synchronous-and-tight-timeout no longer applies.
//
// Two latency/reliability changes landed together on 2026-08-09 after a
// live user flagged firing all of a scan's calls at once (Promise.all, no
// concurrency cap) as a real risk once the call count grew — and separately
// reported that even the original 6-call scan already felt slow, which
// traces to one straggling call retrying with its own full timeoutMs budget
// dragging the whole Promise.all out (previously up to 3 attempts x 60s
// with zero backoff = up to 180s for one bad call, even though the other 5
// finished in 20s):
//   1. CONCURRENCY_LIMIT bounds how many calls are in flight at once,
//      instead of firing all `tasks.length` simultaneously — see
//      runWithConcurrency in aivis-core.mjs.
//   2. SCAN_DEADLINE_MS is a hard ceiling on the whole scan's wall-clock
//      time, shared across every call via one AbortController — this is
//      what actually bounds worst-case latency as prompt/model count grows,
//      not the per-call timeout alone (each call previously got its own
//      full budget regardless of how long the batch had already run).
//      Calls still in flight when the deadline fires are aborted and
//      counted as failed, same as any other failure.
import type { Config } from '@netlify/functions';
import {
  PROMPT_TEMPLATES,
  MODELS,
  callModelWithRetry,
  runWithConcurrency,
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
    // scanRow.website, not company.website: scan.mts resolves which of the
    // company's (possibly several) tracked URLs this specific scan targets
    // and snapshots it onto the scan row at creation time — using the
    // company's own website here would silently ignore that choice and
    // always scan the primary URL regardless of what was selected.
    website: scanRow.website,
    competitors: company.competitors || [],
    category: company.category,
    use_case: company.use_case,
    region: company.region,
    customer_segment: company.customer_segment,
  };

  // Was PROMPT_TEMPLATES.slice(0, 3) — the hosted site now runs the full
  // set, same as proof-script always has (see aivis-core.mjs comment).
  const scanPrompts = PROMPT_TEMPLATES;
  const CALL_TIMEOUT_MS = 60000;
  const CONCURRENCY_LIMIT = 10;
  const SCAN_DEADLINE_MS = 100000;
  const tasks: { prompt: string; model: string; promptIndex: number }[] = [];
  for (const [promptIndex, template] of scanPrompts.entries()) {
    const prompt = template(prospect);
    for (const model of MODELS) {
      tasks.push({ prompt, model, promptIndex });
    }
  }

  const deadline = new AbortController();
  const deadlineTimer = setTimeout(() => deadline.abort(), SCAN_DEADLINE_MS);
  let callResults;
  try {
    callResults = await runWithConcurrency(tasks, CONCURRENCY_LIMIT, async (task: { prompt: string; model: string; promptIndex: number }) => {
      // A task pulled off the queue after the deadline already fired (can
      // happen under CONCURRENCY_LIMIT if earlier calls in its worker slot
      // ran long) — skip the network call entirely rather than starting
      // work that would just be aborted immediately.
      if (deadline.signal.aborted) {
        return { ok: false, error: 'Scan deadline exceeded before this check started', model: task.model, promptIndex: task.promptIndex };
      }
      try {
        const result = await callModelWithRetry(apiKey, task.model, task.prompt, CALL_TIMEOUT_MS, 2, deadline.signal);
        return { ok: true, ...result, model: task.model, promptIndex: task.promptIndex };
      } catch (err) {
        const message = (err as Error).message;
        console.error(
          `Scan call failed [scan ${scanId}, prompt ${task.promptIndex}, ${task.model}]: ${message}`
        );
        return { ok: false, error: message, model: task.model, promptIndex: task.promptIndex };
      }
    });
  } finally {
    clearTimeout(deadlineTimer);
  }

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
        failures = ${JSON.stringify(agg.failures)},
        total_tokens = ${agg.totalTokens},
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
