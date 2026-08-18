# DEEPSEEK.md — AIVis further-implementation plan

Handoff document for continued implementation on the AIVis codebase
(`ai-business-score`). Read `TODOS.md`, `PLAN_NEXT_PHASE.md`, and
`docs/improvement-roadmap.md` / `docs/grok-timeout-investigation.md` for
full depth; this file is the prioritized, executable plan.

## 1. What this project is

AIVis (aivis-scan.netlify.app) is an AI-search-visibility SaaS: it scans a
company against 4 AI models (`openai/gpt-5-mini` via Perplexity gateway;
`anthropic/claude-haiku-4-5`, `google/gemini-3-flash-preview`,
`xai/grok-4.6` direct) with 5 grounded prompts = 20 calls per scan, scores
brand presence 0-100, tallies named competitors, and offers deep advice.

- **Stack**: Vue 3 SPA (`src/app/`), Netlify Functions (`netlify/functions/*.mts`,
  Background Functions for async scans), Neon Postgres, Neon Auth (Better
  Auth), Stripe subscription (Free vs Pro), Resend for scan-complete email.
- **Single source of truth**: `shared/aivis-core.mjs` (plain, untyped,
  zero-dep `.mjs` — prompts, `MODELS`, brand detection, scoring, retry
  logic). Must stay loadable by `proof-script/index.mjs`; additive-only
  changes, never rename/convert existing exports.
- **Scan execution**: `POST /scan` → pending row → Background Function
  (`run-scan-background.mts`) → frontend polls `GET /scans/:id` every 2s.
  `CONCURRENCY_LIMIT = 1` (sequential), `SCAN_DEADLINE_MS = 720000` (12 min,
  platform ceiling 900000), `CALL_TIMEOUT_MS = 60000` with 100000ms override
  for `xai/grok-4.6` (`CALL_TIMEOUT_MS_BY_MODEL`). Queue is model-major,
  `xai/grok-4.6` ordered last.

## 2. Current state (as of 2026-08-17)

