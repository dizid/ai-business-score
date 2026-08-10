# AIVis image-generation prompts

Ready to paste into Midjourney, DALL·E, Stable Diffusion, or whatever tool
you're using. Each prompt is self-contained — style, subject, composition,
colors, and format are all repeated in full so you don't need to
cross-reference [`BRAND.md`](./BRAND.md) while generating. Save each result
to the exact filename listed so wiring them into the marketing site later
is a drop-in.

**This replaces the earlier blue/violet asset list entirely** — the Top
Banana direction (approved 2026-08-10) supersedes it. If any of the old
files already exist from the earlier direction (`public/hero.png`,
`public/og-image.png`, `public/icons/*.png`, `public/logo.png`),
regenerate them fresh from the prompts below rather than reusing the old
art — the two styles don't mix.

**Style anchor** (repeated in full in every prompt below, don't drop it or
drift from it — it's what keeps every separately-generated image looking
like one brand):

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

Tool notes: Midjourney users can append `--ar <ratio> --style raw` to any
prompt below (ratio given per asset). DALL·E/Stable Diffusion users can
drop that suffix and just state the aspect ratio in words, as already done
in each prompt.

---

## 1. Hero illustration — Boss climbing toward the golden banana

**Plugs into:** the marketing site's hero section.
**Save as:** `public/mascot/boss-climbing.png`
**Aspect ratio:** landscape, roughly 4:3 (~1600x1200px). Midjourney: `--ar 4:3`

```
Flat-vector modern illustration style, jungle-tech aesthetic. Deep canopy
black (#0b0f0d) base background with jungle green (#113d2c) foliage
silhouettes for depth. Neon leaf green (#39e28d) as the primary glow color
for vines, data-trail lines, and "cited" highlights — vines rendered as
thin glowing circuit-like trails, not naturalistic plant texture. Banana
gold (#ffc94d) reserved exclusively for the prize/winning moment — the top
banana itself, the peak of a score ring, a CTA, Boss's held-up banana —
never used as a general background or fill color. AI violet (#a855f7) as a
secondary tech-glow accent threaded through vines and canopy lines. The
jungle canopy itself is stylized as a network/node graph — branches read
as data connections, leaves as node points that flicker on/off like
citations lighting up. Bold, confident, graphic-novel-adjacent linework —
not photorealistic, not soft stock-illustration, not cutesy or kids'-app
cartoonish. Mascot Boss (a sharp, slightly cocky ape) reads as a confident
competitor, not a children's character. Clean silhouettes, strong
contrast, minimal clutter.

Subject: Boss, a sharp, slightly cocky ape mascot, mid-climb through a
neon jungle canopy stylized as a glowing network graph — branches are thin
data-trail lines in neon leaf green (#39e28d) and AI violet (#a855f7),
leaves are small node-points, some lit, some dark. Boss reaches with one
arm toward a single glowing golden banana (#ffc94d) near the top of the
frame, the clear focal point and brightest element in the image. Boss's
posture is dynamic and confident, not straining or cartoonish — this is
someone who expects to win. Deep canopy black (#0b0f0d) background below
fades to jungle green (#113d2c) mid-canopy. Generous negative space in the
upper-left quadrant of the composition — this needs to sit next to
headline text, so keep that area relatively open and dark rather than
cluttered.

Landscape orientation, roughly 4:3.
```

---

## 2. OG / social share image

**Plugs into:** the marketing site's `<meta property="og:image">` and
`<meta name="twitter:image">` tags.
**Save as:** `public/og-image.png`
**Aspect ratio:** 1200x630 (standard OG image ratio, ~1.91:1). Midjourney: `--ar 1200:630`

```
Flat-vector modern illustration style, jungle-tech aesthetic. Deep canopy
black (#0b0f0d) base background with jungle green (#113d2c) foliage
silhouettes for depth. Neon leaf green (#39e28d) as the primary glow color
for vines, data-trail lines, and "cited" highlights — vines rendered as
thin glowing circuit-like trails, not naturalistic plant texture. Banana
gold (#ffc94d) reserved exclusively for the prize/winning moment — the top
banana itself, the peak of a score ring, a CTA, Boss's held-up banana —
never used as a general background or fill color. AI violet (#a855f7) as a
secondary tech-glow accent threaded through vines and canopy lines. The
jungle canopy itself is stylized as a network/node graph — branches read
as data connections, leaves as node points that flicker on/off like
citations lighting up. Bold, confident, graphic-novel-adjacent linework —
not photorealistic, not soft stock-illustration, not cutesy or kids'-app
cartoonish. Mascot Boss (a sharp, slightly cocky ape) reads as a confident
competitor, not a children's character. Clean silhouettes, strong
contrast, minimal clutter.

Subject: wide horizontal composition, bold and readable at thumbnail size
(this renders small in social link previews). Center-left: a small-scale
silhouette of Boss mid-climb through the network-graph canopy, reaching
toward a glowing golden banana — icon-scale, not the main focus of the
frame. Center-right or bottom: large, clear negative space reserved for
text overlay — do not render any words, logos, or letters in the image
itself, leave that area a clean canopy-black-to-jungle-green gradient
surface so a tagline can be added as a text layer afterward. Composition
should still feel balanced and finished without the text, not like an
empty template.

Landscape, 1200x630px, no text/typography in the generated image.
```

