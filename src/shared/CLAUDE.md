# CLAUDE.md — src/shared/

Scoped guidance for `src/shared/`, split out of the project root
`CLAUDE.md` on 2026-08-17 (via `/doctor`) so it only loads when a session
actually touches this directory, instead of every session paying for it.
See the root `CLAUDE.md` for overall project context.

### `src/shared/scanPayload.ts` + `src/shared/ScanDetail.vue`

Reused across every scan-rendering surface: `result/App.vue`,
`CompanyDetailView.vue`'s detail pane. `scanPayload.ts` holds the types and
`validatePayload()` — fail-closed validation of a scan-result object, since
`result.html`'s payload is inherently unsigned/forgeable (anyone can craft a
`#d=` link) and `CompanyDetailView.vue`'s DB-backed data gets the same
treatment for consistency and bounds-safety. `id` is now a required field
(added for Milestone 6's deep-advice button, which needs to know which scan
to POST to) — confirmed backward compatible since `scan.mts` has always
included `id` in every payload it ever produced, including pre-pivot links
still live in the wild. `deepAdvice`/`deepAdviceGeneratedAt` are optional —
missing, `null`, or malformed all degrade to `null` rather than rejecting
the whole payload, since deep advice is a bonus on top of the always-present
rule-based advice.

`ScanDetail.vue` renders everything from the brand/website header through
the score ring, scoreboard, advice cards, deep-advice section, raw-response
`<details>`, and footer. Its one deliberate exception to "purely
presentational, no other props, no emits" is `allowDeepAdvice`/
`deepAdviceLoading` props plus a `generate-deep-advice` emit — `result/App.vue`
never sets `allowDeepAdvice` (no auth system there), so the button only ever
appears in the authenticated app; the component itself stays auth-agnostic,
`CompanyDetailView.vue` owns the actual fetch call.

**Overview/Details tabs + accordion (2026-08-19, implements `REPORTPLAN.md`'s
Change 1, extended):** a local `viewMode: 'overview' | 'details'` ref
(default `'overview'`) splits the template into two panels via a
`role="tablist"` pair placed right after the brand/meta line, before the
score card — zero new props, so it works unchanged in both `result.html`
and `CompanyDetailView.vue`. **Overview** keeps the AI score ring, headline,
warning banners, scoreboard, advice cards, deep advice, and a compact
Harmonia summary (see below), and — **added 2026-08-25**, now the first
thing shown in the tab — an **Executive Summary** card
(`deriveExecutiveSummary()` in `src/shared/scanDerived.ts`): a
skim-in-10-seconds `{verdict, vulnerability, quickWin}` synthesis, pure
re-derivation of data computed elsewhere (score band, category breakdown,
Harmonia's AI-crawler/schema findings), no new LLM call. The same commit
added **share-of-voice %** to the scoreboard (`shareOfVoicePct()`, same
file) — distinct from the existing presence-rate percentage
(`scoreboardRowPct`, mentions ÷ completed calls): share of voice is
mentions ÷ total mentions across brand + competitors, "of everyone who got
mentioned, what fraction was you." **Details** holds the denser sections —
Harmonia breakdown, "Your site, cited," check-by-check — each wrapped in
the new `src/shared/CollapsibleSection.vue` (a `<details>`/`<summary>`
"harmonica bar": summary row with a status/count, expands to reveal
content) instead of always-rendered `h2` blocks. Generalizes the
rotating-chevron CSS pattern that already existed for the check-by-check
breakdown's own per-call `<details>` (still there, one level deeper,
untouched) into a reusable component. Switching tabs calls
`scrollIntoView({ block: 'start' })` on the tab bar to avoid landing
mid-air in a differently-sized panel; the Details tab label shows a live
`{{ totalChecksCount }} checks` count; an explicit empty-state line covers
the case where nothing is available for either tab section.

**Harmonia (2026-08-19):** a technical/on-page/content-structure/UX audit
of the scanned business's own website (`shared/harmonia.mjs`, `scans.harmonia`
column — see `netlify/functions/CLAUDE.md`). Rendered as **a separate,
secondary score, never blended into the AI Visibility Score** — Marc
confirmed AI visibility stays "the main thing" after a pasted-in
Gemini-authored plan proposed a single blended composite that would have
buried it as one 20%-weighted sub-component. `payload.harmonia` is
optional (`null` for pre-migration scans or a failed site fetch) and
degrades to an explicit "isn't available for this scan" message, same
lenient-optional pattern as `deepAdvice`. Four pillars — Technical SEO
(40%), On-Page SEO (30%), Content Structure (20%), UX Signals (10%, from
PageSpeed Insights) — each shown as a horizontal bar reusing the
scoreboard's existing `.board-track`/`.board-fill` CSS, colored via
`scoreBand()`'s existing good/warning/serious/critical thresholds (new
`.band-text-*`/`.band-fill-*` CSS helpers) so it reads as the same color
language as the AI score ring rather than a second, differently-calibrated
one. Includes schema.org/JSON-LD detection + a hand-rolled structural
validator (not a call to Google's Rich Results Test — no public API exists
for that) and rule-based (not LLM) schema opportunity suggestions with
copy-pasteable starter JSON-LD snippets. AI-based content-readability/
E-E-A-T/entity-salience scoring and per-element Core Web Vitals diagnosis
were deliberately deferred (cost/latency per scan, and a real
headless-Chrome dependency Netlify Functions can't run as-is) — logged as a
follow-up phase in `~/.claude/plans/ping-spicy-oasis.md`, not built.

**Clarity check (2026-09-04):** a small `CollapsibleSection` right after
Entity presence in the Details tab — "Homepage clarity," status text
"Specific claim found"/"No specific claim found," body either quotes the
specific claim found or explains that the homepage only has generic
filler. `payload.clarityCheck` is optional (`null` for pre-migration scans
or an unreachable site), same lenient-optional pattern as `entityPresence`.
See `shared/CLAUDE.md`'s "Clarity check" entry for the full design —
notably not yet calibrated against real homepages.

### `scanDerived.ts` / `scanLabels.ts` / `scanReport.ts` / `Icon.vue`

`scanDerived.ts` and `scanLabels.ts` were pulled out of `ScanDetail.vue`'s
`<script setup>` block (aggregation-computeds and label maps
respectively) because a `<script setup>` component's internals aren't
importable by another module. `scanReport.ts` is the reason they were
extracted: `buildScanReportMarkdown()` builds a single self-contained
Markdown report — AI Visibility score, Site Health/Harmonia audit, full
check-by-check breakdown — for pasting into an external AI assistant to
get improvement recommendations, and `downloadMarkdown()` saves it
client-side. Both `ScanDetail.vue`'s on-screen rendering and the
downloadable report now call the exact same `scanDerived`/`scanLabels`
functions, so the report can't independently drift from what's on screen.
Pure client-side — no new endpoint, no server call.

`Icon.vue` is a small shared SVG icon component (`chevron`, `caret-down`,
`logo`, `check`, `x`) used across `App.vue`, the auth views, and several
`src/app/components/`.
