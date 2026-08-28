# TODO-MARKETING

## STATUS 2026-08-24: `content/articles/` repurposed into an on-site `/blog` — pipeline SHIPPED, content still unreviewed

**Trigger:** Marc asked to make the app "best of breed," including "more
SEO, possibly." Full plan: `~/.claude/plans/ethereal-waddling-globe.md`.
Directly follows up on the entry below, which had already found
`content/articles/`'s 4 drafts and flagged them as the PR/thought-leadership
angle the marketing plan wanted, but unbuilt.

**What shipped:** the 4 drafts are now web articles at `content/blog/*.md`,
rendered by a new build pipeline (`scripts/build-blog.mjs`) into a real
`/blog` on the site, indexed in `sitemap.xml`. See `TODO.md`'s 2026-08-24
"On-site `/blog` pipeline" entry and `CLAUDE.md`'s "`/blog`" architecture
section for the technical detail. The original `content/articles/*.md`
files (LinkedIn/Substack + X-thread format) are untouched — still usable
for the social posting the entry below was scoped for; the blog gives the
same underlying essays a second, on-site distribution channel.

**Not resolved by this**: the content is still Marc's original draft,
explicitly marked "needs Marc's read before posting" — nothing here
changes that. The analytics gap (zero tracking on the site, noted below)
and the PR-pitch angle are also still open.

## STATUS 2026-08-24: real pricing set + monetization/marketing plan drafted — pricing copy SHIPPED, most marketing work still open

**Trigger:** Marc asked for "alot of improvements to monetize and market
this app," wanting a low one-time scan fee plus subscriptions/Pro, and a
marketing/PR/sales strategy. Full plan:
`~/.claude/plans/we-need-alot-of-transient-floyd.md`.