---

## 3. "How it works" step icons (3 separate generations)

**Plugs into:** the marketing site's "How it works" section.
**Save as:** `public/icons/scan.png`, `public/icons/score.png`, `public/icons/grow.png`
**Aspect ratio:** square, 1:1 (~512x512px each). Midjourney: `--ar 1:1`

**3a. Scan** (step 1 — running the checks) → `public/icons/scan.png`

```
Flat-vector modern illustration style, jungle-tech aesthetic. Deep canopy
black (#0b0f0d) base background with jungle green (#113d2c) foliage
silhouettes for depth. Neon leaf green (#39e28d) as the primary glow color
for vines, data-trail lines, and "cited" highlights — vines rendered as
thin glowing circuit-like trails, not naturalistic plant texture. Banana
gold (#ffc94d) reserved exclusively for the prize/winning moment, not used
in this icon. AI violet (#a855f7) as a secondary tech-glow accent. The
jungle canopy is stylized as a network/node graph — branches read as data
connections, leaves as node points that flicker on/off like citations
lighting up. Bold, confident, graphic-novel-adjacent linework — not
photorealistic, not soft stock-illustration, not cutesy or kids'-app
cartoonish. Clean silhouettes, strong contrast, minimal clutter.

Subject: a single simple icon, centered, generous padding — a
spotlight/radar beam sweeping across a small stylized canopy silhouette,
with a few node-points (leaves) lighting up in neon leaf green (#39e28d)
where the beam passes, suggesting "searching the jungle for mentions."
Bold, uncluttered enough to read clearly as a tiny icon.

Square, 1:1, icon-style single subject.
```

**3b. Score** (step 2 — the 0-100 result) → `public/icons/score.png`

```
Flat-vector modern illustration style, jungle-tech aesthetic. Deep canopy
black (#0b0f0d) base background with jungle green (#113d2c) foliage
silhouettes for depth. Neon leaf green (#39e28d) as a secondary glow
accent. Banana gold (#ffc94d) reserved exclusively for the prize/winning
moment — here, the fill of the gauge itself, since the score is the prize
being measured. AI violet (#a855f7) as a secondary tech-glow accent. Bold,
confident, graphic-novel-adjacent linework — not photorealistic, not soft
stock-illustration, not cutesy or kids'-app cartoonish. Clean silhouettes,
strong contrast, minimal clutter.

Subject: a single simple icon, centered, generous padding — a circular
score-ring/gauge reimagined as a partially-peeled banana, its peel pulled
back to reveal a glowing gold (#ffc94d) arc proportional to a fill level
(roughly 70-80%), evoking both "score gauge" and "banana" at once. Bold,
uncluttered enough to read clearly as a tiny icon.

Square, 1:1, icon-style single subject.
```

**3c. Grow** (step 3 — the sales outcome) → `public/icons/grow.png`

```
Flat-vector modern illustration style, jungle-tech aesthetic. Deep canopy
black (#0b0f0d) base background with jungle green (#113d2c) foliage
silhouettes for depth. Neon leaf green (#39e28d) as the primary glow color
for the vine and node points. Banana gold (#ffc94d) reserved exclusively
for the prize/winning moment — here, the small glyph at the top the vine
climbs toward. AI violet (#a855f7) as a secondary tech-glow accent. Bold,
confident, graphic-novel-adjacent linework — not photorealistic, not soft
stock-illustration, not cutesy or kids'-app cartoonish. Clean silhouettes,
strong contrast, minimal clutter.

Subject: a single simple icon, centered, generous padding — a single vine
climbing diagonally upward, with 3-4 leaf/node points along it lighting up
in sequence from bottom to top in neon leaf green (#39e28d), ending at a
small glowing banana-gold (#ffc94d) glyph at the top edge, suggesting
"climb → reward." Bold, uncluttered enough to read clearly as a tiny icon.

Square, 1:1, icon-style single subject.
```

---

## 4. Leaderboard graphic

**Plugs into:** the marketing site's positioning/comparison section,
social posts explaining score bands.
**Save as:** `public/leaderboard.png`
**Aspect ratio:** landscape, roughly 3:2 (~1500x1000px). Midjourney: `--ar 3:2`

