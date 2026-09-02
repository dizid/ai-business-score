# Foreground — three-track execution plan

Written after a full repo read (architecture docs, `scanPayload.ts`/`ScanDetail.vue`,
`CompanyDetailView.vue`, marketing assets, `partials/`, blog pipeline, GA wiring).
This is the planning document for the requested engagement across three tracks:
**dashboard/report work, marketing/content, and one known-gap cleanup.**

## 0. Orientation & decision gates first

Everything below is buildable with the codebase as it stands. Before any
implementation, five calls are genuinely the CEO's (taste/business calls, not
engineering ones). The plan stays shippable no matter how they're answered.

| Gate | Question | Recommendation |
|---|---|---|
| **D1** | Portfolio view (REPORTPLAN Change 2): ship the 4-tile strip + search/sort/filter as specified, default sort "needs attention first"? | Ship it — it's already approved and fully specified in `REPORTPLAN.md` |
| **D2** | Report redesign scope: (a) none this round, (b) lite IA/hierarchy polish only, (c) full brand-aligned visual redesign of app + report | (b) at most. A full dark/gold redesign contradicts the standing rule in `voice.md` §2/§3 + `BRAND.md` that the dashboard stays calm/professional — changing that is a separate decision, not a side-effect of this plan |
| **D3** | Blog: CEO reads the 4 posts, then publishes them on-site and wires them into nav/footer? | Yes — they're the CEO's own drafts, already converted and built, but currently **live and unreviewed yet undiscoverable** (nothing links to `/blog` anywhere) |
| **D4** | Cookie consent (Track C): self-built lightweight banner (no vendor, no new dependency) covering public pages **and** the app shell? | Self-built. Keep GA on `app.html` (activation-funnel signal) but consent-gate it exactly like the marketing pages |
| **D5** | Stripe is in **test mode** (reverted 2026-09-02). Before Track B drives real external traffic, do we go live again (live restricted key + live Price IDs)? | Yes, before any external promotion of Track B. Not needed for A or C |

**Proposed order:** **A → C → B**. A is pure product (no shared-template
conflicts, validates fast). C touches the shared page templates (partials, all
HTML entries, blog shell) and should land before B's content edits re-touch the
same files. B is the release capstone — everything live behind it.

## 1. Working rules for every track (non-negotiable)

- **Baseline first:** run `npm run type-check`, `npm run test:run`,
  `npm run build` and record the output *before* the first change. Nothing is
  claimed fixed without a clean run + honest output quoted.
- **Commit per stream** (repo standard: no commits unless asked; when asked, one
  focused commit per track, dated `TODO.md`/nested-`CLAUDE.md` status entries
  updated per house convention).
- **Never touch `result.html` or its legacy theme path** beyond what a change
  requires — it's frozen, unauthenticated, and must keep rendering old `#d=`
  links identically.
- **No lint config exists** — `vue-tsc` + vitest + manual browse-skill passes
  are the gates. Mobile-first (375px) checks on every UI change.
- **No `console.log` in production code; no new dependencies** unless
  explicitly agreed.

## 2. Track A — Dashboard/report

### A1. Portfolio view — implement REPORTPLAN.md "Change 2" (primary feature)

This is the approved-but-never-built agency/portfolio piece. Zero backend
risk — purely client-side reshaping of data `GET /companies` already returns.

Scope, exactly as the plan already specifies (target file verified to exist
as described):

- **`src/app/views/CompaniesListView.vue`**:
  - 4-tile summary strip — *Companies / Leading / Needs attention / No data* —
    computed from the already-fetched array, **reusing the existing
    `scoreBand()`/`scoreColor()`** imports (never reinvent the ≥80/<50/null
    thresholds).
  - Tiles are the filter mechanism (click a tile → filter the list), not a
    separate control.
  - Search/sort/filter controls rendered **only when `companies.length > 1`** —
    hidden at 0–1 companies so the common Free-tier case stays clean.
  - Search: case-insensitive substring on `brand`/`category` only, via
    `.includes()`, never `new RegExp(userInput)`.
  - Sort keys: **Needs attention first (new default)**, Score high→low, Newest
    first, Name A→Z.
  - Empty states: no strip/controls at zero companies; new "No companies match
    your filters + Clear filters" state for post-filter emptiness.
