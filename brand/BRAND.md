# AIVis brand design

Written 2026-08-10. Original version anchored the CEO's "AI scoring = more
sales!!" positioning into a generic blue/violet SaaS visual identity. Same
day, the CEO approved a new creative direction — **Top Banana** — pitched
by the creative director in session: the visual identity, palette, and
motif language below **supersede** that earlier version entirely. The
positioning statement's causal logic and the product-mechanics grounding
carry forward unchanged; only the "what it looks like" layer changes.
Companion file [`image-prompts.md`](./image-prompts.md) turns the visual
style anchor below into ready-to-paste prompts for an external image
generator.

**Critical boundary:** this brand direction governs marketing, social, and
onboarding surfaces only. The in-app product dashboard (`src/shared/theme.css`,
`ScanDetail.vue`, `CompanyProgressChart.vue`, `CompaniesListView.vue`,
`CompanyDetailView.vue`) is deliberately unaffected — stays calm, muted,
professional, exactly as it is today. Boss and the jungle world never
appear inside the working tool a signed-in user actually uses to read
their score. See "Why this scales" below for the reasoning.

## The world

AI search is a jungle now. Every business is a creature in the canopy,
scrambling upward toward the light; most are invisible in the underbrush —
never mentioned, never cited, never picked by the AI answering the
question. AIVis shows a business exactly where it sits in that canopy, and
the climb to the top. "Top banana" is a real, century-old idiom — vaudeville
slang for the headline act, the boss, the one everyone's watching — chosen
because it needs zero explanation: wanting to be the one AI picks is a
universal, primal desire, not a niche B2B metric.

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
imply this chain, not just state "we check AI visibility." Top Banana
doesn't replace this logic — it's the emotional hook that makes the logic
land faster: everyone already wants to win, AIVis just shows the
scoreboard.

## Tagline

**Primary: "Everyone wants to be Top Banana. Now you can see who's winning."**

Replaces the earlier "Your AI Score. More Sales." as the primary line —
that phrasing still describes the mechanism accurately and is kept below
as a variant for placements that need the causal chain spelled out
literally (e.g. ad copy aimed at someone who's never heard "Top Banana"
and needs the payoff named directly).

| Variant | Where to use |
|---|---|
| "Everyone wants to be Top Banana. Now you can see who's winning." | Hero headline, logo lockup, social bio |
| "Higher AI Score. More Sales." | Ad copy, comparative/before-after framing, anywhere the causal chain needs to be stated plainly rather than implied |
| "AI recommends you — or your competitor. Know which." | Sets up the "How it works" section; longer, scarcity-flavored |
| "Climb out of the underbrush." | Onboarding empty states, loading screens — pairs naturally with Boss mid-climb |

## Voice

Direct, causal, a little urgent — the CEO's own "!!" energy, toned down
just enough to stay credible. Concretely:

- Lead with the outcome (sales), not the mechanism (AI visibility). "More
  sales" beats "better visibility" in every headline-level sentence.
- Short sentences. No "leverage," "unlock," "empower," or other SaaS filler.
- It's fine to name the threat plainly: *a competitor is the one getting
  mentioned instead of you.* Loss-framing is on-brand here, not fear-mongering
  — it's the literal mechanism (`competitorTallies` in the scoring engine).
- Every claim stays grounded in what the product actually does: two AI
  models (GPT-5 mini, Gemini 3 Flash) queried through Perplexity's grounded
  search, a 0-100 score, tracked over time. Don't inflate beyond that.
- New: the Top Banana / competitive-leaderboard framing is now available
  for headline-level copy ("who's winning," "climb," "canopy,"
  "underbrush") — but it's flavor on top of the same grounded claims above,
  not a license to invent capabilities. A line like "see who's winning"
  still means "see your 0-100 AI Score," nothing more mystical.

## Color palette

Two palettes now coexist, scoped to different surfaces — same split as
before, sharpened:

