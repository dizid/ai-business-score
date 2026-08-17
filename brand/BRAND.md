# AIVis brand design

Written 2026-08-10. Original version anchored the CEO's "AI scoring = more
sales!!" positioning into a generic blue/violet SaaS visual identity. That
day, the CEO approved a jungle/mascot direction — **Top Banana** — pitched
by the creative director in session. **2026-08-17: the CEO reviewed Top
Banana and rejected it outright** — "no mascot, brand new design" — before
a single pixel of it had shipped (zero palette tokens, zero font loading,
zero copy had actually landed in code). This document replaces Top Banana
entirely with **Spotlight**, per that decision. The positioning statement's
causal logic and the product-mechanics grounding carry forward unchanged
from both prior versions; only the "what it looks like and what it's
called" layer changes. `image-prompts.md` (Top Banana's companion file of
external mascot image-generation prompts) is deleted — there is no
character to generate art of anymore.

**Critical boundary:** this brand direction governs the four static
marketing entry points only — `index.html`, `how-it-works.html`,
`privacy.html`, `terms.html` — plus their shared stylesheet and OG/favicon
assets. It does **not** govern `src/app/**` (including `LoginView.vue` /
`SignupView.vue`), `result.html`, or `src/shared/theme.css` — the
authenticated app dashboard and the pre-pivot legacy shareable-link page
are deliberately unaffected and stay exactly as they are today: calm,
muted, professional. See "Why this scales" below for the reasoning that
justifies keeping that split, which predates both Top Banana and
Spotlight.

## The world

An AI-generated answer works like a stage spotlight. There's room for very
few names in the light — usually one, sometimes a handful — and everyone
else the model considered stays offstage, invisible to the person who
asked the question. That's not a metaphor stretched to fit; it's a literal
description of what AIVis measures: cited (in the light) vs. never
mentioned (offstage), for a business asking "does the AI recommend me or
someone else?" No character is needed to explain a spotlight — everyone
already knows what it means to be the one it lands on, and what it means
to be standing just outside its edge.

## Positioning statement

> For small and local businesses who have no idea whether ChatGPT and
> Gemini recommend them — and who suspect AI search is quietly sending
> customers to a competitor instead — unlike SEO tools that only track
> Google rankings, **AIVis scores your AI visibility directly and ties it
> to the thing that actually matters: getting picked over the competitor.**

The causal chain is the whole pitch: *AI search is replacing "10 blue
links" with a single spoken answer → if that answer doesn't name you, the
sale already happened for someone else → your AI Score is a leading
indicator of that outcome, not a vanity metric.* Every headline should
imply this chain, not just state "we check AI visibility." Spotlight
doesn't replace this logic — it's the visual/verbal hook that makes the
logic land faster: there's a spotlight on every AI answer, and the only
question is whether it's on you.

## Tagline

**Primary: "There's a spotlight on every AI answer. Make sure it's on
you."**

| Variant | Where to use |
|---|---|
| "There's a spotlight on every AI answer. Make sure it's on you." | Hero headline, logo lockup, social bio |
| "Get in the spotlight." | Nav CTA, OG image, tight spaces |
| "AI already picked someone. Was it you?" | Ad copy, retargeting — loss-framed, states the causal chain's stakes directly rather than implying them |