```
Flat-vector modern illustration style, jungle-tech aesthetic. Deep canopy
black (#0b0f0d) base background with jungle green (#113d2c) foliage
silhouettes for depth. Neon leaf green (#39e28d) as the primary glow color
for vines, data-trail lines, and "cited" highlights — vines rendered as
thin glowing circuit-like trails, not naturalistic plant texture. Banana
gold (#ffc94d) reserved exclusively for the prize/winning moment — the top
banana itself, never used as a general background or fill color. AI
violet (#a855f7) as a secondary tech-glow accent threaded through vines
and canopy lines. The jungle canopy itself is stylized as a network/node
graph. Bold, confident, graphic-novel-adjacent linework — not
photorealistic, not soft stock-illustration, not cutesy or kids'-app
cartoonish. Clean silhouettes, strong contrast, minimal clutter.

Subject: a cross-section of the jungle canopy at different heights, shown
left-to-right or as a rising staircase of branches, each branch holding
one small ape/creature silhouette — visualizing score bands. At the top
branch, closest to a single glowing golden banana (#ffc94d), a confident
silhouette stands fully lit in neon leaf green (#39e28d) — the "Top
Banana" position. Mid-canopy branches hold silhouettes partially lit,
dimmer neon leaf glow, still visible but clearly not at the top. Lower
branches and the underbrush at the bottom hold silhouettes rendered almost
entirely in shadow/canopy black (#0b0f0d), barely distinguishable —
unlit, uncited, invisible. AI violet (#a855f7) data-trail lines connect
the branches faintly in the background, tying the whole canopy together
as one network. No text or labels in the image itself — this is a visual
metaphor for score bands, to be labeled afterward.

Landscape, roughly 3:2, no text in the generated image.
```

---

## 5. Mascot turnaround / sticker sheet

**Plugs into:** reusable mascot art for marketing pages, social
profile/post assets, onboarding illustrations, sticker/swag use.
**Save as:** `public/mascot/boss-sticker-sheet.png`
**Aspect ratio:** landscape grid, roughly 4:3 (~2000x1500px). Midjourney: `--ar 4:3`

```
Flat-vector modern illustration style, jungle-tech aesthetic. Deep canopy
black (#0b0f0d) base background with jungle green (#113d2c) foliage
silhouettes for depth. Neon leaf green (#39e28d) as the primary glow color
for vines and accents. Banana gold (#ffc94d) reserved exclusively for the
prize/winning moment — Boss's banana in the triumphant pose specifically.
AI violet (#a855f7) as a secondary tech-glow accent. Bold, confident,
graphic-novel-adjacent linework — not photorealistic, not soft
stock-illustration, not cutesy or kids'-app cartoonish. Mascot Boss (a
sharp, slightly cocky ape) reads as a confident competitor, not a
children's character. Clean silhouettes, strong contrast, minimal
clutter.

Subject: a sticker-sheet layout of Boss, the mascot ape, shown in four
consistent poses arranged in a clean grid with even spacing, each pose a
separate self-contained sticker-style illustration with a subtle die-cut
outline:
1. Climbing — mid-reach on a vine, dynamic and forward-leaning.
2. Triumphant — standing upright, one golden banana (#ffc94d) held high
   overhead, confident grin, this is the "winner" pose.
3. Thinking/scoping — one hand shading eyes, looking upward/outward
   through the canopy as if scanning for something, more contemplative
   posture.
4. Waving — friendly but still confident, one arm raised in a wave,
   facing forward.
Consistent character design, proportions, and color palette across all
four poses — same ape silhouette, same neon leaf (#39e28d) and banana gold
(#ffc94d) accent treatment on each. Canopy black (#0b0f0d) background,
either uniform across the sheet or subtly transparent per sticker. No text
or labels.

Landscape grid layout, roughly 4:3, four distinct poses, no text in the
generated image.
```

---

## 6. Wordmark / logo lockup

**Plugs into:** the marketing site's nav/footer logo slot and social
profile art. (The in-app dashboard's own branding is out of scope for this
document — see the critical boundary at the top of `BRAND.md`.)
**Save as:** `public/logo.png`
**Aspect ratio:** wide, roughly 3:1, transparent background. Midjourney: `--ar 3:1`

```
Flat-vector modern logo design, jungle-tech aesthetic. Wordmark reading
"AIVis" in a rounded, confident, geometric sans-serif (in the spirit of
Baloo 2), in near-white (#ffffff) or banana gold (#ffc94d). To the left of
or integrated into the text, a small glyph — either a minimal Boss
silhouette (simplified ape-in-climb shape) or a simple glowing banana icon
— standing in for the "AI," rendered in banana gold (#ffc94d) with a thin
neon leaf (#39e28d) accent line. Transparent background. No taglines, no
additional text, no drop shadows, no 3D effects — flat and crisp enough to
work small (nav bar height, ~32px tall).

Wide format, roughly 3:1, transparent background, logo/wordmark only.
```

---

## After generating

1. Drop the files into `public/` at the exact paths listed above (create
   `public/mascot/` and `public/icons/` if they don't exist).
2. Come back and ask for the implementation pass — wiring these into the
   marketing site's hero, OG meta tags, "how it works" icons, leaderboard
   section, and nav logo is a separate, quick follow-up once the files
   exist. Per the brand boundary in `BRAND.md`, none of this wiring
   touches the authenticated app dashboard (`src/app/`, `ScanDetail.vue`,
   etc.) — marketing-only surfaces.
3. If a generated image doesn't match another (e.g. the neon leaf green
   looks different between the hero and an icon), regenerate just that
   one asset with the same prompt rather than adjusting the others — the
   style anchor paragraph is the source of truth, not any single
   generated result.
