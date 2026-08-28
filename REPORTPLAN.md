# Report clarity + agency portfolio view — implementation plan

Written 2026-08-18. **Change 1 (report clarity) shipped 2026-08-19** — see
`TODO.md`'s 2026-08-19 entry — implemented as an Overview/Details tab
split same as specified here, but with the Details tab further broken into
collapsible accordion sections (a "harmonica bars" request from the same
day, layered on top of this plan rather than replacing it) and extended
with a new secondary "Harmonia" technical/SEO score. **Change 2 (agency
portfolio view) is still not implemented** — untouched, remains the
approved-but-pending plan below.

## Context

Marc asked to push the app further and make it more useful for both
small businesses and agencies, and specifically to make scan reports
clearer — a simple overview vs. all the dirty details. Before proposing
anything, every `.md` file in the repo was read (`CLAUDE.md` + its 5
nested per-directory files, `TODO.md`, `PLAN_NEXT_PHASE.md`,
`WISH_LIST.md`, `DEEPSEEK.md`, `docs/improvement-roadmap.md`,
`docs/grok-timeout-investigation.md`, `README.md`, `DASHBOARD.md`,
`V2_SCORING_MODEL.md`, `CLAUDE_HANDOFF.md`, `NEXT-STEPS.md`,
`TODO-MARKETING.md`, `brand/BRAND.md`, `brand/voice.md`,
`content/growth-ideas.md`, `DEV.md`, `MIGRATION.md`) to confirm this
wasn't already tracked or already tried. It isn't: report-clarity (a
summary vs. detail split) appears nowhere in the backlog, and agency
support only exists as a **dormant, zero-usage `company_members` schema
scaffold** (added 2026-08-15, confirmed via grep — zero references
anywhere in `netlify/functions/**` or `src/**`, docs-only).

One important guardrail surfaced during the docs read: a public,
no-login "client report page" was already built **twice** (the
leaderboard, commit `1b0c7a9`; then a per-company public report toggle,
commit `555e3f4`) and **reverted both times**, most recently on
2026-08-17 — the code comment left behind literally says "if this
column is ever wired up a third time, check git log first." Asked Marc
directly whether "useful for agencies" meant that kind of shareable
public link; he confirmed **no** — keep everything behind login. He also
confirmed agency scope this round is the lightweight portfolio view, not
building out full multi-user `company_members` sharing (that's a bigger,
auth-adjacent lift — invite flow, permission checks across every
company-scoped endpoint — worth its own future round once this ships and
is validated).

That leaves two bounded, **frontend-only** changes — no schema
migration, no new API endpoint, no auth change. Both were independently
verified against the live code (not just the docs) before finalizing
this plan.

## What's changing

### 1. `src/shared/ScanDetail.vue` — Overview / Details split

Today this 632-line component renders 10 sections top to bottom with no
summary/detail distinction: brand header, score card, headline, warning
banners, scoreboard, advice cards, deep advice, citations
("Your site, cited"), check-by-check breakdown (the densest section,
~59 lines, per-check `<details>`), footer. It's shared by both the
authenticated app (`CompanyDetailView.vue`) and the frozen legacy
unauthenticated `result.html` (via `src/result/App.vue`) — any change
has to keep working in both without new props, since `result.html` has
no auth system to gate anything with.

**Add a local `viewMode: 'overview' | 'details'` ref, default
`'overview'`, rendered as a `role="tablist"` pair of tab buttons placed
right after the brand/meta line, before the score card** — first
interactive element on the page, not buried at the bottom where a
mobile user would have to scroll past everything to find it. Pure
client state, zero new props — satisfies the `result.html` constraint
automatically.

- **Overview** (default): score card, headline, warning banners,
  scoreboard, advice cards, deep advice. This is "what's my status and
  what do I do about it" — the warning banners stay here (not opt-in)
  because they qualify how much to trust the headline/score right next
  to it.