- **In-app dashboard** (`src/shared/theme.css`) — deliberately calm and
  utilitarian, muted grays, one blue accent, plus the existing score-band
  colors (`--good`/`--warning`/`--serious`/`--critical`). **Unchanged by
  this document.** Nothing in `theme.css` is edited here or implied to
  change.
- **Marketing/social/onboarding (Top Banana world)** — the palette below,
  replacing the earlier blue/violet marketing gradient entirely.

| Role | Hex | Notes |
|---|---|---|
| Canopy black | `#0b0f0d` | Background — the dark base every marketing surface sits on |
| Jungle green | `#113d2c` | Foliage / depth — mid-tone shadow layer behind the neon elements |
| Neon leaf | `#39e28d` | "You're cited" glow — deliberately close to the existing product's `--good` green token in `theme.css`, so the marketing world and the real in-app "good" signal feel like the same color family even though the files never touch |
| Banana gold | `#ffc94d` | **The prize color.** CTAs, the top of any score ring depicted in marketing art, Boss's banana itself. Used sparingly, only to mean "winning" — never a background or general fill |
| AI violet | `#a855f7` | Tech-glow accent — vines, data trails, canopy network lines |

The old marketing-only palette (`#2a78d6` blue / `#7c5cff` violet /
`#1fae64` growth green) is retired for new marketing work. It never
touched `theme.css` and still doesn't — this is strictly a swap of what
marketing/social/onboarding assets use going forward.

## Mascot: Boss (working name)

**Boss** is a working name — the CEO is open to changing it. Everything
else about the mascot is locked.

**Who Boss is:** a sharp, slightly cocky ape, permanently mid-climb,
reaching for one glowing golden banana at the top of a neon jungle canopy
shaped like a network graph. Confident, a little cheeky, competitive —
Boss wants to win and isn't shy about it. Never cute, never cartoonish,
never a kids'-app icon. Boss is a mascot for people who want to win, not a
mascot for children.

**Physical description:** lean, athletic ape silhouette, mid-reach or
mid-climb posture (rarely standing still). Bold, confident linework —
graphic-novel-adjacent, not soft/plush. Vines under Boss pulse like data
trails (glowing lines, not naturalistic plant texture); leaves around Boss
flicker on/off like citations lighting up. The one golden banana at the
top of the canopy is always the visual endpoint of whatever Boss is doing.

**How Boss appears:**
- Marketing hero sections, social posts/profile art, onboarding flow
  illustrations, loading/empty states in the marketing site
- Sticker-sheet / turnaround art for reuse across campaigns
- Always in the jungle-tech world (canopy black background, neon leaf /
  banana gold / AI violet palette)

**How Boss never appears:**
- Never on the actual scan-results page or anywhere inside the
  authenticated app dashboard (`ScanDetail.vue`, `CompanyDetailView.vue`,
  `CompanyProgressChart.vue`, `CompaniesListView.vue`) — that surface stays
  mascot-free, calm, and professional
- Never depicted as representing a specific real user's business (Boss is
  AIVis itself, not a stand-in for "your company")
- Never rendered cute/plush/child-facing — no oversized eyes, no
  rounded-toy proportions
- Never mixed into the old blue/violet palette — Boss only exists in the
  jungle-tech world

## Typography

**Display/headline: Baloo 2.** Rounded and confident without tipping into
a toy-like register — it carries enough weight and sturdiness to read as
"competitive" rather than "kids' app," which matters given the mascot
brief explicitly rules out cute/cartoonish. (Considered and rejected:
Fredoka, whose rounder, bouncier letterforms skew closer to a
children's-app feel than a mascot who's supposed to be cocky and want to
win; Space Grotesk, which is confident and modern but not rounded, so it
undersells the "friendly but sharp" jungle-mascot personality on its own.)
This is a documentation recommendation only — no CSS file is edited by
this document; implementation is a separate follow-up.