- **`src/app/CLAUDE.md`** + **`README.md`** walkthrough updated to describe the
  new controls.
- **Verification:** `vue-tsc` clean; manual browse pass on a 0-company account,
  a 1-company Free account (strip shows, controls hidden), and a 3+ company
  account in mixed score bands; tile-click-filter; each sort key; narrow
  viewport wrap check.

### A2. Report redesign — decision-gated, three options

`ScanDetail.vue` currently renders (dashboard theme) inside a desktop two-pane
master/detail that collapses to a single pane on mobile (list is hidden once a
scan is selected; "Back to list" returns). The Overview/Details tab split from
REPORTPLAN Change 1 already shipped. Options if a redesign is wanted on top of A1:

- **(a) None this round** — recommended. A1 is the meaningful product
  improvement.
- **(b) Lite IA/hierarchy polish** (the pick if *some* redesign is wanted):
  keep palette and component structure, fix hierarchy and density only —
  - Overview tab re-ordered to the decision path: *score ring → one-line
    plain-language verdict → advice cards → what changed vs. last scan* →
    everything else below.
  - Scan-history list entries gain a colored score-dot or left-border using
    the existing score-band color (so the list is scannable without opening
    each scan).
  - Mobile detail pane gets a sticky mini-header (company + score + Back) so
    context isn't lost while scrolling a long report.
  - All changes stay theme-agnostic or legacy-gated so `result.html` renders
    unchanged — verified with a real old `#d=` link.
- **(c) Full brand-aligned visual redesign** (dark/gold Space Grotesk through
  `src/app/` + report): highest impact, highest cost, and it reverses the prior
  explicit decision to keep the app calm/professional. If chosen, the process
  must be: browse-skill mock iterations on a built `dist/` first (no code until
  the direction is approved), then a theme-layer change (`src/shared/theme.css`
  token swap) rather than scattered restyles.

A2 must not balloon into the unshipped items from
`docs/improvement-roadmap.md` (competitor-benchmarking view, ops/failure view,
scheduled-scan UX) — out of scope unless explicitly requested.

## 3. Track B — Marketing/content

**The find that defines this track:** all four blog essays are already
converted, already in `content/blog/*.md`, and already rendered into
`dist/blog/*/` by the post-build pipeline — but (1) the CEO has never read them
(the source drafts and the docs both say "needs Marc's read before posting"),
and (2) **nothing on the site links to `/blog`** — `partials/nav.html` is only
"Log in / Get in the foreground", the footer doesn't link it, and no post
cross-links to another. The content is live-but-invisible: exactly backwards
for an SEO/GEO play.

### B1. CEO review pass (no code — read 4 posts)

`ai-is-the-new-front-page.md`, `seo-vs-geo-concretely.md`,
`anatomy-of-an-ai-answer.md`, `ai-visibility-checklist.md` — each ~700–800
words, dated 2026-08-24. Review checklist:

- **Fact accuracy vs. today's product:** model list must read GPT-5 mini,
  Gemini 3 Flash, Claude Haiku 4.5, Grok 4.6 (4 models / 5 prompts / 20
  checks); score 0–100; the checklist post's manual steps shouldn't promise
  more than the scanner does.
- **Voice rules (`voice.md`):** literal, no invented stats, no SaaS filler;
  the product may or may not be named — decide whether these are editorial
  (brand-building, better for organic) or product-pitching.
- **No internal links yet:** decide whether each post gets an editorial
  one-line CTA (signup / scan) — recommend yes, softly, in the last post only.