- **Details**: citations ("Your site, cited") + check-by-check
  breakdown (including the failure-detail list already nested inside
  it). This is "the evidence behind the summary" — raw transcripts,
  source URLs, per-check pass/fail detail.
- Brand header/meta stays above both tabs; the methodology footer stays
  below both, unconditionally (short, always-relevant, not worth
  hiding or duplicating per tab).
- Label the Details tab with a live count (e.g. `Details · 20 checks`)
  computed from the existing `checkBreakdown` data — a free preview of
  what's behind the click.
- Use `v-if` between the two panels, not `v-show` — the check-by-check
  section can hold up to 20 entries and there's no reason to keep it in
  the DOM while hidden.

**Two real gotchas to handle, not just style choices:**
1. **Scroll-position jump on switch.** If a user is scrolled deep into
   a tall Details tab and switches to the shorter Overview tab, the
   browser keeps the old scroll offset, landing past the end of the
   now-shorter content. Fix: on `viewMode` change, scroll the tab-bar
   element into view (`scrollIntoView({ block: 'start' })`) so every
   switch lands at a consistent position.
2. **Empty Details tab for a fully-failed scan.** When
   `completedCalls === 0`, both `checkBreakdown` and
   `ownSiteCitationRows` are already empty arrays and today's template
   just renders nothing there — fine when it's one section among many,
   but a blank tab a user deliberately clicked into reads as broken.
   Add an explicit empty-state line ("No check details available for
   this scan.") for that case.

No changes to `src/shared/scanPayload.ts` — every field this needs
(`checkBreakdown`, `ownSiteCitationRows`, etc.) is already computed
inside `ScanDetail.vue`'s own `<script setup>` from the existing
payload.

### 2. `src/app/views/CompaniesListView.vue` — portfolio view

Today: a flat list, `created_at DESC`, no search/sort/filter, each card
showing brand/category/website/scan_count/latest_score (or "no data").
`GET /companies` already returns `scan_count`/`latest_score` per
company (`netlify/functions/companies.mts:25-50`) — no API change
needed, this is purely making already-fetched data more scannable.
Free tier is capped at 1 company, so this view's real audience is a
Pro/agency user tracking several — it needs to degrade gracefully, not
look broken, for the common 0-1 company case.

**Add a 4-tile summary strip**, computed client-side from the fetched
`companies` array, reusing the exact `scoreBand`/`scoreColor()` logic
this file already imports (don't reinvent a threshold):
1. **Companies** — total count.
2. **Leading** — `scoreBand(latest_score) === 'leading'` (score ≥ 80).
3. **Needs attention** — `scoreBand(latest_score)` is `'weak'` or
   `'invisible'` (score < 50) — same buckets the per-card dot color
   already implies.
4. **No data** — `typeof latest_score !== 'number'`.

Each tile is clickable and sets a filter (`all` / `leading` /
`needs-attention` / `no-data`) — the strip and the filter are one
mechanism, not two. All 4 tiles always render, even at 1 company
("1 company · 0 leading · 0 needs attention · 1 no data" is complete,
normal information, not a broken partial layout).

**Add search/sort/filter controls, shown only when
`companies.length > 1`** (hidden at 0-1 — nothing to search/sort at
that size, so this doesn't clutter the common Free-tier case):
- **Search** — plain-text, case-insensitive substring match against
  `brand`/`category` only (not `website`). Client-side `.includes()`,
  never `new RegExp()` from user input — a brand name containing
  `(`/`.`/`*` must not throw or behave as a pattern.
- **Filter** — same 4 buckets as the stat tiles, one shared state.
- **Sort** — 4 keys: **Needs attention first** (score ascending, nulls
  last — the new default), Score high→low, Newest first (today's
  existing order, still available), Name A→Z.

**Change the default sort to "Needs attention first."** The persona
this serves is triaging a portfolio; "what did I just add"
(`created_at DESC`) is a less useful default than "what's broken right
now" for that case. This is purely a client-side re-sort of data
already received — `companies.mts`'s `ORDER BY` is untouched, so it's
zero backend risk and trivially reversible. At 0-1 companies it's a
no-op, which is exactly the graceful-degradation property needed.

**Edge cases to handle explicitly:**
- Reuse the existing `typeof score === 'number'` guard
  (`scoreColor()` already has it) in every new computed — don't
  reimplement it and risk a different null-handling bug.
- Zero companies overall: strip/controls must NOT render above the
  existing "No companies yet" empty state (`v-else-if` guard,
  `CompaniesListView.vue:287`).
- Zero companies **after filtering** (but some exist): new empty state
  ("No companies match your filters" + a one-click "Clear filters") —
  today's code has no equivalent for this, since no filtering exists
  yet.

## Files to change

- `src/shared/ScanDetail.vue` — tab state, markup, scroll-reset,
  Details empty-state, scoped CSS for the tab bar (reuse existing
  `--accent`/`--muted`/`--border` tokens already used throughout this
  file — no new palette; the marketing site's dark "Spotlight" rebrand
  from 2026-08-17 explicitly does not extend to the in-app dashboard,
  confirmed in `brand/BRAND.md`).
- `src/app/views/CompaniesListView.vue` — search/sort/filter state, the
  `filteredSortedCompanies` computed, summary-strip + controls markup
  and CSS, new empty-state branch.
- `src/shared/CLAUDE.md` — update the `ScanDetail.vue` section to
  describe the Overview/Details split (this file is actively
  maintained per-change per its own header).
- `src/app/CLAUDE.md` — update the `CompaniesListView.vue` bullet to
  describe the summary strip / search / sort / filter.
- `README.md` — extend the "Manual walkthrough" checklist (this repo's
  only test plan) with the new tab toggle and portfolio controls.

No changes to `netlify/functions/companies.mts`, `src/shared/scanPayload.ts`,
or any DB migration — verified nothing in this plan needs a new field.

## Verification

No automated component test suite exists (`tests/aivis-core.test.mjs`
covers only `shared/aivis-core.mjs`, untouched here) — per house rule,
never claim "fixed" without running the actual gates:

1. `npm run build` (`vue-tsc --noEmit && vite build`) — must pass
   clean against both changed `.vue` files.
2. `npm run test:run` — quick sanity pass, unaffected but cheap to
   confirm nothing else broke.
3. Manual walkthrough via `npm run dev` (or the `browse` skill),
   extending `README.md`'s existing checklist:
   - `result.html` with an existing `#d=` link — Overview renders by
     default, Details tab works, no console errors, no
     deep-advice/sentiment-judge UI leaks in (props still default
     `false` there).
   - `CompanyDetailView.vue` — click through several scans of
     different shapes (normal completed, `score: null`/failed calls,
     with and without deep advice already generated) in both tabs;
     confirm the scroll-reset on switch.
   - `CompaniesListView.vue` — a fresh 0-company signup (no strip/
     controls), a Free account with 1 company (strip shows, controls
     hidden), and an account with 3+ companies at varying score bands
     (all 4 tiles, tile-click-sets-filter, search, each sort key
     including the new default, the "no results match" empty state).
   - Both components at a narrow mobile viewport — tab bar and stat-
     tile grid must wrap without overflow/clipping (mobile-first is a
     standing project requirement).

## Deliberately out of scope this round

- **Full multi-user `company_members` sharing** (invite flow,
  permission checks) — the schema scaffold exists but Marc chose the
  lighter portfolio-view option for now. Revisit once this ships.
- **Public/shareable client report links** — explicitly declined,
  given the two-strikes revert history above.
- Anything from `docs/improvement-roadmap.md`'s other priority items
  (scheduled scans + regression alerts, competitor-benchmarking view,
  ops/failure-rate view) — not part of this ask, not bundled in.
