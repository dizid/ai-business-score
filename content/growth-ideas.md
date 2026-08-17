# Top Banana — Growth Ideas

> **Stale flag (2026-08-17):** the CEO rejected the "Top Banana" mascot
> direction outright in favor of a new, mascot-free "Spotlight" identity
> (see `brand/BRAND.md`). Three specifics below are now superseded and
> should not be executed as written: **Idea 2** ("Caught in the
> Underbrush," a mascot-led social series — there is no mascot anymore),
> its claim that **"mascot art is already in progress"** (false as of
> 2026-08-17 — no mascot art was ever produced, and none will be), and
> **Idea 3**'s "banana glyph" embeddable badge (the glyph doesn't exist in
> the new identity). The rest of this document's campaign ideas are not
> rewritten here — that's a separate pass — but read everything below with
> that context: any mention of the banana/jungle/canopy vocabulary or
> imagery needs to be re-thought for Spotlight before execution, not taken
> as still-accurate.

Campaign/content concepts for launch, built around the approved "Top Banana"
creative direction: AI search is a jungle, every business is climbing the
canopy toward the golden banana, most are invisible in the underbrush, AIVis
shows a business exactly where it stands. Locked line: "Everyone wants to be
Top Banana. Now you can see who's winning."

Ideation only — no ad spend or budget committed here. Anything with real
cost still needs separate CEO approval per standing rules.

---

## 1. Public Category Leaderboards — "Who's Top Banana in [City]?"

**Mechanic:** A public, no-login leaderboard page per category + city (e.g.
"Top Banana: Austin Plumbers") ranking scanned businesses by AI-visibility
score, updating as new scans come in. Each row shows rank, business name,
score band. CTA: "See where you rank." Early on, seed boards via
hand-curated outbound scans (see Idea 4) so they aren't empty at launch;
after that, any business that scans itself claims/updates its own row.

**Why it fits:** Small/local business owners already live inside ranked,
competitive formats — Yelp stars, Google Maps position, "Best of [city]"
lists. They check these obsessively without thinking of it as "marketing."
A category leaderboard reframes an abstract new metric ("AI visibility")
into a format they already understand and already compete in: am I above
or below the shop down the street. No education required.

**Effort/cost tier:** Medium. Mostly a new read-only page/route grouping
existing `companies`/`scans` data by category + location and sorting by
score — no new scoring concept, since `computeScore` already exists per
company. Real cost is seed data: running proof-script against a curated
local list before public launch so the board has entries on day one.

---

## 2. "Caught in the Underbrush" — mascot-led social series

**Mechanic:** A recurring social format (LinkedIn/Instagram, maybe TikTok)
starring Boss narrating before/after visibility stories. "Caught in the
underbrush" posts = a business doing everything else right (great reviews,
nice site, loyal customers) but invisible when AI is asked about its
category. "Spotted at the top" posts = the same business after running a
scan and climbing. Real examples only with the business's own opt-in
(they submit their own scan result to be featured) — never naming or
shaming a real business without consent.

**Why it fits:** This audience has never heard of "AI visibility" and
wouldn't search for it. A story-driven before/after format teaches the
problem the way this audience already consumes before/after content
(renovations, credit scores, weight loss) instead of a feature list or
category pitch. It also doubles as a testimonial loop once a business
opts in.

**Effort/cost tier:** Low–medium. Needs mascot art (already in progress
by the visual-system team) plus regular copywriting/scheduling. The
opt-in submission mechanism can start as a plain form/email ask — no new
product surface required for v1.

---

## 3. Shareable "Top Banana Score" badge

**Mechanic:** Every scan result offers a shareable score card ("Top Banana
Score: 62/100 — climbing") sized for a social post, plus a static
embeddable HTML/CSS snippet a business can drop in their own site footer,
linking back to AIVis. Every share/embed is a small ad wearing someone
else's face.

**Why it fits:** Local business owners already collect and display trust
badges — BBB, "Best of [city]," Google Guaranteed. A score badge slots
into a behavior they already have, rather than asking them to learn a new
one, and it's an ego-driven share that maps directly to the "everyone
wants to be Top Banana" insight — a business with a good score needs
zero persuasion to brag about it.

**Effort/cost tier:** Low. Score/band/business name already exist per
scan; the share card is a template over existing data, the embed is a
static snippet, no new backend. A live-updating badge (fetches current
score on page load) would need a small public endpoint — worth flagging
as a v2, not required to ship v1.

---

## 4. Launch-week "Leaderboard Drop" in one city/category

**Mechanic:** Pick one city + one category, pre-scan a batch of real,
known local businesses in it using `proof-script` (exactly what Approach A
already exists for — hand-curated outbound, no new tooling). On launch
day, publish the completed leaderboard for that city/category in one push
(social post, plus direct outreach to the ranked businesses: "You're
#7 in Austin plumbing — want to see how to climb?"). Solves the cold-start
problem of an empty leaderboard and produces a warm outbound list in the
same motion.

**Why it fits:** "We already scanned you, here's your rank" beats "sign up
for our AI tool" by a wide margin for this audience — it's specific,
already about them, and taps local competitiveness directly (they know
their competitors by name, not by category).

**Effort/cost tier:** Medium. No ad spend, but real time cost: picking the
city/category, curating the prospect list, running proof-script, manual
outreach. **Flagging explicitly: pre-scanning named real businesses without
asking first is a consent/reputational judgment call, not just a technical
one — needs explicit CEO sign-off on which businesses before executing.**

---

## 5. "Climb Together" referral loop

**Mechanic:** A free-tier user who refers another business owner who signs
up and runs a scan unlocks bonus scans for both sides — framed as helping
someone else start climbing, not a generic "invite a friend" box. Referral
link carries a code tied to the referring company.

**Why it fits:** Local business owners already refer each other constantly
through offline networks — chambers of commerce, supplier relationships,
"who do you use for X" groups. This gives an existing behavior a
trackable, rewarded online path, and it directly addresses the free tier's
real constraint (1 company / 3 scans) instead of fighting it — "climb
together" softens a limit into a reason to invite someone.

**Effort/cost tier:** Medium. Needs a referral code/link scheme and small
backend work (attribute signup to referrer, grant bonus scans) — real
product work beyond pure content. Also depends on the paid-plan pricing
decision, which isn't finalized yet — full build should wait on that, but
the mechanic itself doesn't require pricing to be decided to spec.