- Note: `content/articles/*.md` are the *separate* long-form + X-thread
  versions of the same essays, still unreviewed — on-site blog publication
  does **not** clear them for social posting. Social distribution stays a
  later decision.

### B2. Publish-readiness edits (code, after review)

- Apply edits to `content/blog/*.md` (title/description/body as needed).
  Frontmatter is minimal — `title`, `description`, `date`; the build script
  owns slug/OG/sitemap from those.
- Optional but recommended: cross-link the four posts to each other (they're
  genuinely sequential) — pure markdown links inside the bodies.

### B3. Discoverability wiring (code)

- `partials/nav.html`: add a `Blog` link (mobile-safe — nav is already tiny).
- `partials/footer.html`: add Blog + the four post links (or just `/blog`) —
  check current footer structure before editing.
- This is a **partials change → rebuilds all 4 marketing pages + all blog
  pages + `app.html`** — one deploy carries it. Verify none of the re-rendered
  pages regress (build + spot-check).
- `public/sitemap.xml` lastmod bump happens automatically via
  `build-blog.mjs`; confirm post URLs appear.

### B4. Launch verification

- `npm run build` → serve `dist/` → browse-skill check of `/`, `/blog`, and all
  4 posts at 375px + desktop: no broken links, OG/canonical all
  `https://foreground.info/...`, nav renders on both marketing and blog pages,
  GA fires on a blog page.
- `curl -I https://foreground.info/blog/<slug>/` → 200 after deploy.
- Grep-verify the fact layer (`4 models`, the four model names, `$99`, `$19`)
  is identical across the 4 pages, `terms.html`, `llms.txt`, and the blog
  posts — this is the known drift risk, so make it an explicit verification
  step each time copy ships.
- **D5 applies here:** if this track precedes Stripe going live again, real
  visitors hitting signup → Pro/$19 will dead-end at test-mode checkout.

## 4. Track C — Cleanup: the documented cookie-consent gap (recommended pick)

**Why this one:** it's the gap the root `CLAUDE.md` itself flags as "**Known
gap, not built**" — and it's a legal/trust issue, not a polish issue. GA4
(`G-HZKLBPKH81`) now runs on every indexed page, `privacy.html` discloses the
cookie, but **no consent mechanism exists**, which is the real question mark
for EU visitors that the docs call out. Closing it also happens to be small and
dependency-free.

*(Alternatives weighed and set aside: a "facts single source of truth" test —
valuable, but B4's grep-check covers the real risk cheaply; the stale billing
line in `netlify/functions/CLAUDE.md` — real but tiny, fold into the same
commit's doc sweep; `REGRESSION_ALERT_THRESHOLD` duplication — cosmetic. If one
of these is preferred as the cleanup, each is a 1-2 hour swap for this track.)*

### C1. Mechanism design (self-built, no vendor, no new dependency)

- **Default is no tracking.** `partials/ga4.html` stops loading the gtag script
  unconditionally. A tiny consent script decides on every page load:
  - Stored `granted` → load GA as today.
  - Stored `declined` → never load it.
  - No decision → show a small banner; "Accept" stores + loads GA; "Decline"
    stores + does nothing. A decline must be reversible (small "cookie
    settings" link in footer, or clear-on-revisit — keep it minimal).
- **New `partials/consent.html`**, included in `<head>` **immediately before**
  the `<!--#include:ga4-->` marker in all four marketing entries and `app.html`,
  plus one line in `scripts/build-blog.mjs`'s `pageShell()` (it already
  resolves partials via `resolveIncludes`, so a new partial is picked up with
  zero pipeline changes — just add the marker line). **`result.html` stays
  untouched** (it deliberately has no GA).
- **Banner markup:** injected by the consent script itself (so one partial
  serves every surface), fixed bottom on mobile-first, self-contained CSS so it
  renders correctly in both the dark marketing theme and the calm light app
  theme — gold/glass accent on public pages; plain, low-contrast styling inside
  `src/app`.
