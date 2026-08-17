# AIVis — concurrency re-test + improvement roadmap

Written 2026-08-17, continuing from `docs/grok-timeout-investigation.md`.
That doc covers the `xai/grok-4.6` timeout root cause specifically; this one
covers the concurrency re-test raised as the top follow-up, plus a broader
set of improvement candidates discussed the same day.

## Concurrency re-test — highest priority, not yet run

**Why this matters**: `CONCURRENCY_LIMIT = 1` (`run-scan-background.mts`)
forces every one of a scan's 20 calls fully sequential, which is the main
reason a scan takes 5-10 minutes. That value was tuned 2026-08-13 against a
real incident — but at the time, *every* model routed through one
Perplexity gateway key, and the burst test that produced `CONCURRENCY_LIMIT
= 1` found Perplexity's own per-key concurrency limit is ~1.

Since the 2026-08-15 direct-provider migration, `anthropic/*`, `google/*`,
and `xai/*` call their own providers' APIs directly — they no longer share
Perplexity's rate limit with each other (only `openai/gpt-5-mini`, which has
no direct key, still goes through the Perplexity gateway). **Nobody has
re-tested whether these three independent providers can run concurrently
with each other.** If they can, raising concurrency for at least the
cross-provider portion of a scan could cut wall-clock time substantially —
for free, no new cost, no new integration.

**Status: blocked in this environment.** No provider API keys
(`PERPLEXITY_API_KEY`/`ANTHROPIC_API_KEY`/`GOOGLE_API_KEY`/`XAI_API_KEY`)
are available in this sandbox, so the test below has not actually been run
— same blocker as the model-candidate smoke test in the other doc. It needs
to be run by someone with real keys (locally, or wherever the Netlify env
vars are accessible) before anything is changed in code.

**Test script** (throwaway, not committed — matches this codebase's
established "smoke-test before trusting" pattern): calls
`anthropic/claude-haiku-4-5`, `google/gemini-3-flash-preview`, and
`xai/grok-4.6` sequentially, then again via `Promise.all`, and compares
success rate and wall-clock time.

```js
// Throwaway concurrency test — delete after use.
// Run: PERPLEXITY_API_KEY=... ANTHROPIC_API_KEY=... GOOGLE_API_KEY=... XAI_API_KEY=... node concurrency-test.mjs
import { callModel } from '../shared/aivis-core.mjs'; // adjust path as needed

const apiKeys = {
  perplexity: process.env.PERPLEXITY_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  google: process.env.GOOGLE_API_KEY,
  xai: process.env.XAI_API_KEY,
};

const prompt = "What's the best CRM software for small businesses?";
const models = ['anthropic/claude-haiku-4-5', 'google/gemini-3-flash-preview', 'xai/grok-4.6'];

async function timedCall(model) {
  const start = Date.now();
  try {
    const result = await callModel(apiKeys, model, prompt, 90000);
    return { model, ok: true, ms: Date.now() - start, citations: result.citations?.length ?? 0 };
  } catch (err) {
    return { model, ok: false, ms: Date.now() - start, error: err.message };
  }
}

function report(label, results, wallMs) {
  console.log(`\n--- ${label} (wall clock: ${wallMs}ms) ---`);
  for (const r of results) {
    console.log(
      r.ok
        ? `OK   ${r.model.padEnd(32)} ${String(r.ms).padStart(6)}ms  citations=${r.citations}`
        : `FAIL ${r.model.padEnd(32)} ${String(r.ms).padStart(6)}ms  ${r.error}`
    );
  }
}

// Sequential baseline (today's CONCURRENCY_LIMIT=1 behavior)
{
  const start = Date.now();
  const results = [];
  for (const model of models) results.push(await timedCall(model));
  report('SEQUENTIAL', results, Date.now() - start);
}

// Concurrent burst — the thing we actually want to know
{
  const start = Date.now();
  const results = await Promise.all(models.map(timedCall));
  report('CONCURRENT (Promise.all, 3 different providers)', results, Date.now() - start);
}

console.log(
  '\nIf CONCURRENT has the same success rate as SEQUENTIAL but a much lower wall-clock time, ' +
    'CONCURRENCY_LIMIT can likely be raised (at least for cross-provider batches) with no reliability cost.'
);
```

