# Wish list

Running log of ideas raised in conversation but deliberately not built yet —
distinct from `TODOS.md` (which tracks shipped-milestone history and
concrete open follow-ups). Add to this file instead of losing a good idea
in chat scrollback; move an item to `TODOS.md` (or just build it) once it's
actually being picked up.

## From the 2026-08-09 "check-by-check breakdown / prompt & model expansion" conversation

**1. Persist failed-call detail (prompt + model + error), not just a count.**
`aggregateProspect`/`run-scan-background.mts` currently only track
`failedCalls` as a number — which specific prompt/model failed and why is
logged to Netlify function output but never written to the `scans` row.
This matters more now than it used to: diagnosing whether a model string is
simply wrong (see #2 below) or whether the new `SCAN_DEADLINE_MS` is cutting
off otherwise-fine calls both currently require reading Netlify logs by
hand after every test scan. Would need: a `failed_call_details` jsonb
column (migration), `aggregateProspect` returning failed entries with
promptIndex/model/error instead of discarding them, and a small addition to
the check-by-check breakdown UI (`ScanDetail.vue`) to show failed checks
alongside completed ones instead of just the aggregate warning banner.

**2. Re-add more Perplexity Agent API models — one at a time, live-verified.**
`MODELS` was briefly expanded from 2 to 6, then reverted the same day after
the combined 60-call scan raised real concurrency/latency concerns. The 4
candidates that were reverted (found via web search only, since
`docs.perplexity.ai` is unreachable through this network's egress policy —
never live-smoke-tested):
- `anthropic/claude-opus-5`
- `openai/gpt-5.6-luna`
- `google/gemini-3.6-flash`
- `xai/grok-4.5`

Before re-adding any: confirm the exact identifier and rough cost tier with
a real API call (same standard `PPLX_URL`'s own comment already holds
itself to — "verified against live docs AND a live smoke-test call"), and
add them one at a time so a failure is attributable rather than guessed at.
Item #1 above would make this much faster to iterate on.

**3. Reduce prompt genericness via deeper per-company research (plan
option #2 from the "prompts feel generic" discussion).** The 7 fields every
prompt template draws from (`brand`/`website`/`category`/`use_case`/
`region`/`customer_segment`/`competitors`) are inherently generic even when
enriched (see below) — enrichment fills them with *real* values, not *more
specific kinds* of values. Idea: extend the enrichment schema with 2-3 new
fields research can't currently express — a flagship product/service, a
real differentiator/USP, a neighborhood or landmark for local businesses —
stored once per company (not re-fetched per scan) and spliced into a subset
of the 10 templates. Turns "best hotel option for weekend stay" into "best
boutique hotel near Vondelpark." Needs a `companies` table migration plus
template changes in `shared/aivis-core.mjs`.

**4. Ground prompts in real page content (plan option #3, bigger lift).**
Fetch the target site directly (title/meta description/headings) and quote
real copy into a prompt, instead of relying entirely on Perplexity's own
`web_search` grounding the way every prompt does today. Most specific-
feeling option of the three, but a genuine architecture change — this app
currently never fetches a tracked business's site itself — and adds
scraping fragility (JS-rendered pages, blocks). Worth a deliberate go/no-go
conversation, not a default next step. Do #3 first and see whether that's
enough before considering this.

**5. Validate `CONCURRENCY_LIMIT` (10) and `SCAN_DEADLINE_MS` (100s)
against real usage.** Both were picked by reasoning about worst-case
latency, not measured against a real scan at the new 20-call (10 prompts x
2 models) volume. Once a few real scans have run, revisit: if scans still
feel slow, or if the deadline is cutting off calls that would have
succeeded given a few more seconds, tune the numbers — but do that from
observed behavior (which item #1 would make visible), not another guess.