(These taglines are provided for the content pass that follows this one —
this document does not itself rewrite the four marketing pages' visible
copy; see `CLAUDE.md`'s note on execution order.)

## Voice

Direct, causal, grounded — unchanged in substance from both prior versions
of this document, only the flavor vocabulary changes (no more "climb,"
"canopy," "underbrush," "top banana"; now "spotlight," "cited," "offstage,"
"in the light"):

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
- Spotlight vocabulary ("in the spotlight," "cited," "offstage," "the
  light") is available for headline-level copy, but it's flavor on top of
  the same grounded claims above, not a license to invent capabilities. "In
  the spotlight" still means "your 0-100 AI Score is high," nothing more
  mystical.

## Color palette

Two palettes coexist, scoped to different surfaces — unchanged split from
both prior versions of this document:

- **In-app dashboard** (`src/shared/theme.css`) — deliberately calm and
  utilitarian, muted grays, one blue accent, plus the existing score-band
  colors (`--good`/`--warning`/`--serious`/`--critical`). **Unchanged by
  this document.** Nothing in `theme.css` is edited here or implied to
  change.
- **Marketing (the four static entry points)** — the Spotlight palette
  below, replacing Top Banana's jungle palette entirely, which in turn had
  replaced the original blue/violet gradient.

**Dark-first, deliberately:** the site now defaults to this dark theme
directly — `color-scheme: dark` set outright in the shared stylesheet, not
toggled via `prefers-color-scheme` the way `index.html` did before this
pass. The spotlight metaphor needs real darkness to read as a spotlight;
a light-mode fallback would mean half of visitors never see the metaphor
at all. This matches the CEO's standing "dark mode default where
appropriate" preference.

| Role | Hex | Use |
|---|---|---|
| Stage black | `#0a0a0d` | Base background |
| Surface | `#17171b` | Cards, panels |
| Ink | `#f5f4f0` | Primary text |
| Muted | `#a8a6a0` | Secondary text |
| Spotlight gold | `#ffb830` | The light itself — CTAs, the "cited" highlight, the score-ring peak. Used sparingly, same "prize color, not a fill color" discipline the Top Banana version got right about banana gold — reserved for the moment something is chosen, never a background or general fill |
| Signal blue | `#4da3ff` | Secondary/workhorse accent — body links, focus rings, icons, the UI chrome that isn't a "you're chosen" moment |
| Offstage graphite | `#3a3a40` | The "unlit"/not-mentioned state — ghosted or dimmed content, the track behind a score-ring's gold arc |

"Cited" and "not mentioned" map directly to gold vs. graphite — lit vs.
unlit — the same "no separate green needed" logic Top Banana's neon-leaf
palette used, just simplified to two states instead of three. In the
shared stylesheet (`public/marketing-theme.css`), gold and blue are kept
as **separate tokens** (`--gold` / `--accent`) specifically so implementers
don't default every interactive element to gold out of convenience —
gold appears only where something has actually been chosen (CTA buttons,
the cited-name highlight, the Pro plan's border, the score-ring), while
blue carries the rest of the UI (links, focus outlines, secondary numerals).

The old Top Banana palette (`#0b0f0d` canopy black / `#113d2c` jungle green
/ `#39e28d` neon leaf / `#ffc94d` banana gold / `#a855f7` AI violet) is
retired, unused anywhere in code, and superseded by the table above.

## Typography

**Display/headline: Space Grotesk**, loaded via Google Fonts (`wght@500;
600;700` — the three weights actually used across headings, the nav
wordmark, and the pull-quote). Body text stays the existing system-ui
stack (`-apple-system, "Segoe UI", system-ui, sans-serif`) — unchanged,
same as every prior version of this document.

Notably, the Top Banana version of this doc already evaluated Space
Grotesk and rejected it *only* because it wasn't rounded/friendly enough
for a cheeky mascot personality. With no mascot, that objection is gone —
confident, modern, geometric is exactly right for a spotlight-on-a-stage
identity. No re-evaluation needed; the earlier assessment already reached
the right answer for this direction.

## Why no mascot

A spotlight doesn't need a character standing in it to explain the idea —
the empty circle of light *is* the idea, and who's standing in it (or
isn't) is literally the reader's own business, not a drawn character
representing it. Top Banana needed Boss because "everyone wants to be top
banana" is an idiom that benefits from a face; "there's a spotlight on
every AI answer" is already a complete, self-explaining image without one.
Skipping a mascot also removes an entire category of ongoing cost and risk
that Top Banana would have carried indefinitely: no image-generation
pipeline to keep in sync, no character consistency to maintain across
separately-generated assets, no risk of the mascot reading as a kids'-app
character despite the "not cute" brief. Spotlight is 100% CSS/SVG-drawable
— gradients, arcs, and a gold/graphite palette — which is also just a
better fit for a small self-serve SaaS with no dedicated design headcount.

## Motifs

Recurring shapes, all achievable in pure CSS/SVG — no illustration tool
needed:

- **Radial spotlight glow** — a soft radial-gradient in spotlight gold,
  low-opacity, behind the hero headline and layered into the final CTA
  band's background. Implemented as a `background-image` layer in
  `public/marketing-theme.css`, not a separate illustrated asset.
- **The "cited" highlight** — `mark.cited-name` in the hero's dissolve demo
  now glows gold (a soft radial tint plus a subtle gold text-shadow)
  instead of the old plain green highlight — literally "this name is in
  the light."
- **Score-ring dial** — a small gold-arc-over-graphite-track circle
  (CSS `conic-gradient` + a mask, no SVG file needed), reused as a
  decorative badge in two spots: the corner of the "AI answer" panel in
  the hero dissolve demo, and the corner of the Pro plan card. Ties
  directly to the product's actual 0-100 score rather than being pure
  decoration.
- **Stage-line dividers** — section boundaries that used to be a flat
  `border-top: 1px solid var(--line)` are now a horizontal gradient line
  (transparent → line-bright → transparent) painted as a 1px background
  layer. Deliberately restrained — no glow, no gold, just a slightly more
  designed divider than a flat border, per the explicit "keep it simple,
  don't overdo it" brief.
- **No character, mascot, or animal artwork of any kind.** This is a
  confirmed, deliberate absence, not an oversight — see "Why no mascot"
  above.

## What this doc deliberately does not include

No competitive brand research and no fabricated market stats — same
"keep it simple" reasoning both prior versions of this document already
established. Positioning is grounded entirely in what the product
verifiably does (see `CLAUDE.md`'s Architecture section: 4 models,
5 prompts, 20 checks, 0-100 score), not claims about competitors.

## Why this scales

The marketing surface can afford to be more visually confident than the
product; the product stays calm and mascot-free on purpose. These are
different jobs. A first-time visitor needs a hook strong enough to make an
abstract 0-100 visibility metric feel like something worth caring about —
the spotlight metaphor does that without needing a character to sell it. A
signed-in user checking their actual score, though, is doing repeat-use,
trust-sensitive work — they need the dashboard to read as accurate and
serious, not staged. Putting a spotlight glow or a score-ring flourish on
`ScanDetail.vue` would undercut the very credibility the score needs to be
useful. Same logic that justified a marketing-only palette in both prior
versions of this doc; Spotlight just executes that split with less
ongoing production cost than a mascot would have required.
