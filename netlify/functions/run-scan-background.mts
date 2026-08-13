// Does the actual scan (5 prompts x 4 models = 20 calls as of 2026-08-13 —
// see aivis-core.mjs's PROMPT_TEMPLATES/MODELS comments for the full model
// history, and this file's CONCURRENCY_LIMIT comment below for why the
// hosted site uses a 5-prompt SLICE of the 10-prompt PROMPT_TEMPLATES array
// while proof-script always runs the full 10) after being triggered by
// scan.mts. Background Functions get up to 15 minutes of wall-clock time
// and Netlify returns 202 to the trigger immediately, so this can safely
// take the several minutes real Perplexity calls (sequential, with
// retries) need — the constraint that forced the old /scan to stay
// synchronous-and-tight-timeout no longer applies.
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
//
// 2026-08-13: CONCURRENCY_LIMIT went 10 -> 4 earlier the same day after a
// live incident (16-18 of 20 calls failing with HTTP 429 on real scans).
// Turned out 4 was ALSO still wrong — a deliberate smoke test (bursts of
// 2-4 concurrent calls, including across different providers) found
// Perplexity's real per-key concurrency limit is ~1: every burst above
// size 1 failed 50-83% of the time, while fully sequential calls succeeded
// 100%. CONCURRENCY_LIMIT is now 1 (see aivis-core.mjs's MODELS comment for
// the full smoke-test writeup). Sequential-only makes each additional call
// directly add to wall-clock time with no parallelism to hide it behind, so
// growing MODELS from 2 to 4 the same day would have pushed a 10-prompt
// scan to ~13 minutes — the hosted site's scanPrompts below was cut to a
// 5-prompt slice specifically to keep total calls (and thus wall-clock
// time) roughly where it was before this change (20 calls either way),
// rather than the 10-prompt set growing scans to 40 calls. proof-script
// isn't latency-constrained the same way (no live user polling a browser
// tab) and keeps using the full PROMPT_TEMPLATES set.
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
import { sendScanCompleteEmail } from './_shared/email.mts';

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

  // Was PROMPT_TEMPLATES.slice(0, 3), then the full 10-prompt set once
  // Milestone 0's synchronous-timeout constraint was gone (see
  // aivis-core.mjs comment). Cut to a 5-prompt slice on 2026-08-13 when
  // MODELS grew from 2 to 4 — with CONCURRENCY_LIMIT now 1 (see below),
  // wall-clock time is call-count-bound with no parallelism to absorb it,
  // so this keeps total calls at 20 (same as before the model expansion)
  // instead of letting the full 10-prompt set push a scan to 40 calls.
  const scanPrompts = PROMPT_TEMPLATES.slice(0, 5);
  const CALL_TIMEOUT_MS = 60000;
  // Was 10 — live scans (TSMC, Google LLC, Hotel De Nara, 2026-08-13) showed
  // 16-18 of 20 calls failing with HTTP 429 request_rate_limit_exceeded,
  // because a burst of 10 simultaneous calls exceeded this key's actual
  // Perplexity rate limit (this was flagged as untested against that limit
  // when concurrency was first added — see aivis-core.mjs's
  // runWithConcurrency comment; now it's been tested, and 10 was too high).
  // Dropped to 4 the same day to keep the burst well under the limit.
  //
  // Turned out 4 was ALSO too high — a deliberate smoke test the same day
  // (see aivis-core.mjs's MODELS comment) found bursts of even 2-4
  // concurrent calls fail 50-83% of the time, across any provider mix,
  // while fully sequential calls succeed 100%. This key's real concurrency
  // limit is ~1. Dropped to 1 — scans are now fully sequential, no
  // in-flight overlap at all. The rate-limit-specific backoff in
  // callModelWithRetry (aivis-core.mjs) and the 3rd retry attempt below
  // stay in place as a safety net for transient failures, but shouldn't be
  // needed for rate-limiting specifically anymore since there's no overlap
  // left to trip it.
  const CONCURRENCY_LIMIT = 1;
  // Was 100000, then 120000 (same-day intermediate fix, see above). Raised
  // further to 600000 (10 min) for fully-sequential 20-call scans — at
  // ~15-25s/call happy-path that's ~5-8 min, plus real headroom for
  // per-call retries, while staying well under Background Functions' 15-min
  // (900000ms) platform ceiling. Multi-minute scans are only acceptable if
  // a user isn't expected to sit and watch one run in the browser — a
  // scan-complete notification (email/etc.) is planned separately to make
  // that true; until it ships, `CompanyDetailView.vue`'s live polling UI is
  // this feature's actual UX, and it now takes several minutes.
  const SCAN_DEADLINE_MS = 600000;
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
        // maxAttempts 2 -> 3: gives a call that hits a rate limit twice one
        // more shot after the longer rate-limit backoff (aivis-core.mjs),
        // instead of giving up right as the limit window is clearing.
        const result = await callModelWithRetry(apiKey, task.model, task.prompt, CALL_TIMEOUT_MS, 3, deadline.signal);
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

  let finalStatus: 'completed' | 'failed' = 'completed';
  let finalScore: number | null = null;
  try {
    const agg = aggregateProspect(prospect, callResults);
    const score = computeScore(agg.perPromptRank, agg.completedCalls);
    const advice = selectAdvice(agg);
    finalScore = score;

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
    finalStatus = 'failed';
    console.error(`run-scan-background: failed to finalize scan ${scanId}:`, err);
    await db`
      UPDATE public.scans SET status = 'failed', error_message = ${(err as Error).message}
      WHERE id = ${scanId}
    `;
  }

  // Scan-complete notification — added 2026-08-13 because a scan now takes
  // 5-8 minutes (see CONCURRENCY_LIMIT comment above), too long for a user
  // to reasonably sit and watch in the browser. Best-effort: a failed email
  // send is logged but never changes the scan's own already-persisted
  // status above — the scan itself succeeded or failed independently of
  // whether we could tell anyone about it.
  try {
    const owners = await db`
      SELECT u.email FROM neon_auth."user" u
      JOIN public.companies c ON c.owner_user_id = u.id
      WHERE c.id = ${scanRow.company_id}
    `;
    if (owners.length > 0) {
      const origin = new URL(req.url).origin;
      const result = await sendScanCompleteEmail({
        to: owners[0].email,
        brand: company.brand,
        companyUrl: `${origin}/app/companies/${scanRow.company_id}`,
        status: finalStatus,
        score: finalScore,
      });
      if (!result.ok) {
        console.error(`run-scan-background: scan-complete email failed for scan ${scanId}: ${result.error}`);
      }
    }
  } catch (err) {
    console.error(`run-scan-background: scan-complete email lookup failed for scan ${scanId}:`, err);
  }
};

export const config: Config = {
  path: '/run-scan-background',
};
