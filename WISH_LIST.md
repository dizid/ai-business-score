# Wish list

Running log of ideas raised in conversation but deliberately not built yet —
distinct from `TODOS.md` (which tracks shipped-milestone history and
concrete open follow-ups). Add to this file instead of losing a good idea
in chat scrollback; move an item to `TODOS.md` (or just build it) once it's
actually being picked up.

## From the 2026-08-09 "check-by-check breakdown / prompt & model expansion" conversation

**1. ~~Persist failed-call detail (prompt + model + error), not just a
count.~~ DONE 2026-08-12.** Shipped as Milestone A3 of `PLAN_NEXT_PHASE.md`:
a `failures jsonb` column on `scans`, `aggregateProspect` returns
`{model, promptIndex, error}` per failed call, `ScanDetail.vue` renders the
list in place of the old aggregate-only warning. Diagnosing a failed model
string or a deadline cutoff no longer needs Netlify logs. This was
originally a restoration, not new design — the same feature briefly
existed (commit `522eb63`) and was accidentally deleted the next day
(`74afa41`) before this wish-list entry was even written.

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

**5. ~~Validate `CONCURRENCY_LIMIT` and `SCAN_DEADLINE_MS` against real
usage.~~ RESOLVED 2026-08-13.** Both were originally picked by reasoning
about worst-case latency, not measured — which turned out to matter: a live
smoke test found Perplexity's real per-key concurrency limit is ~1, not the
10 (then 4) this item's numbers assumed. `CONCURRENCY_LIMIT` is now `1`
(fully sequential) and `SCAN_DEADLINE_MS` is `600000` (10 min) — see
`shared/CLAUDE.md`'s "Update 2026-08-13" note (moved there from root
`CLAUDE.md` on 2026-08-20 via `/doctor`) and `run-scan-background.mts` for
the full writeup. Tracked as Milestone C in `PLAN_NEXT_PHASE.md`, now
shipped. Trade-off this surfaced: scans now take 5-8 minutes wall-clock
(sequential, no parallelism to hide call count behind) — a scan-complete
notification is the follow-up needed to make that acceptable UX, not yet
built.

## From testing PR #2's deploy preview (2026-08-09)

**6. Neon Auth's `trusted_origins` blocks testing auth on any PR deploy
preview.** Only `https://aivis-scan.netlify.app` (production) is trusted —
every Netlify deploy preview lives on its own `deploy-preview-<N>--
aivis-scan.netlify.app` origin, so sign-up/sign-in there fails with
"Invalid origin" (and, as a side effect, Chrome has no saved password for
an origin it's never seen, which looked like a separate bug but wasn't).
Fix requires Neon console access this session doesn't have (no Neon MCP
connector exists in the claude.ai directory — the Neon MCP tools referenced
elsewhere in this repo's docs came from a different, interactive session).
Try adding a wildcard trusted origin (`https://deploy-preview-*--
aivis-scan.netlify.app`) first; if Neon Auth only accepts exact matches,
this'll need a per-PR entry, which probably isn't worth doing routinely —
plan to test auth-touching changes against production instead.

**7. No password-reset flow.** `LoginView.vue`/`auth.ts` have no
forgot-password link, route, or handler — confirmed by reading the code,
not a bug, just never built. Better Auth (what Neon Auth runs on) supports
password reset, but wiring it up needs both new UI (a "forgot password"
route + form) and email-sending configured on the Neon Auth project side,
which also needs Neon console access this session doesn't have.