- **Shipped but NOT live-verified**: per-model timeout for xai (100s),
  `SCAN_DEADLINE_MS` 600000→720000, streaming scan progress
  (`scans.progress jsonb` = `{completed, total, currentModel}` rendered by
  `CompanyDetailView.vue`'s `formatRunningStatus()`). Passed `npm run build`
  + `npm run test:run`; **no real provider API call has exercised it**.
- **Known architecture constraint**: `completedCount` in
  `run-scan-background.mts` is a plain JS counter, NOT an atomic SQL
  increment — safe only while `CONCURRENCY_LIMIT = 1`. Must change if
  concurrency is ever raised.
- **Recently shipped (verified live)**: Milestones A (correctness), B
  (leaderboard/multi-URL removal), C1/C2 (4-model mix + concurrency fix),
  D3/D4 (footer/legal, tech SEO), Pro fair-use cap
  (`PRO_PLAN_MONTHLY_SCAN_LIMIT = 20`), scan-complete email.
- **Open roadmap milestones**: C3 (locale-aware prompts), D1 (confirm raw
  data suffices — likely done, needs Marc), D2 (competitor depth), F
  (differentiation — partially built in code), E (monetization, gated on
  manual sales test), G (growth loop, gated on E).

## 3. Non-negotiable engineering disciplines

1. **Verify before claiming fixed** — run `npm run build` (covers
   `vue-tsc --noEmit` + functions type-check) and report actual output.
   Never say "fixed" without proof; say "verified: [command] output:
   [result]" or "unverified: needs [what]".
2. **Smoke-test before trusting model IDs** — never ship a model ID from
   docs/web search. Live-call it once first (2026-08-09 revert is the
   precedent for what goes wrong).
3. **One knob at a time** — `CONCURRENCY_LIMIT` has been mistuned 3× in
   production (10→4→1). Don't bundle tuning changes; traceable regressions.
4. **DB changes via Neon MCP only** — `prepare_database_migration` →
   verify on temp branch → `complete_database_migration`. Never live ad-hoc
   `ALTER TABLE`, never `drizzle-kit push`. Additive/nullable columns only.
5. **Small batches, checkpoint** — 1-3 files per change, build between.
6. **No bonus work** — implement exactly what's asked.
7. **Netlify env vars**: never `envVarIsSecret: true` (breaks function
   runtime); redeploy after env changes.
8. **E2E**: always `--project=chromium --workers=1`; prefer unit tests.
9. **No console.log in production code.**

## 4. Implementation plan (in priority order)

**No provider API keys available?** Phases 1-3 are all blocked on the same
missing `ANTHROPIC_API_KEY`/`GOOGLE_API_KEY`/`XAI_API_KEY` — skip straight to
Phase 4 or 5, neither of which needs a live provider call.

### Phase 1 — Live verification of the 2026-08-17 patch (BLOCKED: needs all 4 API keys)

Confirm the unverified patch actually behaves in production:

1. Run one real timed scan against production providers.
2. Confirm `xai/grok-4.6` completes within the new 100s timeout.
3. Confirm the 12-min `SCAN_DEADLINE_MS` leaves enough budget for xai's
   5 queued-last calls.
4. Confirm streaming progress renders in `CompanyDetailView.vue`
   ("Running checks: 12/20 done — checking anthropic/claude-haiku-4-5…").
5. Re-scan a company that previously showed high failure counts; confirm
   remaining failures concentrate in `xai/grok-4.6`, not spread across
   providers.

**Keys needed**: `PERPLEXITY_API_KEY`, `ANTHROPIC_API_KEY`,
`GOOGLE_API_KEY`, `XAI_API_KEY` (only Perplexity is present in
`proof-script/.env` locally).

### Phase 2 — Concurrency re-test (BLOCKED: same keys)

`CONCURRENCY_LIMIT = 1` was tuned when all 4 models shared one Perplexity
gateway key (real limit ~1). Since 2026-08-15, 3 of 4 models call
independent providers — cross-provider parallelism may now be safe and
would cut scan wall-clock substantially. Script is fully written in
`docs/improvement-roadmap.md` ("Concurrency re-test"): sequential vs
`Promise.all` across `anthropic/claude-haiku-4-5`,
`google/gemini-3-flash-preview`, `xai/grok-4.6`.

- Repeat the burst **3-5×** before trusting, then log results in `TODOS.md`.
- If concurrent succeeds at same rate but ~slowest-call wall time:
  raise concurrency for cross-provider batches; `openai/gpt-5-mini` stays
  serialized relative to itself (Perplexity's ~1-concurrent limit).
- **If concurrency is raised, the `completedCount` progress counter must
  become an atomic SQL increment first** (see §2).

### Phase 3 — Grok replacement decision (only if live scan shows xai still failing)

Candidates (`perplexity/sonar` lowest risk — existing key/path; or
`xai/grok-4-1-fast-non-reasoning` if real) are **unverified web-sourced
IDs**. Smoke-test script is in `docs/grok-timeout-investigation.md`.
Only swap if live data shows 100s is still insufficient; removing xAI
changes the "4 major AI assistants" product story.

### Phase 4 — Milestone C3: locale-aware prompts

- Capture `language` at enrichment/company-creation time (extend
  `buildEnrichPrompt` to infer it).
- Maintain parallel-translated `PROMPT_TEMPLATES` (Dutch + English
  fallback first) — no live translation per scan (cost/latency; wording
  quality reviewable).

### Phase 5 — Milestone D2: competitor analysis depth

- Make each competitor tally click-through to the specific prompts where
  they appeared (join `competitor_tallies` vs `per_prompt_rank`/
  `raw_responses` by index) — fixes the "numbers don't add up" confusion.
- Competitor-mention trend chart alongside the score-over-time chart.
- Representative snippet from `raw_responses` near each competitor mention.

### Phase 6 — Milestone F: differentiation (partially built — finish + calibrate)

Code already exists: own-site citation collection (`ownSiteCitations`),
sentiment judge (`judge-sentiment` endpoint,
`buildSentimentJudgePrompt`/`parseSentimentJudgeResponse`,
`sentiment_judgments` column, `allow-sentiment-judge` prop in
`CompanyDetailView.vue`). Outstanding:

- **Calibration pass**: hand-label a handful of example responses, check
  judge agreement, before trusting it live (same discipline as adding a model).
- Cite-URL attribution: match cited URLs against the company's own domain
  so advice can point at the exact page the AI drew from (persist alongside
  `raw_responses`, additive migration).

### Phase 7 — Milestone E: monetization (GATED on E0 manual sales test)

**E0 first, by Marc (not engineering)**: hand-run scans for 3-5 real
prospects, send report + advice, ask €499 via a plain Stripe Payment Link
(zero code). **E1-E4 only after ≥1 real payment**:

- E1: one-time report SKU — Stripe Price (`mode: payment`),
  `report_purchases` table (`user_id`, `company_id`, `scan_id`,
  `stripe_payment_intent_id`, `purchased_at`), Checkout endpoint mirroring
  `create-checkout-session.mts`, webhook case inserting the purchase row.
- E2: gate deep advice in `generate-deep-advice.mts` — allow if
  `isPro(planTier)` OR matching `report_purchases` row; reuse the
  `{error, upgradeRequired, limit}` 402 shape.
- E3: `CompanyDetailView.vue` `:allow-deep-advice` becomes computed;
  swap button for purchase/upgrade CTA when not entitled.
- E4: persistent "Book a free strategy call" CTA (needs Calendly link
  from Marc).
- E5: update pricing copy/JSON-LD once numbers are final.
- E6: clean stale doc comments (aivis-core.mjs pricing note; TODOS.md
  deep-advice-gating note).

### Phase 8 — Milestone G: growth loop (after E0 shows ≥1 payment)

Embeddable "AI Visibility Verified" badge for high-scoring companies —
static asset linking back to the result page (the leaderboard's good idea
without the directory). Gated on E0 deliberately.

### Other tracked items

- **Backfill legacy scans**: re-run `backfill-legacy-scans.mts` against
  Marc's real production account (currently only on a throwaway test
  account).
- **Password reset**: no flow exists; needs Neon console/interactive
  `claude mcp` session.
- **Roadmap extras** (from `docs/improvement-roadmap.md`, after Phase 2):
  scheduled scans + regression alerts (biggest retention lever),
  competitor-benchmarking view (biggest prospect-conviction lever), team/
  agency access (`company_members` schema-only scaffold exists), ops/
  failure-rate view across `scans.failures`, automated tests.

## 5. Key file map

| File | Role |
|---|---|
| `shared/aivis-core.mjs` | Prompts, `MODELS`, detection, scoring, `callModel`, `callModelWithRetry` (429-only retry), advice, sentiment judge. Additive-only. |
| `netlify/functions/run-scan-background.mts` | Scan executor: queue building (model-major), `CALL_TIMEOUT_MS_BY_MODEL`, `SCAN_DEADLINE_MS`, `CONCURRENCY_LIMIT`, progress writes, final `UPDATE`. |
| `netlify/functions/scan.mts` | Scan start: auth, plan limits (Free lifetime 3 / Pro 20 monthly), 402 shape. |
| `netlify/functions/scan-status.mts` | Polling endpoint — returns `progress` too. |
| `netlify/functions/_shared/scanRow.mts` + `src/shared/scanPayload.ts` | Scan row shape shared with frontend. |
| `src/app/views/CompanyDetailView.vue` | Polling UI, `formatRunningStatus()`, deep-advice/sentiment-judge buttons, checkout, auto-scan. |
| `src/app/lib/auth.ts` | Neon Auth client, `authFetch` (401 re-mint + retry). |
| `netlify/functions/_shared/plan.mts` | Plan limits (`PRO_PLAN_MONTHLY_SCAN_LIMIT = 20`, Free limits). |
| `netlify/functions/_shared/email.mts` | `sendScanCompleteEmail` via Resend. |
| `proof-script/index.mjs` | Standalone regression runner (`--dry-run`); keeps full 10 prompts. |
| `tests/aivis-core.test.mjs` | Only unit tests in repo (Vitest). |

## 6. Verification gates

- After every batch: `npm run build` + report actual output.
- After any `shared/aivis-core.mjs` change: `node proof-script/index.mjs --dry-run`.
- After any tuning change (`CONCURRENCY_LIMIT`, timeouts, deadline): one
  real timed scan live, logged in `TODOS.md` with dated `STATUS` entry.
- DB changes: Neon MCP migration workflow only (§3.4).

## 7. Environment / access checklist

- [ ] All 4 provider API keys for live smoke tests (only `PERPLEXITY_API_KEY` local today)
- [ ] Neon MCP connector (for any migration)
- [ ] Real prospect list for Milestone E0 (Marc's task)
- [ ] Pro price / report price / Calendly booking link (Marc's input)
- [ ] "John's screenshot" of technical SEO notes (if it has requirements beyond D4's audit)

## 8. Open questions needing Marc

- Exact Pro monthly price + one-time report price.
- "How this works": crawlable static page vs in-app route.
- Booking link for the "book a call" CTA.
- Whether deep-advice "execution" becomes agency labor (services margin,
  not software margin) or stays advice-only — decide after E0.