**Interpreting results / next step**: if the concurrent burst succeeds at
the same rate as sequential but finishes in roughly the time of the
slowest single call (rather than the sum of all three), `CONCURRENCY_LIMIT`
in `run-scan-background.mts` can likely be raised — at minimum for calls
targeting different providers, since `openai/gpt-5-mini` still shares
Perplexity's own ~1-concurrent limit and would need to stay serialized
relative to itself. Whoever runs this should repeat the burst 3-5x (not
just once) before trusting it, matching the repeated-burst methodology the
2026-08-13 incident write-up in `TODOS.md` already used, then log the
result there the same way.

## Other major improvement candidates

Grouped by what they'd actually move.

### Speed / UX
- **Stream scan progress instead of poll-and-wait.** The UI currently shows
  nothing until the whole scan finishes. Since calls run model-major, the
  backend already knows which model is "done/running/queued" at any point —
  surfacing that live would make a 5-10 minute wait feel very different
  even before the concurrency fix above lands.

### Product value
- **Scheduled/recurring scans.** Everything today is manual (`CompanyDetailView.vue`'s
  "Run new scan" button) — a user has to remember to re-scan. A real
  visibility-tracking product runs on a cadence and alerts on regressions
  ("your score dropped 20 points"), which is what actually justifies an
  ongoing subscription rather than a one-off check.
- **A dedicated competitor-benchmarking view.** `competitor_tallies` is
  already captured per scan (`shared/aivis-core.mjs`'s `aggregateProspect`)
  but there's no "you vs. your named competitors, over time" comparison
  screen. Likely the single most persuasive thing to show a prospect —
  "you're invisible, competitor X shows up in 8/10 queries."
- **Team/agency access.** `company_members` (added 2026-08-15) already
  exists as a schema-only scaffold — `company_id`/`member_user_id`/`role`,
  unique constraint — but nothing reads or writes it yet. Agencies tracking
  visibility for multiple clients are a natural buyer and can't share
  access today.

### Revenue
- **Gate deep advice.** It's free and unlimited today
  (`generate-deep-advice.mts`) despite costing roughly 2x normal Perplexity
  spend per use — a deliberate deferral (Milestone E in
  `PLAN_NEXT_PHASE.md`, waiting on a manual sales validation step), but a
  real leak once usage grows past that test.

### Reliability
- **An ops/failure-rate view across scans.** The only reason the
  `xai/grok-4.6` timeout pattern got noticed was a user screenshotting a
  single scan's failure detail. With 4 independent AI vendors now in the
  pipeline, there's no aggregate view of `scans.failures` across users/time
  — a simple dashboard or scheduled digest would catch the next
  single-provider degradation in hours instead of via a support ping.
- **Automated tests.** Explicitly deferred since before the SaaS pivot
  (`--dry-run` + `vue-tsc` + manual browser checks are the only checks that
  exist). The model/provider/retry/concurrency/scoring surface has grown a
  lot since that call was made — this repo's own commit history is largely
  a sequence of live-incident-then-hotfix cycles (429s, cascading timeouts,
  false-zero scoring bugs), which automated coverage on the scoring and
  retry logic specifically would have caught before production.

## Suggested priority order

1. Concurrency re-test (above) — cheap, reversible, directly fixes the
   latency pain that prompted this doc.
2. Streaming scan progress — cheap UX win, independent of #1.
3. Scheduled scans + regression alerts — biggest product-value lever for
   retention/subscription justification.
4. Competitor-benchmarking view — biggest lever for new-customer conviction.
5. Gate deep advice — revenue, once usage justifies it.
6. Team/agency access — opens a new buyer segment, bigger lift (invite
   flow, permission checks on top of the existing schema scaffold).
7. Ops/failure-rate visibility + automated tests — not glamorous, but the
   debt this repo's own incident history says is real.