- **App-shell specifics:** `router.ts` currently sends a manual `page_view` on
  every client-side route change via `afterEach`. That call must become
  consent-aware — buffered/no-op until `granted`, then fire for the current
  route when consent lands. The banner must render inside the SPA shell even
  though the consent script is a head partial — the consent script exposes a
  tiny state hook the Vue shell reads; in-app banner is a small component, not
  the raw partial.
- **Copy sync:** update `privacy.html`'s Cookies section to describe the banner
  and both outcomes (currently it discloses the cookie but implies no choice
  exists). Terms unaffected.

### C2. Files touched (bounded list)

`partials/consent.html` (new) · `partials/ga4.html` (gated) · `index.html`,
`how-it-works.html`, `privacy.html`, `terms.html` (include line + privacy copy)
· `app.html` (include line) · `src/app/App.vue` + `router.ts` (banner +
consent-aware page_view) · `scripts/build-blog.mjs` (shell include line) ·
`README.md` walkthrough · `src/app/CLAUDE.md` + root `CLAUDE.md` (remove
"Known gap, not built" line) · doc-sweep: correct the stale `$199/mo`/billing
line in `netlify/functions/CLAUDE.md` in the same commit.

### C3. Verification

- Build + type-check clean.
- Browse-skill passes against a local `dist/` server, on **all four marketing
  pages + one blog post + `/app/login`**:
  - First visit → banner shows, **no network request to
    `googletagmanager.com`** (devtools network panel in the browse session).
  - Accept → gtag loads, GA ping fires.
  - Decline → no load; revisit → no banner, still no load.
  - Returning with stored `granted` → GA loads immediately, no banner flash.
  - SPA: login → navigate to a company → one `page_view` per route only after
    consent.
  - 375px layout: banner buttons don't overflow, dismissible without covering
    the CTA.

## 5. Cross-track risks & guardrails (read before starting)

1. **Dashboard-brand boundary** — Track A2(c) and any marketing-voice spillover
   into the app reverse a documented CEO decision. If it's ever approved, it's
   a deliberate, separate choice (Gate D2), not bundled.
2. **`result.html` frozen** — every `ScanDetail.vue` change must be verified
   against a real old `#d=` link in both themes before shipping.
3. **Deploy gotcha (documented in `CLAUDE.md`):** env-var changes and manual
   redeploys cache by git commit — always push a real commit; don't trust a
   manual redeploy after a var change. (C introduces no new env vars, which is
   exactly why self-built consent is the low-risk choice.)
4. **Stripe test mode** (Gate D5) — any real-traffic push needs the live
   restricted key + live `$99`/`$19` Price IDs restored. Track A's Pro-gated
   features work fine in test mode; external promotion does not.
5. **One partials edit rebuilds a lot** — B3's nav/footer change re-renders
   every page; C's head include does the same. That's why the ordering
   A → C → B and the per-surface browse checks matter.
6. **No new facts without a sweep** — any copy that names models, prompt
   counts, or prices must be grep-verified across the 4 pages, `terms.html`,
   `llms.txt`, `README.md`, and the blog posts in the same change (B4 step,
   made mandatory).

## 6. Definition of done (whole engagement)

- A: portfolio view live with all four tiles + filters + new default sort;
  verified on 0/1/3+ company accounts and mobile.
- C: no GA data collection anywhere before consent; banner on every GA-bearing
  surface; privacy copy truthful; docs updated; no dependency added.
- B: CEO has read all four posts; they're published with edits, linked from nav
  + footer + each other; `/blog/*` verified 200 with correct OG/canonical;
  fact-grep clean.
- One dated status entry per track in `TODO.md` and the relevant nested
  `CLAUDE.md`, matching house convention; `README.md` walkthrough extended;
  each track its own commit, pushed only on the CEO's word.
- Final report: exact command outputs (`type-check`, `test:run`, `build`)
  quoted honestly, browse-skill screenshots, and anything needing manual check
  called out as such — never "fixed" without proof.
