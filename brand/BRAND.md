# Foreground brand design

**2026-08-23: the CEO explicitly reversed the "dashboard stays calm,
always" rule below — for the authenticated dashboard specifically, not
the legacy shareable-link page.** The CEO found the dashboard (in
particular `ScanDetail.vue`'s scan-results view) boring and asked for real
color, more graphics, and clearer visual structure, overriding this
document's prior "no radial glow or score-ring flourish on `ScanDetail.vue`"
stance. **What changed:** `src/app/**` and `ScanDetail.vue` (when rendered
with its new `theme="dashboard"` prop) now have their own expanded
palette — `--accent-2` (violet, `#7c5cff` light / `#b3a1ff` dark, the Site
Health score's identity color), `--accent-3` (teal, `#0b8793` light /
`#5eead4` dark, for categorical chart differentiation), Space Grotesk
headings (reused from the marketing typography below, for cross-surface
consistency), a restrained band-colored glow on the AI score ring, and
donut-gauge charts for the Site Health pillars instead of flat bars — all
defined in `src/shared/theme.css` and gated behind `.theme-dashboard` in
`ScanDetail.vue`. **What did NOT change:** this is still not a copy of the
marketing palette below — no gold, no page-wide glow, no mascot — a
deliberately distinct, more restrained direction for a data-dense tool.
**What's still unchanged and still governed by the original 2026-08-10/17
decision:** `result.html` (the pre-pivot shareable-link page). It renders
`ScanDetail.vue` with `theme="legacy"` (the default), so it stays exactly
as calm/muted/professional as this document originally promised — the
reversal above applies to the authenticated dashboard only. See "Why this
scales" at the bottom, revised the same day to reflect this three-way split.

Written 2026-08-10. Original version anchored the CEO's "AI scoring = more
sales!!" positioning into a generic blue/violet SaaS visual identity. That
day, the CEO approved a jungle/mascot direction — **Top Banana** — pitched
by the creative director in session. **2026-08-17: the CEO reviewed Top
Banana and rejected it outright** — "no mascot, brand new design" — before
a single pixel of it had shipped (zero palette tokens, zero font loading,
zero copy had actually landed in code). That same day this document
replaced Top Banana with **Spotlight**, which *did* ship (palette,
typography, motifs, copy — commit `5f0d0c8`).

**2026-08-18: the product itself is renamed AIVis → Foreground, and
"Spotlight" is retired as a name (not as a visual system).** Two unrelated
collisions surfaced back-to-back while researching a real custom domain:
"AIVis" collided with several existing companies in the identical
AI-visibility/GEO niche (`aivis.ai`, `aivis.biz`, `aivis-os.com`, AIVIS
Inc.); separately, this document's own direction name "Spotlight" collided
with `get-spotlight.com`, a direct competitor doing the identical thing.
"Foreground" was checked against the same competitor landscape and is
clean. **What changes:** the product name and every "spotlight/stage/
offstage" metaphor word become "foreground/background" language (this
document is rewritten below to reflect that). **What doesn't change:** the
palette hex values, Space Grotesk, and the radial-glow/score-ring/stage-
line motifs — none of those had a name-collision problem, only the words
"AIVis" and "Spotlight" did. The foreground (lit, gold)/background (dark,
muted) duality maps onto the exact same visual system the "lit vs. offstage"
duality already used.

