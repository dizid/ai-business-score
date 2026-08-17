# TODO-MARKETING

## STATUS 2026-08-17: "Spotlight" rebrand + schema.org + SEO/GEO — SHIPPED, not yet deployed

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
