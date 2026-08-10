# AIVis voice guide — "Top Banana"

Companion to `BRAND.md` (visual system, in progress separately) and
`image-prompts.md`. This file owns voice: the mascot, headline/tagline
variants, optional future microcopy flavor, and the rules that keep all of
it sounding like one brand.

Core insight: everyone wants a higher AI visibility score — it's not a
niche B2B metric, it's the universal, primal desire to be the one who gets
picked. "Top banana" is a real, century-old idiom (vaudeville slang for the
headline act, the boss, the one everyone's watching) that means exactly
that — and needs zero explanation, which is the whole point.

The world: AI search is a jungle now. Every business is a creature in the
canopy scrambling upward; most are invisible in the underbrush — never
mentioned, never cited, never picked. AIVis shows a business exactly where
it sits in that canopy, and the climb to the top.

**Locked line:** "Everyone wants to be Top Banana. Now you can see who's
winning." — positions AIVis as the leaderboard for a competition every
business is already unconsciously in.

**Boundary:** everything in this file is for marketing surfaces — hero,
ads, social, email. The in-app product dashboard stays calm and
professional, unchanged, by CEO decision. Section 3 below is explicitly
optional flavor for a possible future pass, not a mandate for today.

---

## 1. Mascot: "Boss" (working name)

**Confirmed working name: Boss.**

Rationale: "Boss" cashes in the idiom's own definition instead of
decorating it — vaudeville's "top banana" *literally meant* the head of the
bill, the boss of the show. Naming the mascot Boss means the name and the
metaphor are the same word, so nobody has to be taught what he represents.
It's one syllable, easy to say out loud in a live demo or a sales call
("ask Boss," "Boss says you're buried in the underbrush"), it's ownable as
a brand asset rather than a generic noun, and it carries the right
attitude — sharp, in-charge, permanently mid-climb — without a cute animal
pun that would undercut the "not cute, not cartoonish" mandate.

**Backup alternatives**, in case "Boss" doesn't stick with the CEO:

| Name | One-line rationale |
|---|---|
| **Alpha** | Leans on the same "top of the hierarchy" instinct people already read into primates; risk — "Alpha" is overused as a generic startup name, less ownable than Boss. |
| **Chief** | Same "runs the operation" register as Boss but slightly warmer/more approachable in copy ("ask Chief," "Chief's climbing"); risk — reads more like a job title than a character. |
| **Kingpin** | Leans hardest into "top of the hierarchy," more edge and cheek than Boss; risk — carries an underworld/crime connotation that may read wrong for a small-business audience. |

---

## 2. Headline / tagline variants (10)

All lean on the jungle / Top Banana metaphor while keeping the causal
chain intact: **higher AI score → you get picked → more sales.** None
invent statistics or customer counts.

| # | Line | Best-fit placement | Why it works |
|---|---|---|---|
| 1 | **"Everyone wants to be Top Banana. Now you can see who's winning."** | Hero headline / brand anchor (locked — use everywhere: hero, logo lockup, deck cover) | The CEO-approved locked line. Universal desire stated plainly, then the product's actual function (visibility into who's winning) closes it. |
| 2 | "Climb to the top of AI search." | Hero headline | Short, punchy, the metaphor alone carries the "AI search" stakes without needing to spell out "sales." |
| 3 | "Top Banana gets picked. Everyone else gets skipped." | Hero headline / ad copy | Binary framing — "picked" is literally what an AI-generated answer does when it names a business. |
| 4 | "See your spot in the canopy — before a competitor climbs past you." | Ad copy | Mid-length, scarcity-framed: names the competitor threat directly, ties metaphor to urgency. |
| 5 | "Somewhere out there, AI just recommended your competitor instead of you." | Ad copy | Longer, scarcity/loss-framed. States the real mechanism (`competitorTallies`) as a live, ongoing threat rather than an abstract risk. |
| 6 | "Every business is climbing toward the same banana. Most never leave the underbrush." | Ad copy | Longer, atmospheric — good lead-in for a "how it works" section; establishes stakes before explaining the product. |
| 7 | "Are you Top Banana, or just another monkey in the trees?" | Social caption | Cheeky, rhetorical, meme-able — invites a reply/tag, the jungle voice at its most playful. |
| 8 | "AI played favorites today. Was it you?" | Email subject / social caption | Short (39 chars), curiosity-driven, causal logic implied rather than stated — good open-rate bait. |
| 9 | "Not top banana. Not even close. Check your score." | Social caption / ad copy | Blunt, loss-framed, punchy — works as a jab in a retargeting ad. |
| 10 | "Your climb starts with your AI Score." | Hero subhead / pairs under headline #1 or #2 | Ties the metaphor directly back to the literal product mechanic (the score) — good subhead under a punchier hero line. |

---

## 3. Product microcopy — OPTIONAL FLAVOR-TEXT SUGGESTIONS (not a mandate)

**These are illustrative only.** The in-app dashboard copy is not changing
today — this section exists so a future implementation pass has a
reference for tone if/when the CEO decides to extend the jungle voice into
the product itself. Auth, billing, and legal/error copy that affects trust
or comprehension (login failures, payment errors, terms of service) should
stay plain and professional regardless — flavor text is for
low-stakes, low-risk moments only.

| Location | Current (plain) | Voice example (future/optional) |
|---|---|---|
| Primary CTA button (marketing → signup) | "Get started" | "Start climbing" |
| "Run new scan" button | "Run scan" | "Send scouts into the canopy" |
| Scan loading state | "Loading..." / "Running scan..." | "Scouting the canopy..." |
| Companies list, zero companies | "No companies yet. Add one to get started." | "Nobody's climbing yet. Add your first business and start the ascent." |
| Company detail, zero scans | "No scans yet." | "Not on the map yet. Run your first scan to see where you stand." |
| Scan failed error | "Scan failed. Try again." | "Scouts got lost in the canopy. Try again." |
| Scan complete, high score | "Scan complete." | "Nice climb — you're Top Banana material." |
| Scan complete, low score | "Scan complete." | "Deep in the underbrush. Here's how to climb." |
| Progress chart, only 1 scan (no trend yet) | "Run more scans to see a trend." | "One scan down. Climb again to see your trend." |
| "Generate deeper advice" button | "Generate deeper advice" | "Get your climbing plan" |
| Pro plan upsell button | "Upgrade to Pro" | "Climb faster" |
| Login/auth error | "Invalid credentials." | *(unchanged — stays plain, no jungle voice on auth/trust-critical copy)* |

---

## 4. Brand voice rules

1. **Loss-framing is a feature, not fear-mongering.** Naming the
   competitor who's winning instead of you is the literal mechanism the
   product measures (`competitorTallies` in the scoring engine) — say it
   plainly.
2. **Short sentences. Zero SaaS filler.** No "leverage," "unlock,"
   "empower," "seamless," "game-changing," or similar.
3. **The metaphor should never need decoding.** If a line requires
   explaining what "Top Banana" or "the canopy" means, cut it — every
   reader gets it instantly or it doesn't ship.
4. **Stay literal about what the product does.** Two AI models (GPT-5
   mini, Gemini 3 Flash) queried through Perplexity's grounded search, a
   0-100 score tracked over time. No invented stats, no fabricated
   customer counts, no claiming real-time "AI recommends you" beyond what
   the product actually checks (presence/mention in a generated answer).
5. **Confident and cheeky, never cute or cartoonish — and marketing-only.**
   Boss is sharp, a little cocky, permanently mid-climb — not a mascot for
   kids, and not deployed in the in-app dashboard today (see Section 3's
   boundary note).