**Critical boundary:** this *specific* gold/graphite/radial-glow/mascot-free
brand direction governs the four static marketing entry points only —
`index.html`, `how-it-works.html`, `privacy.html`, `terms.html` — plus
their shared stylesheet and OG/favicon assets. It still does **not** govern
`src/app/**` or `result.html` — see the 2026-08-23 note at the top of this
document: the authenticated dashboard now has its *own*, separately-defined
expanded palette (not this one), while `result.html` stays on the original
calm/muted/professional treatment this section describes below applying
only to marketing. (The 2026-08-18 rename does update the *product name
text* inside `src/app/**` — titles, the nav wordmark — since that's a
plain find-replace of what the app is called, not an application of this
document's visual direction to the dashboard.) See "Why this scales" below
for the reasoning that justifies the three-way visual split.

## The world

An AI-generated answer has a foreground and a background. There's room for
very few names in the foreground — usually one, sometimes a handful — and
everyone else the model considered stays in the background, invisible to
the person who asked the question. That's not a metaphor stretched to fit;
it's a literal description of what Foreground measures: cited (foreground)
vs. never mentioned (background), for a business asking "does the AI
recommend me or someone else?" No character is needed to explain a
foreground and a background — everyone already understands what it means
to be the thing a picture is actually about, versus the thing that fades
into the rest of the frame.

## Positioning statement

> For small and local businesses who have no idea whether ChatGPT and
> Gemini recommend them — and who suspect AI search is quietly sending
> customers to a competitor instead — unlike SEO tools that only track
> Google rankings, **Foreground scores your AI visibility directly and
> ties it to the thing that actually matters: getting picked over the
> competitor.**

The causal chain is the whole pitch: *AI search is replacing "10 blue
links" with a single spoken answer → if that answer doesn't name you, the
sale already happened for someone else → your AI Score is a leading
indicator of that outcome, not a vanity metric.* Every headline should
imply this chain, not just state "we check AI visibility." This carries
forward unchanged from every prior version of this document — only the
"what it looks like and what it's called" layer ever changes.

## Tagline

**Primary: "Every AI answer has a foreground. Make sure you're in it."**

| Variant | Where to use |
|---|---|
| "Every AI answer has a foreground. Make sure you're in it." | Hero headline, logo lockup, social bio |
| "Get in the foreground." | Nav CTA, OG image, tight spaces |
| "AI already picked someone. Was it you?" | Ad copy, retargeting — loss-framed, states the causal chain's stakes directly rather than implying them |

## Voice

Direct, causal, grounded — unchanged in substance from every prior version
of this document, only the flavor vocabulary changes (no more "climb,"
"canopy," "underbrush," "top banana"; no more "spotlight," "offstage," "in
the light"; now "foreground," "background," "cited"):

- Lead with the outcome (sales), not the mechanism (AI visibility). "More
  sales" beats "better visibility" in every headline-level sentence.
- Short sentences. No "leverage," "unlock," "empower," or other SaaS filler.
- It's fine to name the threat plainly: *a competitor is the one getting
  mentioned instead of you.* Loss-framing is on-brand here, not
  fear-mongering — it's the literal mechanism (`competitorTallies` in the
  scoring engine).
- Every claim stays grounded in what the product actually does: four AI
  models (OpenAI's GPT-5 mini, Google's Gemini 3 Flash, Anthropic's Claude
  Haiku 4.5, xAI's Grok 4.6), five prompts per scan, twenty checks total, a
  0-100 score tracked over time. Don't inflate beyond that.
- Foreground/background vocabulary ("in the foreground," "cited," "the
  background") is available for headline-level copy, but it's flavor on
  top of the same grounded claims above, not a license to invent
  capabilities. "In the foreground" still means "your 0-100 AI Score is
  high," nothing more mystical.

## Color palette

Three surfaces, three palettes, as of 2026-08-23 (was two before that
date — see the note at the top of this document):

- **Marketing (the four static entry points)** — the palette below,
  unchanged in hex values from the Spotlight version; only the row labels
  are renamed to match the foreground/background naming.
- **Authenticated dashboard** (`src/app/**`, `ScanDetail.vue` rendered with
  `theme="dashboard"`) — its own intentional, expanded palette, defined in
  `src/shared/theme.css`: the original neutrals and single blue `--accent`
  stay (still the AI Visibility Score's own color), plus new identity
  colors layered on top — `--accent-2` (violet, `#7c5cff` light /
  `#b3a1ff` dark, the Site Health score's own identity, distinct from the
  AI score) and `--accent-3` (teal, `#0b8793` light / `#5eead4` dark, for
  categorical chart differentiation) — and Space Grotesk for headings
  only, reusing the marketing typeface below for cross-surface
  consistency without adopting marketing's motifs. Deliberately **not** a
  copy of the marketing palette: no gold, no page-wide glow, no mascot —
  the score-band colors (`--good`/`--warning`/`--serious`/`--critical`)
  are untouched, since they're semantic ("how good") and a separate axis
  from the new identity colors ("which score/category"). The one
  restrained motif borrowed at all is a soft, band-colored glow on the AI
  score ring itself — not a page-wide effect.
- **Legacy shareable-link page** (`result.html`, `ScanDetail.vue` rendered
  with its default `theme="legacy"`) — still exactly the original
  calm/muted/utilitarian treatment this document has always promised for
  it, completely unaffected by the dashboard palette above.

**Dark-first, deliberately:** the site defaults to this dark theme
directly — `color-scheme: dark` set outright in the shared stylesheet, not
toggled via `prefers-color-scheme`. Real darkness is what makes something
read as "in the foreground" versus faded into the background; a light-mode
fallback would mean half of visitors never see the contrast at all. This
matches the CEO's standing "dark mode default where appropriate"
preference.

| Role | Hex | Use |
|---|---|---|
| Stage black | `#0a0a0d` | Base background |
| Surface | `#17171b` | Cards, panels |
| Ink | `#f5f4f0` | Primary text |
| Muted | `#a8a6a0` | Secondary text |
| Foreground gold | `#ffb830` | The "you're chosen" color — CTAs, the "cited" highlight, the score-ring peak. Used sparingly, same "prize color, not a fill color" discipline every prior version of this doc got right — reserved for the moment something is chosen, never a background or general fill |
| Signal blue | `#4da3ff` | Secondary/workhorse accent — body links, focus rings, icons, the UI chrome that isn't a "you're chosen" moment |
| Background graphite | `#3a3a40` | The unlit/not-mentioned state — ghosted or dimmed content, the track behind a score-ring's gold arc |

"Cited" and "not mentioned" map directly to gold vs. graphite — foreground
vs. background — the same "no separate green needed" logic every prior
version of this palette used. In the shared stylesheet
(`public/marketing-theme.css`), gold and blue are kept as **separate
tokens** (`--gold` / `--accent`) specifically so implementers don't
default every interactive element to gold out of convenience — gold
appears only where something has actually been chosen (CTA buttons, the
Pro plan's border, the score-ring), while blue carries the rest of the UI
(links, focus outlines, secondary numerals).
**No CSS token names or hex values changed in this rename** — only this
document's prose labels for them.

The Top Banana jungle palette (`#0b0f0d` canopy black / `#113d2c` jungle
green / `#39e28d` neon leaf / `#ffc94d` banana gold / `#a855f7` AI violet)
remains retired, unused anywhere in code.

## Typography

**Display/headline: Space Grotesk**, loaded via Google Fonts (`wght@500;
600;700` — the three weights actually used across headings, the nav
wordmark, and the pull-quote). Body text stays the existing system-ui
stack (`-apple-system, "Segoe UI", system-ui, sans-serif`) — unchanged,
same as every prior version of this document.

Notably, the Top Banana version of this doc already evaluated Space
Grotesk and rejected it *only* because it wasn't rounded/friendly enough
for a cheeky mascot personality. With no mascot, that objection is gone —
confident, modern, geometric is exactly right for this identity. No
re-evaluation needed; the earlier assessment already reached the right
answer.

## Why no mascot

A foreground/background contrast doesn't need a character to explain the
idea — the picture itself *is* the idea, and who's in the foreground (or
isn't) is literally the reader's own business, not a drawn character
representing it. Top Banana needed Boss because "everyone wants to be top
banana" is an idiom that benefits from a face; "every AI answer has a
foreground" is already a complete, self-explaining image without one.
Skipping a mascot also removes an entire category of ongoing cost and risk
that Top Banana would have carried indefinitely: no image-generation
pipeline to keep in sync, no character consistency to maintain across
separately-generated assets, no risk of a mascot reading as a kids'-app
character. This identity is 100% CSS/SVG-drawable — gradients, arcs, and a
gold/graphite palette — which is also just a better fit for a small
self-serve SaaS with no dedicated design headcount, and happens to sidestep
the entire "is this name/character already taken" risk class that bit both
"AIVis" and "Spotlight."

## Motifs

Recurring shapes, all achievable in pure CSS/SVG — no illustration tool
needed, unchanged in implementation from the Spotlight version:

- **Radial glow** — a soft radial-gradient in foreground gold, low-opacity,
  behind the hero headline and layered into the final CTA band's
  background. Implemented as a `background-image` layer in
  `public/marketing-theme.css`, not a separate illustrated asset.
- **Score-ring dial** — a small gold-arc-over-graphite-track circle
  (CSS `conic-gradient` + a mask, no SVG file needed), reused as a
  decorative badge in two spots: next to the "0-100" figure in the hero's
  fact strip, and the corner of the Pro plan card. Ties directly to the
  product's actual 0-100 score rather than being pure decoration.
- **Stage-line dividers** — section boundaries that used to be a flat
  `border-top: 1px solid var(--line)` are a horizontal gradient line
  (transparent → line-bright → transparent) painted as a 1px background
  layer. Deliberately restrained — no glow, no gold, just a slightly more
  designed divider than a flat border.
- **No character, mascot, or animal artwork of any kind.** This is a
  confirmed, deliberate absence, not an oversight — see "Why no mascot"
  above.

## What this doc deliberately does not include

No competitive brand research and no fabricated market stats — same
"keep it simple" reasoning every prior version of this document already
established (the one exception: the 2026-08-18 rename itself required a
targeted competitor-name check specifically to avoid repeating the
AIVis/Spotlight collision, not general market research). Positioning is
grounded entirely in what the product verifiably does (see `CLAUDE.md`'s
Architecture section: 4 models, 5 prompts, 20 checks, 0-100 score), not
claims about competitors.

## Why this scales

The marketing surface can afford to be more visually confident than the
product; the product stays mascot-free on purpose (unchanged — no mascot
anywhere in this rename, no mascot in the 2026-08-23 dashboard palette
either). These are different jobs. A first-time visitor needs a hook
strong enough to make an abstract 0-100 visibility metric feel like
something worth caring about — the foreground/background contrast does
that without needing a character to sell it.

**Revised 2026-08-23** for the dashboard/legacy split specifically: a
signed-in user checking their actual score is doing repeat-use,
trust-sensitive work — they need the dashboard to read as accurate and
serious, not staged. That's still true, and it's exactly why the
2026-08-23 dashboard redesign borrows none of marketing's specific
motifs (no gold, no page-wide radial glow, no mascot) even though the CEO
explicitly asked for more color and graphics there. The claim this
document originally made was narrower than "the dashboard must stay
gray": it was "don't reuse the *marketing* palette on the dashboard." A
signed-in, repeat-use dashboard can have its own real, intentional visual
identity — organized, color-coded, graphical — and still read as more
serious than a landing page, precisely *because* it's a distinct identity
rather than marketing's "you're chosen" gold showing up somewhere it
would just look like an ad. The legacy `result.html` page is a different
case again: it's a static, unowned, one-time link with no login and no
repeat-use relationship to protect, which is why it alone keeps the
original untouched treatment rather than picking up either surface's
newer identity.
