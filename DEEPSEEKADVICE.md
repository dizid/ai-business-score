# Foreground — report UX, information density & marketing SEO/GEO audit

A repo-committed companion to the session plan
`~/.claude/plans/do-deep-research-and-cozy-neumann.md` ("Foreground: usability,
master-detail depth, and SEO/GEO signals"). Written after a read of
`src/shared/report/*` (all 5 components), the `ScanDetail.vue` GEO/SEO
master-detail implementation, `CompanyDetailView.vue`'s layout history,
`src/shared/scanPayload.ts` + `scanDerived.ts`, `public/llms.txt`,
`public/robots.txt`, all four marketing HTML entries, `scripts/build-blog.mjs`'s
shell, `shared/harmonia.mjs`, `shared/entityPresence.mjs`, `brand/voice.md`,
`brand/BRAND.md`, `SOCIAL_SETUP.md`, and the doc-drift trail in `CLAUDE.md` /
`TODO.md`.

*(Filename note, matching this repo's convention of explaining odd names:
despite appearing next to `DEEPSEEK-REASONER.md`, this file has nothing to do
with DeepSeek — `grep -i deepseek` on its own contents returns nothing. It is a
sibling to `DEEPSEEK-REASONER.md`, which is itself, per its own header note,
unrelated to DeepSeek. Neither filename implies a DeepSeek handoff; the
`DEEPSEEK.md` file that `TODO-MARKETING.md`/`REPORTPLAN.md` reference still does
not exist in the repo.)*

**Why this file exists in the repo at all:** `~/.claude/plans/` is **not** in
git. Those plan files are invisible to `git status`, to anyone reading the repo,
and to future AI sessions that only read tracked files. This document carries the
findings that would otherwise be lost, and marks clearly which of them the plan
file already covers.

**Confidence key used throughout:** **[V]** = verified by reading the file /
grep this session · **[D]** = derived from code or CSS, not yet observed running ·
**[?]** = needs a 30-second manual confirm before acting.

---

## 0. Relationship to the plan file and the other repo docs

The session plan is a **phased implementation roadmap** (Phase 0 → Phase 8,
ordered so Phase 1's data-model change lands before the Phase 2/3/5 UI that
depends on it). This document is an **audit + hazard list**, not a competing
roadmap. Where the two overlap, **the plan file's phasing wins** — it was written
against the same research and you selected all 8 bundles.

| This doc | Plan file | Relationship |
|---|---|---|
| §2 Batch 1 — fact layer | **Phase 0** — *Fix the live bugs* | **Plan is narrower.** Phase 0 covers the `index.html` hero fact only. Rows 2–6 of §2's table (brand docs, `SOCIAL_SETUP.md`, `BETA_TESTERS.md`, `DEEPSEEK-REASONER.md`, billing docs) are **net-new here** — and they are the same class of bug, so they belong in the same sweep. |
| §3 Batch 2 — marketing metadata | **Phase 6** (*Schema.org depth, blog + E-E-A-T*), **Phase 8** (*Crawler rules & freshness signals*) | Partial overlap. `sameAs` / `twitter:card` / `llms.txt` specifics are **net-new**; Phase 6/7/8 own the content strategy around them. |
| §4 Batch 3 — report usability | *(not covered)* | **Net-new.** The plan's research covered the master-detail views, but its phases are data/feature phases; the `<700px` tap→content jump, the deliberately-removed app-level rail, and URL-addressability are not among Phase 0–8. |
| §5 Batch 4 — information density | **Phases 1, 2, 3, 4, 5** | Substantial overlap — model identity (`Phase 1`), per-provider breakdown (`Phase 2`), citation intelligence (`Phase 3`), scan-history detail (`Phase 4`), diff views (`Phase 5`). Use the plan file as the roadmap; `§5.4`/`§5.5`/`§5.7` add coverage, sentiment, and possibly-unrendered-signal items. |
| §6 Deferred | **Phase 8** (crawler rules) | Overlaps on crawler work; the meta-robots gap is the one item worth pulling forward. |
| §7 Unverified | *(not covered)* | **Net-new** — 7 items to confirm before acting. |
| §8 Guardrails, §9 DoD | **Execution notes** | Complementary; the plan's execution notes own ordering, this doc adds the fact-sweep requirement and the frozen-`result.html` rule. |

**Repo-doc map** (so the next reader doesn't hunt): implementation plans live in
`DEEPSEEK-REASONER.md`, `REPORTPLAN.md`, `PLAN_NEXT_PHASE.md`, `PLANB.md`,
`PLAN_COMPETITIVE.md`, `PLAN_PLAYSTORE.md`. Status/history of record is `TODO.md`;
architecture and deployment truth is `CLAUDE.md` plus the nested
`shared/CLAUDE.md`, `src/app/CLAUDE.md`, `netlify/functions/CLAUDE.md`.

---

## 1. Ground truth this audit is measured against

The hosted product today is **5 providers × 5 prompts = 25 checks per scan**,
restored 2026-09-14 (`run-scan-background.mts`'s `HOSTED_MODELS` changed from a
`MODELS.filter(...)` down-select to a plain `const HOSTED_MODELS = MODELS;`
alias; Mistral joined as a 5th provider the same day). The five are GPT-5 mini,
Gemini 3 Flash, Claude Haiku 4.5, Grok 4.6, and Mistral Small. Pro is
**$99/month**, live since 2026-09-11 (`price_1UEQwp8gBja0qkMxMPD8sfNe`), and the
**$19 single-scan SKU was removed for good** on 2026-09-11, not merely disabled.
**[V]**

Every finding in §2 is a deviation from that baseline.

---

## 2. Decision gates (CEO calls, not engineering ones)

| Gate | Question | Recommendation |
|---|---|---|
| **G1** | Fact layer (§2) first, ahead of any feature work — and folded into Phase 0 rather than run as a separate phase? | **Yes.** It is live, wrong, and on the highest-traffic page. Phase 0 is already scheduled first; this just widens its file list from 1 file to 5. |
| **G2** | Desktop master-detail rail (§4.2): restore a permanent company/scan list column at ≥1100px, or keep the dropdown as the intended end state? | **Restore, ≥1100px and collapsible only.** The removal was a deliberate width trade (see §4.2), so this is your call to reverse — but the report can afford a 260px rail on a laptop while the phone keeps today's dropdown untouched. |
| **G3** | Prompt text in the payload (§5.1): server + storage + validator + back-compat, or UI-only work this round? | **In scope.** Highest-value information win — the product's core promise made inspectable — and its back-compat path is already the house pattern (`asEntityPresence`/`asClarityCheck`). Pairs naturally with Phase 1's payload change. |
| **G4** | Model × prompt matrix (§5.2): accept a second, contained horizontal scroll region, or fall back to stacked per-model cards? | **Stacked cards first, matrix only if the one-scroll-region rule can be honoured.** This repo is strict about single scroll regions; a scrolling grid is a real exception, not a detail. Phase 2 owns the per-provider breakdown. |
| **G5** | §6's new collection items — take any now? | **Only the meta-robots check.** It is the one that can invalidate a *core* claim (a page can be `noindex` by meta tag while the report says "not blocked"). The rest are additive polish for Phase 8. |

---

## 3. Batch 1 — Fact layer (live bugs) → fold into plan Phase 0

**The find that defines this batch:** the hosted scan was cut from 4 providers to
2 on 2026-09-04 for cost control, then restored to **5** on 2026-09-14 — and the
copy was not swept. The four marketing pages and `llms.txt` were corrected in
that pass, but several other sources were missed, including one *on-page*
contradiction on `index.html`.

| # | Finding | File | Confidence |
|---|---|---|---|
| 1 | Hero fact reads **"2 AI models checked — Gemini 3 Flash, Claude Haiku 4.5"**, while the same page's How-it-works section (`:231`, `:241`, `:261`, `:318`) and its own `FAQPage` JSON-LD both say 5 models. Direct on-page contradiction, on the highest-traffic page. *(The line numbers are from the plan file's own Phase 0 finding.)* | `index.html` (`:207-209`, `.hero-fact`) | **[V]** |
| 2 | Brand rule 4 says **"four AI models… five prompts per scan, twenty checks"** — and these are the source docs all copy derives from, so the drift re-propagates on every new post. | `brand/voice.md`, `brand/BRAND.md` | **[V]** |
| 3 | X pinned-post draft and the file's closing note say the hosted scan "only queries those two providers today" and instruct the writer to say "Gemini and Claude" to avoid overclaiming. Stale since 2026-09-14. | `SOCIAL_SETUP.md` | **[V]** |
| 4 | §B1's review checklist asserts **"4 models / 5 prompts / 20 checks"**, and §B4's mandatory fact-grep lists `4 models` and `$19` — both stale (5/25; $19 SKU deleted). | `DEEPSEEK-REASONER.md` | **[V]** |
| 5 | Beta-tester script asks testers to react to **"$99/mo Pro, $19 one-time scan"** — the $19 SKU no longer exists, so this would put a wrong price in front of a human tester. | `BETA_TESTERS.md` | **[V]** |
| 6 | Internal docs still say **$199/mo** and reference a $19 single-scan SKU. Already self-flagged as stale in-place; fold into this batch's doc sweep rather than a separate commit. | `netlify/functions/CLAUDE.md`, `TODO-MARKETING.md`, `PLANB.md`, `PLAN_NEXT_PHASE.md` | **[V]** |

**Scope:** `index.html` · `brand/voice.md` · `brand/BRAND.md` ·
`SOCIAL_SETUP.md`, plus the internal-doc sweep in row 6. That is more than the
1–3-file change-discipline batch, so **split it**: the `index.html` fix ships
alone first (it is live and user-facing), then the doc sweep as its own commit.

**The hero fix — harmonized with the plan.** Phase 0 specifies the full model
list, which is the better end state (it names the five providers rather than
asserting a bare number). My earlier draft suggested shortening it to
"5 — AI models checked · 25 checks per scan"; **prefer the plan's version**, with
the plan's own caveat: verify the rendered width, because the existing label is
already long and `.hero-fact-label` is width-constrained.

```html index.html
     <div class="hero-fact">
-      <span class="hero-fact-num">2</span>
-      <span class="hero-fact-label">AI models checked — Gemini&nbsp;3&nbsp;Flash, Claude&nbsp;Haiku&nbsp;4.5</span>
+      <span class="hero-fact-num">5</span>
+      <span class="hero-fact-label">AI models checked — GPT-5&nbsp;mini, Gemini&nbsp;3&nbsp;Flash, Claude&nbsp;Haiku&nbsp;4.5, Grok&nbsp;4.6, Mistral&nbsp;Small</span>
     </div>
```

If that overflows, fall back to `5` + "AI models checked — 25 checks per scan",
which keeps the count honest without the name list. Do **not** touch the JSON-LD
`FAQPage` or the visible `<details>` block — they are already correct, and they
must stay string-identical to each other (Google's FAQPage guidelines require it).

**Verification:** `npm run build` (which already runs `vue-tsc --noEmit` first,
then `vite build`, then `node scripts/build-blog.mjs`), then the fact-grep made
mandatory in `DEEPSEEK-REASONER.md` §B4 — extended to the sources above, since
the existing grep list is exactly what missed rows 2–5:

```bash
grep -rn "4 models\|four AI models\|twenty checks\|20 checks\|2 AI models\|\$19\|\$199" \
  index.html how-it-works.html terms.html privacy.html public/llms.txt \
  brand/voice.md brand/BRAND.md SOCIAL_SETUP.md BETA_TESTERS.md \
  netlify/functions/CLAUDE.md DEEPSEEK-REASONER.md
```

Plus a rendered-width check on the hero fact at 375px and desktop.

---

## 4. Batch 2 — Marketing metadata

Mechanical and low-risk, but it touches shared templates, so it should land
before any content edits (same reasoning as `DEEPSEEK-REASONER.md`'s A → C → B
ordering: get the shared files stable first). Overlaps plan Phase 6/8.

### 4.1 `sameAs` — the entity-corroboration gap **[V]**

`Organization` JSON-LD on all four pages carries `name`/`url`/`logo`/`founder`/
`foundingDate`/`slogan` — and **no `sameAs`**. `SOCIAL_SETUP.md` has always
intended for the created profile URLs to fill it ("Once done, hand the 5 profile
URLs back so `index.html`'s JSON-LD `sameAs` array can be filled in"), and
`TODO-MARKETING.md` tracks it as an open gap. Only X is confirmed created
(`@foreground_info`); the rest are still manual signups. **[?]** confirm which
profiles actually exist before writing the array — shipping a `sameAs` pointing
at an unclaimed handle is worse than omitting it.

```html index.html   (repeat the array on all 4 pages)
     "founder": { "@type": "Person", "name": "Marc de Ruijter" },
     "foundingDate": "2026-07-29",
+    "sameAs": ["https://x.com/foreground_info"],
     "slogan": "Get in the foreground."
```

This is the one metadata change that is *also* a product-relevant GEO signal:
entity corroboration across sources is precisely the mechanism the scanner
measures from the outside. It pairs with §6's `sameAs` check idea.

### 4.2 `twitter:card` mismatch **[V]**

`twitter:card` is `summary` on all four pages *and* in `scripts/build-blog.mjs`'s
template, while `og-image.png` is 1200×630 (**[?]** asserted only in
`SOCIAL_SETUP.md`'s description — measure the actual bytes). A 1200×630 asset
with `summary` renders as a small square thumbnail, which undercuts X/Twitter CTR
on every shared link — including the accounts being set up right now.

Five edits: `index.html`, `how-it-works.html`, `terms.html`, `privacy.html`,
`scripts/build-blog.mjs`. Change `content="summary"` →
`content="summary_large_image"` on the `twitter:card` meta line only (leave
`og:*` untouched).

### 4.3 `llms.txt` — Posts list and the free-scan entry point **[V]**

`public/llms.txt` is current on facts (5 models, 25 checks, $99) but links only
`/blog/` and omits the posts themselves, the pricing page, and the free-scan
entry point. Per llmstxt.org's convention it should enumerate the key pages.
**Honest caveat, from the brand's own published position:**
`artifacts/ai-visibility-engineering.html` argues explicitly that "publishing an
`llms.txt` file is not a ranking lever" and tells readers not to budget an hour
against it. So this is cheap hygiene and a *statement of intent* — it must not be
logged as an SEO win.

Add a `## Posts` section listing each `content/blog/*.md` entry with title, URL,
and the frontmatter `description`, plus the free-scan URL and `/how-it-works`.
**[?]** Decide whether to hand-maintain it or generate it in `build-blog.mjs` —
generated is strictly better, since a hand-maintained copy makes `public/llms.txt`
a second place for post titles to go stale.

### 4.4 Blog post `@graph` completeness **[?]**

`build-blog.mjs` builds "a self-contained `@graph`, not a flat `BlogPosting`"
and emits `BlogPosting` with `headline`/`description`. My grep was truncated
before I could confirm whether that graph also includes `BreadcrumbList` (the
four marketing pages all have one) and whether `BlogPosting.image`/`author`/
`wordCount` are set. **Confirm before editing** — if `BreadcrumbList` is absent on
blog posts while present on every static page, that inconsistency is worth one
small template edit. This is squarely plan Phase 6's territory.

### 4.5 Also noted, low value

`og:type` is `article` on `how-it-works.html`, `terms.html`, and `privacy.html`
— `website` is more accurate for all three (only blog posts are articles).
Cosmetic; fold into 4.2's edit if convenient, ignore otherwise.
`public/sitemap.xml`'s static-page `lastmod` is hardcoded (2026-08-17) at source
and rewritten from git commit dates at build time by `build-blog.mjs`; if that
rewrite ever warns and continues, stale `lastmod`s ship. Low risk, one-line fix.
Plan Phase 8 owns freshness signals.

---

## 5. Batch 3 — Report usability (master-detail) — **not in the plan file**

The report already has **three nested master-detail levels** (section tabs →
prompt/pillar list → detail pane), and levels 2–3 are well built: `ScanDetail.vue`
handles the GEO section (`.geo-master-detail`, `.geo-master` sticky at
`top: 24px`) and the SEO section (`.seo-master-detail`), both collapsing to a
single stacked column under 700px, with `.geo-detail`/`.seo-detail` carrying no
`overflow` of their own so the page keeps exactly one scroll region. **[V]**

This whole section is net-new relative to the plan's phases. It is also the most
"taste"-dependent work here, so it should follow the data phases rather than
compete with them.

### 5.1 Mobile tap→content jump **[D]**

Below 700px both master-detail containers go `display: block`, so the detail pane
renders *after the entire master list*. On a phone, tapping prompt #1 at the top
of a 5-row list places the content you just asked for below all five rows — you
have to scroll to find it. This follows directly from the stylesheet rather than
from speculation, but worth confirming on your own phone before touching it. **[?]**

Two options:

- **(a) Inline the detail on small screens (recommended).** Render the detail as
  a template fragment *inside* the master `v-for`, directly after the active row,
  so a tap expands content in place. Desktop grid unchanged. Requires
  restructuring the `v-for` into a single list with the detail slotted between
  rows — cheap, but it *is* a DOM-order change, so re-verify the sticky
  `.geo-master` behavior (active only ≥700px) and the SEO equivalent.
- **(b) `scrollIntoView` on select.** Respect `prefers-reduced-motion`, gate to
  the same <700px breakpoint. Less code, but it moves the viewport without the
  user asking — worse on hand-held than (a).

### 5.2 The app-level master-detail was deliberately removed **[V]**

`CompanyDetailView.vue`'s own comment states the scan-history dropdown "replaces
the old permanent list column so the report itself gets full width." Correct on a
phone; a regression on a laptop, where you can no longer see the company list and
its scores while reading a report.

Proposal (Gate G2): restore a two-pane grid **only** at
`@media (min-width: 1100px)` — sticky left rail holding the company switcher plus
scan history — collapsible to a ~56px icon strip with the collapsed state in
`localStorage`. Below 1100px, today's `company-switcher` dropdown stays
byte-identical. Desktop-only, so zero mobile risk, and it restores the "which
company / which scan am I looking at" context that the floating bars
(`.scan-run-fab`, `.scan-report-bar`) also exist to compensate for.

Trade-off to accept explicitly: the report body loses ~260px on desktop, which is
exactly what the removal was buying. The collapsible strip is the mitigation.

### 5.3 Report state is not URL-addressable **[V]**

Section selection and the selected prompt/pillar live only in component refs
(`ReportSectionNav` for the tabs; `ReportGeoSection` defaults to prompt 0, SEO to
the first pillar). Consequences: a refresh loses your place; Back doesn't step
back through sections; nothing is shareable or deep-linkable from the scan-complete
email; and on a phone — where the OS discards backgrounded tabs — that is a
routine annoyance, not an edge case. Plan Phase 5's comparison/diff views would
inherit the same limitation.

Fix: `?tab=geo&prompt=2` / `?tab=seo&pillar=technicalSeo` via `router.replace`,
initialized *from* `route.query` on mount, with a watch on `route.query` keeping
refs in sync. Keep it strictly one-directional (watch route → ref; never ref →
watch → replace) or you get a feedback loop. This composes with
`CompanyProgressChart`'s existing marker-click selection, which should also write
to the URL so it survives a refresh for the same reason.

### 5.4 Smaller items

- Master rows are `<button>`s (good, keyboard-reachable) but carry no
  `role="tablist"`/`role="tab"`/`aria-selected`/`aria-controls`, and arrow-key
  navigation isn't implemented. Cheap a11y win; also helps mobile screen readers.
- `.geo-master`'s sticky `top: 24px` may collide with the app's sticky header
  **[?]** — verify at ≥700px before relying on it in 5.1(a).
- Clicking a `CompanyProgressChart` marker re-selects the scan (good); there's no
  affordance explaining the chart is clickable, and no keyboard equivalent.

---

## 6. Batch 4 — Information density → overlaps plan Phases 1–5

**The organizing insight (and the plan file's own thesis):** most of this is data
the product already collects and stores but never shows. Rows marked ▲ are pure
client-side derivation — no new API calls, no new cost, no server change. Where a
row maps to a phase, **implement it via that phase's design**, not this sketch.

### 6.1 ▲ Show the literal prompt text **[V]** — highest value (pairs with Phase 1)

`rawResponses` carries `promptIndex`/`model`/`text`/`citations`, and
`perPromptRank` carries `promptIndex`/`rank` — but the actual prompt *string* is
server-side only (`shared/aivis-core.mjs`'s template arrays). A user sees "5
prompts" and a generated label, and can never read the question that was asked.
The product's whole premise — "these are the questions your customers ask" — is
invisible inside the product.

Fix: add `promptText` to the stored payload with a length cap (the house pattern),
rendered as the detail pane's header, e.g. *"best emergency plumber in
Rotterdam"*. Old scans have no such field and must degrade silently (the
`asEntityPresence`/`asClarityCheck` lenient-degrade treatment is exactly this
pattern). Knock-ons: a "copy these prompts" affordance, and `how-it-works.html`'s
promise becomes verifiable in-product. Since Phase 1 already touches this exact
payload region, do it in the same change.

### 6.2 ▲ Per-model breakdown (Gate G4 → Phase 2)

`rawResponses[].model` × `perPromptRank` already yields a model × prompt matrix
with rank-coloured cells — answering the most-asked user question, *"which AI
actually recommends me?"*. Add `deriveModelMatrix()` alongside the existing
`deriveCheckBreakdown`/`deriveCompetitorAppearances`/`deriveSeoPillars` in
`src/shared/scanDerived.ts`. **Caveat:** a horizontally scrolling grid creates a
second scroll region, which this codebase deliberately avoids — so gate on G4 and
default to stacked per-model cards if the rule can't be honoured cleanly. Phase 2
owns the scoring/trend half.

### 6.3 ▲ Citation-source analysis **[V]** → Phase 3

`citations[]` is stored per response but surfaces only as a "Sources:" line under
an individual check, and `ownSiteCitations` only feeds a separate list. Aggregate
across the scan: top cited domains, and "your domain cited N×" versus each rival
domain. This is the *actionable* half of GEO — being **cited** is what earns the
mention, so "who is getting cited instead of you" is worth more than the mention
tally the scoreboard already shows. Zero new calls; Phase 3 owns it.

### 6.4 ▲ Coverage / trust strip **[V]** — net-new

`completedCalls`, `failedCalls`, and `failures[]` (per-model, per-promptIndex,
capped error text) are all in the payload — and the score already guards against
`completedCalls < 4`. But the report never says how much of the scan actually ran.
Surface "23 of 25 checks completed · 2 failed (rate limited)" next to the score,
reasons behind a disclosure. This prevents "the score says I'm invisible" when the
truth is "ten calls silently failed". *(A `failures[]` restoration is documented
in `PLAN_NEXT_PHASE.md` as a past accidental deletion — **verify** the dashboard
report path actually receives and renders it before building UI on top.)* **[?]**

### 6.5 ▲ Sentiment roll-up **[V]** — net-new

`shared/CLAUDE.md` records that the sentiment judge was extended to auto-run on
every scan on 2026-08-20, and its classifications are validated and rendered
per-check in the GEO section. But there is no roll-up anywhere, so the
highest-signal and lowest-visibility item in the report — a check where you are
**`negative`** — sits one tab deep behind a per-check badge. Add one
executive-summary line (recommended / comparison-only / negative counts) and
surface negative mentions explicitly.

### 6.6 ▲ "Since last scan" inside the report **[V]** → Phase 5

`CompaniesListView` has delta badges and `score_alerts`, and
`CompanyProgressChart`/`CompetitorTrendChart` live on the detail view — but the
report itself has no delta. The caller already holds the scan history, so a
compact header (score ±N, share-of-voice ±N, mentions ±N vs. the previous scan,
with no-previous-scan handled as a distinct state) is nearly free, and it's what a
returning user opens the report to see. Phase 5's diff views are the bigger
version of this.

### 6.7 Surfaces that may not be rendered at all **[?]** — net-new

My grep for `entityPresence` / `clarityCheck` hit `scanPayload.ts` and docs but
**no** Vue component — the validator accepts and returns both, yet they may never
be displayed anywhere in the dashboard report. `entityPresence` was added as an
off-site authority signal (distinct from Harmonia, which only audits the user's
own site); `clarityCheck` (2026-09-04) answers "does your homepage state anything
specific and quotable". Both are real, shipped, **paid-for** signals. **Confirm
with a targeted grep before assuming** — if genuinely unrendered, that is free
information density for the cost of one component.

---

## 7. Deferred — needs new collection (server-side, Gate G5 → Phase 8)

Not part of batches 1–4. Listed so they aren't lost.

| Idea | Why it matters | Verdict |
|---|---|---|
| **`<meta name="robots">` / `X-Robots-Tag` noindex check** in `harmonia.mjs` | The scanner currently reads **`robots.txt` only** (plus per-bot AI crawler access). A page can be `noindex` via a meta tag or HTTP header while `robots.txt` is wide open — and the report would say "not blocked". Every GEO claim the product makes rests on the page being indexable at all. **[V]** that the `robots` check is `robots.txt`-scoped; the meta-tag path appears unimplemented. | **Pull forward** — the only item here that can invalidate a core claim |
| **`/llms.txt` + `/llms-full.txt` presence** in harmonia | Product-consistent and cheap, but the brand's own `artifacts/ai-visibility-engineering.html` publishes that llms.txt is *not* a ranking lever. Weight it 0 and label it "statement of intent", or don't ship it — don't contradict your own article for a check-box. | Optional, weight 0 |
| **`Organization.sameAs` check** in harmonia's schema validation | Ties harmonia to `entityPresence` and measures §4.1's gap on *customers'* sites — the same gap Foreground has on its own. | Defer |
| **Wikidata fallback** in `entityPresence.mjs` | Currently English-Wikipedia-only, so most SMBs miss entirely (Wikipedia's notability bar). Wikidata is far more permissive and is a common knowledge-graph source for model grounding — a higher hit rate makes the signal useful more often. | Defer, but high leverage |
| **More AI crawlers** in the `robots.txt` check | `AI_CRAWLERS` covers the major set; Meta-ExternalAgent, Amazonbot, Applebot-Extended, Bytespider, DuckAssistBot and co. are a one-array edit for visibly greater thoroughness. | Defer (trivial) |
| **Dutch (`nl`) prompt surface** | `PROMPT_TEMPLATES_NL` and `company.language = 'nl'` exist, and the launch market is Dutch (Rotterdam is the example everywhere). **[?]** whether the report UI renders the Dutch prompt labels properly. | Defer; verify first |

---

## 8. Unverified — confirm before acting

1. **[?]** Whether blog post `@graph`s include `BreadcrumbList` / `BlogPosting.image`. §4.4. (Plan Phase 6.)
2. **[?]** `og-image.png`'s actual pixel dimensions (1200×630 is asserted in `SOCIAL_SETUP.md`, not measured). §4.2.
3. **[?]** Which social profiles actually exist today, for `sameAs`. §4.1.
4. **[?]** Whether `entityPresence` / `clarityCheck` render anywhere in the Vue app. §6.7.
5. **[?]** Whether `failures[]` actually reaches the dashboard report path (documented as once-accidentally-deleted). §6.4.
6. **[?]** Whether `.geo-master`'s sticky `top: 24px` collides with the app's sticky header. §5.4.
7. **[?]** Whether `npm run dev` renders the report identically to a built `dist/` for the master-detail checks (the dev/preview split matters for sticky/scroll behaviour).
8. **[?]** Whether the plan file's Phase 0 full model list fits `.hero-fact-label` at 375px. §3.

---

## 9. Guardrails

1. **`result.html` is frozen** — the unauthenticated legacy renderer for old
   `#d=` links. Any `ScanDetail.vue` change (batch 3) must be verified against a
   real old `#d=` link in both themes before shipping.
2. **Editing a partial or a marketing page rebuilds a lot** — `npm run build`
   runs `vue-tsc --noEmit`, then `vite build`, then `scripts/build-blog.mjs`,
   which regenerates every blog page plus the sitemap. Batch 2 must land before
   batch 3's content-adjacent edits, and every rebuilt surface gets a spot-check.
3. **No new facts without a sweep** — §3's grep is now mandatory for any copy
   touching models, prompt counts, or prices: the four pages, `terms.html`,
   `llms.txt`, `README.md`, the blog posts, **and** the internal doc set (`brand/`,
   `SOCIAL_SETUP.md`, `BETA_TESTERS.md`, `DEEPSEEK-REASONER.md`,
   `netlify/functions/CLAUDE.md`). Rows 2–5 of §3's table exist precisely because
   the previous sweep's file list was too narrow.
4. **Baseline before every batch** — record `npm run build` output *before* the
   first edit so pre-existing errors aren't attributed to the change.
5. **Dashboard-brand boundary** — nothing in batch 3/4 should drag the marketing
   dark/gold/Space-Grotesk system into the app. Per `voice.md` §2/§3 the dashboard
   stays calm and professional; that's a standing decision, not a side-effect of a
   report improvement (`DEEPSEEK-REASONER.md` Gate D2).
6. **Batch size** — 1–3 files per change, checkpointed. Batch 2's `twitter:card`
   edit touches five files but is one mechanical string change; §3 must split
   `index.html` from the doc sweep; and batch 3 must not be bundled with batch 4.
7. **Plan-file precedence** — if this document and
   `~/.claude/plans/do-deep-research-and-cozy-neumann.md` disagree, the plan file
   wins; this doc is an audit and a hazard list, and §0's table says where each
   section is net-new versus already covered.

---

## 10. Definition of done

- **Batch 1 (Phase 0):** no stale model/price/count fact anywhere in §3's sweep
  list; the `index.html` hero no longer contradicts its own How-it-works section
  or its `FAQPage` JSON-LD; `FAQPage` JSON-LD and its visible `<details>` remain
  string-identical; hero fact verified at 375px; grep output quoted in the report.
- **Batch 2:** `sameAs` present (only for profiles that verifiably exist);
  `twitter:card` is `summary_large_image` on all four pages and in the blog
  template; `llms.txt` enumerates posts and the free-scan URL; blog `@graph`
  inconsistency (if found) resolved; `npm run build` clean.
- **Batch 3:** on a phone, selecting a master row shows its detail without
  scrolling past the other rows; report section + selection survive a refresh via
  URL; the ≥1100px rail restores company/scan context and collapses to
  localStorage; `result.html` verified unchanged against a real `#d=` link.
- **Batch 4:** the literal prompt is readable in the report and degrades to hidden
  on pre-existing scans; coverage and sentiment roll-ups appear in the summary;
  "since last scan" shows or states its absence explicitly; anything from §6.7
  found unrendered is wired up or explicitly logged as accepted-missing.
- **Every batch:** exact command output quoted (`npm run build`,
  `npm run type-check`, `npm run test:run` — noting `build` already includes the
  type-check), real numbers including partial passes, anything incomplete called
  out as **"needs manual testing"** rather than claimed fixed. One dated status
  entry in `TODO.md` plus the relevant nested `CLAUDE.md`, matching house
  convention. No commit or push unless explicitly asked.
