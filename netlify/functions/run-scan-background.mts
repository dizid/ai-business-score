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
  promptTemplatesForLanguage,
  MODELS,
  callModel,
  callModelWithRetry,
  runWithConcurrency,
  aggregateProspect,
  computeScore,
  selectAdvice,
  buildSentimentJudgePrompt,
  parseSentimentJudgeResponse,
} from '../../shared/aivis-core.mjs';
import { analyzeHarmonia } from '../../shared/harmonia.mjs';
import { analyzeEntityPresence } from '../../shared/entityPresence.mjs';
import { sql } from './_shared/db.mts';
import { sendScanCompleteEmail, sendScoreRegressionEmail } from './_shared/email.mts';
import { REGRESSION_ALERT_THRESHOLD } from './_shared/plan.mts';
import { getPreviousCompletedScore } from './_shared/scoreHistory.mts';

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
    UPDATE public.scans SET status = 'running', started_at = now(), progress = '{"completed":0,"total":0,"currentModels":[]}'
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

  // 2026-08-15 direct-provider migration (see aivis-core.mjs's callModel
  // comment for the full story): anthropic/google/xai models now call each
  // provider's own API directly instead of all going through one Perplexity
  // gateway key. A single missing key no longer fails the whole scan — it
  // fails only the calls for that one provider's model (callModel throws a
  // clear per-model error), same "skip and count separately" shape as any
  // other call failure. The scan only refuses to start if literally none of
  // the 5 keys are configured.
  // openai (added 2026-08-25): direct call attempted only if OPENAI_API_KEY
  // is actually set — callModel falls back to the Perplexity gateway
  // automatically if not, so this is safe to ship ahead of the key existing.
  const apiKeys = {
    perplexity: Netlify.env.get('PERPLEXITY_API_KEY'),
    anthropic: Netlify.env.get('ANTHROPIC_API_KEY'),
    google: Netlify.env.get('GOOGLE_API_KEY'),
    xai: Netlify.env.get('XAI_API_KEY'),
    openai: Netlify.env.get('OPENAI_API_KEY'),
  };
  // PageSpeed Insights, for the Harmonia audit's UX Signals pillar below.
  // Tries a dedicated key first, falls back to reusing GOOGLE_API_KEY (same
  // GCP project already used for google/gemini-3-flash-preview) if the
  // PageSpeed Insights API turns out to be enabled there too. Either way,
  // a missing/invalid key only nulls the UX Signals pillar — see
  // harmonia.mjs's fetchCoreWebVitals, never fails the scan.
  const psiApiKey = Netlify.env.get('GOOGLE_PAGESPEED_API_KEY') || apiKeys.google;
  if (!apiKeys.perplexity && !apiKeys.anthropic && !apiKeys.google && !apiKeys.xai && !apiKeys.openai) {
    await db`
      UPDATE public.scans SET status = 'failed', error_message = 'Server misconfigured: no model API keys set'
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

  // Kicked off here, awaited alongside the LLM call loop below (not
  // serialized into it) — analyzeHarmonia is a plain HTTP fetch chain (the
  // scanned site's own homepage/robots.txt/sitemap.xml, plus PageSpeed
  // Insights), with no Perplexity-rate-limit interaction at all, so it's
  // safe to run concurrently. Its own internal budget (~60s worst case,
  // see harmonia.mjs's per-step timeouts) finishes well inside the LLM
  // loop's typical 5-8 minute runtime, so it adds no measurable wall-clock
  // time to the scan. Never throws — see harmonia.mjs's module comment.
  const harmoniaPromise = analyzeHarmonia(prospect, psiApiKey);
  // Same reasoning as harmoniaPromise above — a plain HTTP fetch chain
  // (Wikipedia's public API, no key needed) with no Perplexity-rate-limit
  // interaction, safe to run concurrently. Never throws — see
  // entityPresence.mjs's module comment.
  const entityPresencePromise = analyzeEntityPresence(prospect.brand, prospect.website);

  // Was PROMPT_TEMPLATES.slice(0, 3), then the full 10-prompt set once
  // Milestone 0's synchronous-timeout constraint was gone (see
  // aivis-core.mjs comment). Cut to a 5-prompt slice on 2026-08-13 when
  // MODELS grew from 2 to 4 — with CONCURRENCY_LIMIT now 1 (see below),
  // wall-clock time is call-count-bound with no parallelism to absorb it,
  // so this keeps total calls at 20 (same as before the model expansion)
  // instead of letting the full 10-prompt set push a scan to 40 calls.
  // Language-aware since Milestone C3 (English + Dutch) — company.language
  // is nullable (older/unset companies), treated as English. Same 5-of-10
  // slice regardless of language: this is a call-budget constraint, not a
  // language-specific one.
  const scanPrompts = promptTemplatesForLanguage(company.language ?? 'en').slice(0, 5);
  const CALL_TIMEOUT_MS = 60000;
  // xai/grok-4.6 gets its own longer per-call timeout — root-caused
  // 2026-08-17 (docs/grok-timeout-investigation.md) from a production
  // screenshot showing all 5 of a scan's xai calls failing with "Timed out
  // after 60000ms waiting for xai/grok-4.6". aivis-core.mjs's MODELS
  // comment already documents Grok as structurally slower than the other
  // three (30-50s+ typical, agentic multi-round web search vs. a single
  // lookup) — its normal-case latency already brushes the flat 60s
  // CALL_TIMEOUT_MS, so a meaningful fraction of calls tip over it even
  // with nothing actually wrong. 100s gives real margin over that
  // documented range without loosening the timeout for the other three
  // models, which don't need it. Not yet live-verified against a full
  // production scan (no provider API keys available in this environment,
  // same blocker the investigation doc hit) — worth confirming with one
  // timed live scan per this codebase's own "verify live before trusting"
  // discipline.
  const CALL_TIMEOUT_MS_BY_MODEL: Record<string, number> = {
    'xai/grok-4.6': 100000,
  };
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
  //
  // 2026-08-2X: all three incidents above were about concurrent calls
  // hitting Perplexity's single gateway key specifically. Since the
  // 2026-08-15 direct-provider migration (aivis-core.mjs's callModel
  // comment), anthropic/google/xai each call their own independent provider
  // API and no longer share that key or its rate limit — only
  // openai/gpt-5-mini still goes through the Perplexity gateway. Tasks are
  // partitioned by provider below and each provider's own lane runs at its
  // own limit (no single provider's key ever sees more than its own lane's
  // concurrent requests), while the lanes themselves run in parallel with
  // each other via Promise.all.
  //
  // 2026-08-23: went from one flat CONCURRENCY_LIMIT to a per-provider map.
  // `openai` stays 1, unchanged — this is the Perplexity gateway lane,
  // proven fragile across all three incidents above; not touched by this
  // change. `anthropic`/`google` bumped to 3 — both call independent,
  // directly-provisioned APIs with no shared-gateway history of trouble;
  // reasoned relative to typical per-project rate-limit tiers, not
  // confirmed against this project's actual configured-key tier. `xai`
  // bumped to only 2 (not 3) — Grok is documented elsewhere in this file as
  // structurally slower (30-50s+/call, agentic multi-round search) and has
  // the shortest production track record of the three direct-API lanes; a
  // smaller bump limits how many simultaneously-open, long-running requests
  // are in flight if something goes wrong mid-request. `DEFAULT_PROVIDER_CONCURRENCY`
  // covers any provider added to MODELS later without an explicit entry —
  // defaults to the proven-safe value (1) rather than assuming a new
  // provider can handle more. None of this is live-verified with a real
  // timed scan yet — see this file's own "verify live before trusting"
  // discipline; do one live-triggered scan (not proof-script) and check
  // scans.failures for a 429 spike before treating this as validated, and
  // roll a provider back toward 1 immediately if one appears.
  // 2026-08-26: `openai` raised 1 -> 3. It was left at 1 during the
  // 2026-08-23 change above because at the time it was still the Perplexity
  // gateway lane. Since 2026-08-25 (OPENAI_API_KEY live, see callModel's
  // 'openai' case in aivis-core.mjs), gpt-5-mini calls OpenAI's own API
  // directly and no longer shares Perplexity's fragile ~1-concurrent limit —
  // the 2026-08-23 note above even flagged this lane as "still the
  // wall-clock bottleneck" for getting scans under 2 minutes, but nobody had
  // re-tested the cap against the new direct-API routing until now.
  // **Live-verified same day**: a throwaway script (`callModel` directly,
  // real `OPENAI_API_KEY`, not committed) ran burst sizes 1/2/3 against
  // `openai/gpt-5-mini`, 3 rounds each at sizes 2 and 3 — 16/16 calls
  // succeeded (100%), including 9/9 at burst size 3, with no latency
  // degradation (each call still ~25-40s, consistent with gpt-5-mini's known
  // per-call range). Raised to 3, matching anthropic/google — a scan only
  // ever makes 5 openai calls (5-prompt slice x 1 model), so this collapses
  // that lane from 5 sequential calls to roughly 2 concurrent batches.
  // Not yet confirmed against a full production 20-call scan's real
  // `scans.failures` — do that once before treating this as fully settled,
  // same "verify live before trusting" discipline as every provider/
  // concurrency change in this file's history; roll back to 1 immediately
  // if a 429 (or any new failure pattern) appears on the openai lane.
  const DEFAULT_PROVIDER_CONCURRENCY = 1;
  const CONCURRENCY_LIMIT_BY_PROVIDER: Record<string, number> = {
    openai: 3,
    anthropic: 3,
    google: 3,
    xai: 2,
  };
  // Was 100000, then 120000 (same-day intermediate fix, see above). Raised
  // further to 600000 (10 min) for fully-sequential 20-call scans — at
  // ~15-25s/call happy-path that's ~5-8 min, plus real headroom for
  // per-call retries, while staying well under Background Functions' 15-min
  // (900000ms) platform ceiling. Multi-minute scans are only acceptable if
  // a user isn't expected to sit and watch one run in the browser — a
  // scan-complete notification (email/etc.) is planned separately to make
  // that true; until it ships, `CompanyDetailView.vue`'s live polling UI is
  // this feature's actual UX, and it now takes several minutes.
  // Was 600000 (10 min). Bumped modestly alongside the per-model xai
  // timeout above (2026-08-17): raising one model's CALL_TIMEOUT_MS from
  // 60000 to 100000 without also giving the overall scan more room would
  // shrink, not grow, the deadline's margin for xai's own 5 calls (queued
  // last under model-major ordering — see below), since each of those
  // calls can now legitimately run longer before this file gives up on it.
  // 720000 (12 min) stays comfortably under Background Functions' 900000ms
  // (15 min) platform ceiling while adding 2 min of headroom. Like the
  // timeout change above, this is a reasoned bump, not a live-verified one
  // — no provider API keys were available in this environment to run a
  // timed scan and confirm the actual number needed.
  const SCAN_DEADLINE_MS = 720000;
  // Queued model-major (all prompts for model 1, then all prompts for model
  // 2, ...) rather than prompt-major, as of 2026-08-17. Under
  // CONCURRENCY_LIMIT=1 this doesn't change total sequential time, but it
  // changes WHICH calls get starved if the shared deadline fires partway
  // through: prompt-major ordering meant a single slow/timed-out call for
  // one model sat directly in front of the OTHER three models' calls for
  // that same prompt, so real production scans were losing openai/google/
  // anthropic checks to "scan deadline exceeded before this check started"
  // purely because they happened to queue behind a struggling xai/grok-4.6
  // call (see TODOS.md's 2026-08-14 cascading-timeout entry, and
  // callModelWithRetry's comment in aivis-core.mjs for the same-day
  // no-retry-on-timeout fix). MODELS' existing order (openai, google,
  // anthropic, xai) already puts xai/grok-4.6 — the one model with
  // documented 30-50s+ typical latency, per aivis-core.mjs's MODELS comment
  // — last, so model-major queueing means a slow xai run can only eat into
  // xai's own remaining checks instead of starving faster providers that
  // would otherwise have completed fine.
  const tasks: { prompt: string; model: string; promptIndex: number }[] = [];
  for (const model of MODELS) {
    for (const [promptIndex, template] of scanPrompts.entries()) {
      tasks.push({ prompt: template(prospect), model, promptIndex });
    }
  }

  // Live progress for the polling UI (roadmap doc's "stream scan progress
  // instead of poll-and-wait" — CompanyDetailView.vue previously showed a
  // static "Running checks (~5-8 min)…" for the whole scan with no signal
  // of what's actually happening). `progress.completed` counts tasks that
  // have finished running, success OR failure — deliberately distinct from
  // `scans.completed_calls` (set once at the end, and success-only).
  // Best-effort: a failed progress write is logged but never affects the
  // scan itself, same "don't let a nice-to-have break the actual work"
  // pattern as the scan-complete email below.
  //
  // Now that provider lanes run concurrently (see CONCURRENCY_LIMIT_BY_PROVIDER
  // above), more than one call can be in flight at once, so `currentModel: string`
  // became `currentModels: string[]`, and `completed` can no longer be a
  // plain JS counter written into a client-computed snapshot — two lanes'
  // writes could reach the DB out of order and a later write carrying a
  // stale, smaller count would silently regress the visible progress. Fixed
  // by computing `completed` as an atomic SQL increment off whatever value
  // is currently stored (`coalesce((progress->>'completed')::int, 0) + N`)
  // rather than a value read-then-written from JS — monotonic regardless of
  // write ordering. `inFlightModels` itself (a plain JS `Set`) has no such
  // race: JS is single-threaded, so `Set` mutations across concurrently-
  // awaited calls never interleave mid-operation.
  const inFlightModels = new Set<string>();
  async function writeProgress(increment: number) {
    try {
      await db`
        UPDATE public.scans
        SET progress = jsonb_set(
          jsonb_set(
            jsonb_set(coalesce(progress, '{}'::jsonb), '{completed}', to_jsonb(coalesce((progress->>'completed')::int, 0) + ${increment})),
            '{currentModels}', ${JSON.stringify(Array.from(inFlightModels))}::jsonb
          ),
          '{total}', to_jsonb(${tasks.length})
        )
        WHERE id = ${scanId}
      `;
    } catch (err) {
      console.error(`run-scan-background: progress update failed for scan ${scanId}:`, err);
    }
  }

  // Sourced from the DB's own `started_at` (set atomically by the claim
  // UPDATE above via `now()`), not a fresh `Date.now()` here — avoids any
  // clock-skew between this function container's clock and Neon's server
  // clock, and doubles as the persisted timestamp `ScanDetail.vue` uses to
  // show "scan completed in Xm Ys" once the scan finishes. Still lines up
  // with exactly what SCAN_DEADLINE_MS has always bounded — the claim/
  // company-lookup/harmonia-kickoff steps above take negligible time.
  const scanStartTime = new Date(scanRow.started_at).getTime();
  const deadline = new AbortController();
  const deadlineTimer = setTimeout(() => deadline.abort(), SCAN_DEADLINE_MS);
  // Partition into one lane per provider (the string before "/" in each
  // model id — "openai", "google", "anthropic", "xai") so each provider's
  // own calls stay bounded by its own CONCURRENCY_LIMIT_BY_PROVIDER entry
  // while the lanes themselves run in parallel via Promise.all below — see
  // that constant's comment above for why this is safe. Grouping by
  // provider rather than by exact model string future-proofs this against
  // a provider ever gaining a second model in MODELS.
  const tasksByProvider = new Map<string, typeof tasks>();
  for (const task of tasks) {
    const provider = task.model.split('/')[0];
    const group = tasksByProvider.get(provider);
    if (group) group.push(task);
    else tasksByProvider.set(provider, [task]);
  }

  const worker = async (task: { prompt: string; model: string; promptIndex: number }) => {
    // A task pulled off the queue after the deadline already fired (can
    // happen if earlier calls in its lane ran long) — skip the network call
    // entirely rather than starting work that would just be aborted
    // immediately. No progress write here deliberately (same as before):
    // once the deadline's firing, the scan is wrapping up regardless.
    if (deadline.signal.aborted) {
      return { ok: false, error: 'Scan deadline exceeded before this check started', model: task.model, promptIndex: task.promptIndex };
    }
    inFlightModels.add(task.model);
    await writeProgress(0);
    try {
      // maxAttempts 2 -> 3: gives a call that hits a rate limit twice one
      // more shot after the longer rate-limit backoff (aivis-core.mjs),
      // instead of giving up right as the limit window is clearing.
      const timeoutMs = CALL_TIMEOUT_MS_BY_MODEL[task.model] ?? CALL_TIMEOUT_MS;
      const result = await callModelWithRetry(apiKeys, task.model, task.prompt, timeoutMs, 3, deadline.signal);
      inFlightModels.delete(task.model);
      await writeProgress(1);
      return { ok: true, ...result, model: task.model, promptIndex: task.promptIndex };
    } catch (err) {
      inFlightModels.delete(task.model);
      await writeProgress(1);
      const message = (err as Error).message;
      console.error(
        `Scan call failed [scan ${scanId}, prompt ${task.promptIndex}, ${task.model}]: ${message}`
      );
      return { ok: false, error: message, model: task.model, promptIndex: task.promptIndex };
    }
  };

  let callResults;
  try {
    const perLaneResults = await Promise.all(
      Array.from(tasksByProvider.entries()).map(([provider, providerTasks]) =>
        runWithConcurrency(providerTasks, CONCURRENCY_LIMIT_BY_PROVIDER[provider] ?? DEFAULT_PROVIDER_CONCURRENCY, worker)
      )
    );
    callResults = perLaneResults.flat();
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

    // harmoniaPromise never throws (see harmonia.mjs's module comment), but
    // guarded anyway — this is a best-effort secondary score and must never
    // take down the primary AI Visibility Score finalization below it.
    const harmonia = await harmoniaPromise.catch((err) => {
      console.error(`run-scan-background: Harmonia analysis failed for scan ${scanId}:`, err);
      return null;
    });
    // entityPresencePromise never throws (see entityPresence.mjs's module
    // comment), same defensive .catch() as harmoniaPromise above anyway.
    const entityPresence = await entityPresencePromise.catch((err) => {
      console.error(`run-scan-background: entity presence check failed for scan ${scanId}:`, err);
      return null;
    });

    // Auto-judge sentiment for every mention (Milestone F, extended
    // 2026-08-20 — was on-demand/manual-only, see aivis-core.mjs's comment
    // above buildSentimentJudgePrompt for the full history and why this
    // used to be deliberately excluded from the automatic pipeline).
    // Bounded to whatever's left of SCAN_DEADLINE_MS after the main loop
    // above via a second AbortController timed to the remainder — NOT a
    // fresh budget on top — so a slow scan just auto-judges fewer checks
    // instead of risking a repeat of the 2026-08-13 concurrency incident.
    // Checks this pass doesn't reach in time still have the manual "Judge
    // sentiment" button in ScanDetail.vue as a fallback — it only renders
    // when no judgment exists yet for that check, so no frontend change
    // was needed for that fallback to keep working.
    const sentimentTargets = agg.rawResponses
      .map((r: { promptIndex: number; model: string; text: string }, i: number) => ({
        promptIndex: r.promptIndex,
        model: r.model,
        text: r.text,
        rank: agg.perPromptRank[i]?.rank ?? 'not-mentioned',
      }))
      .filter((r: { rank: string }) => r.rank !== 'not-mentioned');
    const sentimentJudgments: { promptIndex: number; model: string; classification: string; reasoning: string }[] = [];
    const sentimentRemainingMs = SCAN_DEADLINE_MS - (Date.now() - scanStartTime);
    if (sentimentTargets.length > 0 && sentimentRemainingMs > 5000) {
      const sentimentDeadline = new AbortController();
      const sentimentTimer = setTimeout(() => sentimentDeadline.abort(), sentimentRemainingMs);
      try {
        // Pinned to the openai lane's own limit regardless of which
        // provider produced the original mention — this pass always calls
        // openai/gpt-5-mini (below) via the Perplexity gateway, the one
        // lane CONCURRENCY_LIMIT_BY_PROVIDER deliberately leaves at 1.
        await runWithConcurrency(sentimentTargets, CONCURRENCY_LIMIT_BY_PROVIDER.openai, async (target: { promptIndex: number; model: string; text: string }) => {
          if (sentimentDeadline.signal.aborted) return;
          try {
            const prompt = buildSentimentJudgePrompt(prospect.brand, target.text);
            // Same model/timeout as judge-sentiment.mts's manual endpoint —
            // keeps the existing 5-example calibration (shared/CLAUDE.md's
            // "Sentiment judge" section) valid for this automatic pass too.
            const result = await callModel(apiKeys, 'openai/gpt-5-mini', prompt, 20000, sentimentDeadline.signal);
            const judgment = parseSentimentJudgeResponse(result.text);
            sentimentJudgments.push({ promptIndex: target.promptIndex, model: target.model, ...judgment });
          } catch (err) {
            console.error(
              `run-scan-background: sentiment judge failed [scan ${scanId}, prompt ${target.promptIndex}, ${target.model}]:`,
              (err as Error).message
            );
          }
        });
      } finally {
        clearTimeout(sentimentTimer);
      }
    }

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
        own_site_citations = ${JSON.stringify(agg.ownSiteCitations)},
        sentiment_judgments = ${JSON.stringify(sentimentJudgments)},
        score = ${score},
        advice = ${JSON.stringify(advice)},
        harmonia = ${harmonia ? JSON.stringify(harmonia) : null},
        entity_presence = ${entityPresence ? JSON.stringify(entityPresence) : null},
        generated_at = now()
      WHERE id = ${scanId}
    `;
    // Operator-visible duration line (Netlify function logs) — a JS-side
    // approximation, fine for a log line but not the source of truth. The
    // authoritative, persisted duration is always `generated_at - started_at`
    // (both DB timestamps), computed downstream in scanRow.mts/ScanDetail.vue
    // rather than stored a third time here.
    console.log(`run-scan-background: scan ${scanId} completed in ${((Date.now() - scanStartTime) / 1000).toFixed(1)}s`);
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
      // Most recent PRIOR completed scan's score, for the "your score
      // changed" line in the email — excludes this scan itself so a
      // company's very first scan correctly has nothing to compare against.
      let previousScore: number | null = null;
      if (finalStatus === 'completed') {
        previousScore = await getPreviousCompletedScore(db, scanRow.company_id, scanId);
      }

      const origin = new URL(req.url).origin;
      const companyUrl = `${origin}/app/companies/${scanRow.company_id}`;
      const result = await sendScanCompleteEmail({
        to: owners[0].email,
        brand: company.brand,
        companyUrl,
        status: finalStatus,
        score: finalScore,
        previousScore,
      });
      if (!result.ok) {
        console.error(`run-scan-background: scan-complete email failed for scan ${scanId}: ${result.error}`);
      }

      // Regression alert — additive to the routine email above, not a
      // replacement (see sendScoreRegressionEmail's own comment). Applies
      // regardless of trigger_source: a manual re-scan that regresses is
      // just as worth flagging as a scheduled one.
      if (
        finalStatus === 'completed' &&
        finalScore !== null &&
        previousScore !== null &&
        previousScore - finalScore >= REGRESSION_ALERT_THRESHOLD
      ) {
        const regressionResult = await sendScoreRegressionEmail({
          to: owners[0].email,
          brand: company.brand,
          companyUrl,
          score: finalScore,
          previousScore,
        });
        if (!regressionResult.ok) {
          console.error(`run-scan-background: regression alert email failed for scan ${scanId}: ${regressionResult.error}`);
        }

        // Persist the regression as a row too, not just an email — added
        // for the portfolio dashboard's "Alerts" section
        // (CompaniesListView.vue), since the email alone is invisible until
        // someone opens their inbox.
        try {
          await db`
            INSERT INTO public.score_alerts (company_id, scan_id, prior_score, new_score, delta)
            VALUES (${scanRow.company_id}, ${scanId}, ${previousScore}, ${finalScore}, ${finalScore - previousScore})
          `;
        } catch (err) {
          console.error(`run-scan-background: score_alerts insert failed for scan ${scanId}:`, err);
        }
      }
    }
  } catch (err) {
    console.error(`run-scan-background: scan-complete email lookup failed for scan ${scanId}:`, err);
  }
};

export const config: Config = {
  path: '/run-scan-background',
};