**Pricing decided and shipped**: Pro subscription **$199/month** (a
deliberate premium position, above Otterly's $29 and Peec AI's $95 entry
points per the existing competitor research — no longer "cheapest in
category," a real repositioning), one-time single scan **$19**. Synced
across `index.html` (pricing cards, JSON-LD, FAQ), `llms.txt`,
`README.md`, `terms.html`, and the app itself (deep advice now actually
Pro-gated — see `TODO.md`'s 2026-08-24 entry for the engineering side).
The Stripe Price behind the old subscription was found to actually charge
$29/mo (a stale placeholder) — corrected the same day.

**Marketing/PR/sales — planned, mostly not executed**: the plan's Part B
covers positioning for the new premium price (lean on the 4-model breadth,
sentiment+citation attribution, the candid "limitations" page as a trust
signal), an analytics gap (confirmed zero tracking exists anywhere on the
site — recommended Netlify Analytics or Plausible, not yet added), a PR
angle (a `proof-script`-generated "state of AI visibility" stat, pitched to
GEO-beat trade press; the honesty page as its own contrarian hook), and
repointing `proof-script/OUTREACH.md`'s cold-outreach sequence at
Foreground itself instead of Site Improver (see `TODO.md`'s 2026-08-09
"NEXT-STEPS.md GTM resume-point" history entry for the 2026-08-24 update
this refers to — `NEXT-STEPS.md` itself was retired into that entry
2026-08-27). **None of that Part-B work is built yet** — this
status entry is pricing/copy only.

**Also found, unrelated to this plan**: a 4-part content article series
(`content/articles/`, LinkedIn/Substack/Facebook + X-thread versions each,
marked "draft — needs Marc's read before posting") already exists,
apparently from a separate concurrent session — covers exactly the
data-driven/thought-leadership PR angle the plan called for. Not written
or reviewed as part of this session's work.

## STATUS 2026-08-18: renamed AIVis → Foreground — SHIPPED and pushed

**Trigger:** asked to start planning a real custom domain for AIVis.
Researching domain availability turned up two separate collisions:
"AIVis" is already used by several companies in the identical
AI-visibility/GEO niche (`aivis.ai`, `aivis.biz` — doing near-identical
work, `aivis-os.com` — literally branded "AI Visibility", AIVIS Inc. — a
funded medical-AI company likely holding real trademarks); separately,
"Spotlight" (the marketing identity from the entry below, shipped hours
earlier) collided too — `get-spotlight.com` is a live direct competitor
with the identical pitch. You reviewed a vetted shortlist (checked against
the same competitor landscape) and picked **"Foreground"** — clean against
everyone found. Full plan:
`~/.claude/plans/let-our-marketing-department-starry-frog.md` (overwritten
with this task's plan; the Spotlight plan above is no longer there, but
its outcome is unaffected).

**What shipped:** a full user-facing rename, everywhere a user or crawler
sees the product name — the four marketing pages (titles, wordmark,
footer, JSON-LD `name` fields, meta tags), the authenticated app's page
titles and nav wordmark (`src/app/App.vue`, `router.ts`,
`CompanyDetailView.vue`), the legacy `result.html`'s error copy,
`site.webmanifest`, `llms.txt`, the `proof-script` CLI's `--help` banner,
the outreach playbook, and `README.md`/`CLAUDE.md`'s current-state
sections. Every literal "spotlight/stage/offstage" metaphor word in the
marketing copy moved to "foreground/background" language — new primary
tagline: **"Every AI answer has a foreground. Make sure you're in it."**
The Spotlight-era **visual system is unchanged** (same dark palette, same
hex values, same Space Grotesk, same radial-glow/score-ring/stage-line
motifs) — only the words "AIVis" and "Spotlight" had collided, not the
design, so `public/marketing-theme.css` wasn't touched.
`brand/BRAND.md`/`brand/voice.md` rewritten again (third supersession:
Top Banana → Spotlight → Foreground), same in-place pattern as before.
`public/og-image.png` regenerated with the new wordmark/tagline via the
same browse-skill screenshot method.

**Deliberately NOT renamed** (internal-only, zero user-visible benefit,
real migration cost): `shared/aivis-core.mjs` and its ~10 importers,
`package.json`'s `"name": "aivis-web"`, the Netlify site name/ID
(`aivis-scan`), the Neon project name (`aivis`), the Netlify Blobs store
(`aivis-scans`), the GitHub repo. Dated/historical docs (`TODO.md`,
`PLAN_NEXT_PHASE.md`, `DASHBOARD.md`, `WISH_LIST.md`,
`REPORTPLAN.md`, `docs/*`, the nested `CLAUDE.md` files) still say "AIVis"
where that was the real name on that date — intentional, not missed.

**A domain has NOT been registered yet.** Every canonical/OG/JSON-LD/
sitemap/robots/llms.txt URL still intentionally points at
`aivis-scan.netlify.app` — swapping them to a domain nobody owns yet would
break real, live, crawled metadata. Candidates worth checking/registering
(your action — no payment/registrar access from this session):
`foreground.ai`, `getforeground.com`, `tryforeground.com`,
`foreground.app`. `foreground.com` is likely unavailable (an unrelated
Atlanta photography-tools company appears to hold it, not a category
collision). **Once you own one:** add it as a Netlify custom domain (DNS +
auto-SSL), update Neon Auth's `trusted_origins`, then swap every URL above
to the new domain in one coordinated pass — don't do the URL swap before
the domain is actually live.

**Verification:** `npm run build` and `npm run test:run` both green
(40/40 tests pass, including the word-boundary fixture in
`tests/aivis-core.test.mjs` that deliberately still says "AIVis" on
purpose — don't "fix" it, it exercises the `\b` boundary check). Scoped
case-sensitive grep (`\bAIVis\b`, excluding node_modules/dist/.git)
confirmed the only remainders are: intentional historical docs, the
preserved test fixture, `shared/aivis-core.mjs`'s own header comment (and
its siblings' matching header-comment style, left alone for consistency),
`DEEPSEEK.md` (an unrelated external handoff doc), and this file's own
history section below. All 4 pages' JSON-LD validated with `JSON.parse`.
Visually checked all 4 marketing pages plus `app.html`'s built title via
the `browse` skill against a local `dist/` server — correct rendering, no
console errors, no leftover "spotlight" text anywhere in shipped copy.
Committed (`d5f68bb`) and pushed to `master`.

## Open items carried forward

1. **Favicon is still shared site-wide** (unchanged from the entry below —
   this rename didn't touch icons, only text). Still an open decision if
   you want the in-app dashboard to keep a different tab icon.
2. **`src/app/` visual system still not extended** — the *name* changed
   throughout the app (titles, nav wordmark now say "Foreground"), but
   `LoginView.vue`/`SignupView.vue`/the dashboard still use the old
   blue/light in-app palette, not the dark/gold marketing system. The
   visual seam between marketing and app-shell login noted below is now
   smaller (same product name on both sides) but still there
   (different palette/theme).
3. **Pro price still unset in Stripe** — unchanged, see below.

---

## STATUS 2026-08-17: "Spotlight" rebrand + schema.org + SEO/GEO — SHIPPED, superseded 2026-08-18 by the rename above (name/tagline only — palette/type/motifs described below are still current)

**Trigger:** CEO asked marketing to continue the (mis-typed as "/branding")
`/brand` folder work, add schema.org structured data, and finish SEO/GEO
work. `/brand/BRAND.md` documented a CEO-approved "Top Banana" ape-mascot
concept (written 2026-08-11) that had never been implemented in code. When
reviewed today, the CEO rejected it outright — no mascot, wants a brand new
design. Full plan: `~/.claude/plans/let-our-marketing-department-starry-frog.md`.

## What shipped

**New brand identity: "Spotlight"** — an AI-generated answer is a stage
spotlight; very few names get to be in it, everyone else stays offstage.
No mascot, no character, no illustration — pure palette/type/motif, all
CSS/SVG.

- Palette (dark-first): stage black `#0a0a0d`, spotlight gold `#ffb830`
  (CTAs, "cited" highlight, score-ring peak — used sparingly), signal blue
  `#4da3ff` (links/secondary), offstage graphite `#3a3a40` (the
  "not-mentioned" state).
- Typography: **Space Grotesk** for headlines (Google Fonts), system-ui
  body unchanged.
- New shared stylesheet: `public/marketing-theme.css` — replaces four
  previously-duplicated inline `<style>` blocks. This also fixed a real
  bug: `how-it-works.html`/`privacy.html`/`terms.html` were stuck on an
  old, already-retired blue palette that `index.html` itself had moved
  past twice.
- Regenerated `public/og-image.png` and the full favicon set to match.
- Tagline: **"There's a spotlight on every AI answer. Make sure it's on
  you."** Copy rewritten across `index.html` (hero, CTAs, section
  headings, FAQ) and lightly on `how-it-works.html`. `privacy.html`/
  `terms.html` left untouched by design — legal copy stays plain per
  `brand/voice.md`'s own rule.
- `brand/BRAND.md` and `brand/voice.md` rewritten in place (same
  supersession pattern the docs already used once before).
  `brand/image-prompts.md` deleted (was mascot image-gen prompts, now
  moot). `content/growth-ideas.md` flagged at the top as containing stale,
  Top-Banana-specific campaign ideas — not rewritten, that wasn't asked
  for.

**Schema.org / SEO / GEO:**

- Fixed stale `public/llms.txt` (was describing a 2-model lineup; now
  matches the real 4-model/5-prompt/20-check scan) and corrected a stale
  scoring-formula description found in the same pass.
- Added `HowTo` structured data to `how-it-works.html`.
- `how-it-works.html`/`privacy.html`/`terms.html` now each carry a
  self-contained JSON-LD `@graph` (their own `WebSite`+`Organization`
  nodes) instead of dangling `@id` references that only resolved inside
  `index.html`'s own document.
- `Organization` node enriched with a `logo` field (new `og-image.png`).
  No `sameAs` added — no real social profiles exist, not fabricating them.
- `sitemap.xml` — added `<lastmod>2026-08-17</lastmod>` to all 4 entries.
- `index.html`'s `FAQPage` JSON-LD re-synced to be string-identical to the
  rewritten visible FAQ copy (Google's FAQPage requirement) — verified
  programmatically, 4/4 match.

**Verification performed:** `npm run build` green throughout (ran after
each of the three implementation passes and once more after final fixes).
All 4 pages' JSON-LD blocks confirmed well-formed (`JSON.parse` on each
extracted `<script>` block). Visually checked `index.html` and
`how-it-works.html` at desktop (1440px) and mobile (375px) via the
`browse` skill against a local static server of `dist/` — dark theme,
gold/blue accents, Space Grotesk, radial hero glow, and the dissolve
demo animation all render correctly. No console errors.

## Open items — need a decision, not yet acted on

1. **Favicon is shared site-wide.** Regenerating it for the marketing
   pages also changed the browser-tab icon on `app.html` (the
   authenticated dashboard) and `result.html` (the frozen legacy
   share-link page) — both of which `brand/BRAND.md` says should stay
   untouched. Low-stakes (it's a tab icon, not the UI itself), but if you
   want the in-app dashboard to keep its old icon, that needs a second,
   separate icon file scoped to just those two entry points.
2. **Score-ring badge reads a little like a loading spinner.** The new
   conic-gradient score-ring motif (top-right corner of the dissolve demo
   and the Pro pricing card) is a static decorative element, but at a
   glance it could be mistaken for an actual loading indicator. Minor
   polish item, not a functional bug — worth a second look before a wider
   launch push.
3. **Pro price is still unset in Stripe** (unchanged by this work) —
   `index.html`'s pricing card and the `SoftwareApplication` JSON-LD both
   deliberately still omit a Pro-tier number. Once that price is
   finalized in Stripe, both need updating together.
4. **`src/app/**` (including `LoginView.vue`/`SignupView.vue`) was
   explicitly out of scope this round**, per your answer during planning.
   A visitor now goes from the new dark Spotlight marketing site straight
   into the old, untouched blue in-app login/signup screens — a real
   visual seam. Not a bug, just flagging it as the natural next scope if
   you want the rebrand to carry through the signup flow.
5. **`DEEPSEEK.md`** (repo root) is an unrelated, untracked handoff file
   from a separate AI-tool session — not touched by this work, not staged
   in the commit below. Flagging so it isn't mistaken for part of this
   change if you `git add -A` later.

## Files changed

`brand/BRAND.md`, `brand/voice.md` (rewritten) · `brand/image-prompts.md`
(deleted) · `content/growth-ideas.md` (stale-flag note) · `index.html`,
`how-it-works.html`, `privacy.html`, `terms.html` · `public/marketing-theme.css`
(new) · `public/og-image.png` + favicon set + `site.webmanifest` ·
`public/llms.txt`, `public/sitemap.xml`.

Not touched: `src/app/**`, `src/shared/theme.css`, `result.html`,
`app.html`, `netlify/functions/**`, the database schema.

## Next steps

- Deploy (push to `master` → Netlify CI builds and publishes
  automatically per `netlify.toml`).
- Decide on the favicon question (item 1) before or after deploy — it's a
  one-line fix either way.
- When ready, extend Spotlight into `src/app/` onboarding (item 4) as a
  separate follow-up task.