**Body: existing system-ui stack, unchanged.** No reason to touch it —
Baloo 2 headlines over a system-ui body is a common, legible pairing
(distinctive display type, invisible/fast-loading body type) and doesn't
require any change to the in-app dashboard, which this document doesn't
touch anyway.

## Visual style anchor

Copy this paragraph verbatim into every image-generation prompt — it's
what keeps separately-generated assets looking like one brand instead of a
grab-bag. Replaces the old blue/violet paragraph entirely.

> Flat-vector modern illustration style, jungle-tech aesthetic. Deep
> canopy black (#0b0f0d) base background with jungle green (#113d2c)
> foliage silhouettes for depth. Neon leaf green (#39e28d) as the primary
> glow color for vines, data-trail lines, and "cited" highlights — vines
> rendered as thin glowing circuit-like trails, not naturalistic plant
> texture. Banana gold (#ffc94d) reserved exclusively for the
> prize/winning moment — the top banana itself, the peak of a score ring,
> a CTA, Boss's held-up banana — never used as a general background or
> fill color. AI violet (#a855f7) as a secondary tech-glow accent threaded
> through vines and canopy lines. The jungle canopy itself is stylized as
> a network/node graph — branches read as data connections, leaves as node
> points that flicker on/off like citations lighting up. Bold, confident,
> graphic-novel-adjacent linework — not photorealistic, not soft
> stock-illustration, not cutesy or kids'-app cartoonish. Mascot Boss (a
> sharp, slightly cocky ape) reads as a confident competitor, not a
> children's character. Clean silhouettes, strong contrast, minimal
> clutter.

## Motif language

Recurring shapes to reuse across every asset, so a viewer sees the same
visual vocabulary on the hero, the OG image, the icon set, and social art:

- **Top banana (the reward icon)** — one glowing golden banana at the top
  of the canopy. This is the single most important recurring shape: it's
  the literal visual payoff of "winning," reused as a small glyph anywhere
  the brand needs to say "this is the prize."
- **Canopy skyline silhouette** — a jagged tree-canopy horizon line,
  backlit or glowing at the edges, usable as a standalone background
  texture or a footer/divider motif.
- **Vines as data trails** — thin glowing lines (neon leaf or AI violet)
  that read simultaneously as jungle vines and as network/data
  connections. This is what makes the "AI search is a jungle" metaphor
  visually literal rather than just verbal.
- **Leaderboard as jungle branches** — different ape/creature silhouettes
  perched at different canopy heights, representing different score
  bands: near the top (near the golden banana, lit in neon leaf) for high
  scores, mid-canopy (partially lit) for middling scores, deep in
  shadow/underbrush (unlit, barely visible) for low or absent scores. This
  motif directly visualizes the competitive positioning — "see who's
  winning" — and is the basis for the dedicated leaderboard graphic in
  `image-prompts.md`.

## Why this scales

The marketing world is loud and mascot-driven on purpose; the product
stays calm and mascot-free on purpose. These are different jobs. A
first-time visitor needs a hook strong enough to make an abstract 0-100
visibility metric feel like something worth caring about — "everyone wants
to be Top Banana" does that in one line, and Boss makes it visually
memorable and shareable in a way a generic SaaS gradient never could. A
signed-in user checking their actual score, though, is doing repeat-use,
trust-sensitive work — they need the dashboard to read as accurate and
serious, not entertaining. Putting Boss on `ScanDetail.vue` would
undercut the very credibility the score needs to be useful. Same logic
that justified a marketing-only palette in the original version of this
doc; Top Banana just gives that split a much stronger, more ownable idea
to work with on the loud side.

## What this doc deliberately does not include

No competitive brand research and no fabricated market stats — skipped
per the CEO's "keep it simple" instruction, and per the "no competitive
brand research" reasoning already established in the original version of
this doc. Positioning is grounded entirely in what the product verifiably
does (see `CLAUDE.md`'s Architecture section: 4 models, Perplexity-grounded,
0-100 score), not claims about competitors.
