# AIVis voice guide — "Spotlight"

Companion to `BRAND.md` (visual system). This file owns voice: tagline
variants, optional future microcopy flavor, and the rules that keep all of
it sounding like one brand.

**2026-08-17: supersedes the "Top Banana" version of this file.** The CEO
reviewed the jungle/mascot direction and rejected it outright — "no
mascot, brand new design" — before any of it shipped. Boss, the vaudeville
"top banana" idiom, and the jungle-canopy vocabulary are gone. What
carries forward unchanged: the causal-chain logic, the craft-level voice
rules (short sentences, no SaaS filler, honest loss-framing, stay literal
about what the product does), and the marketing-only boundary. Only the
metaphor and its vocabulary changed.

Core insight, unchanged from both prior versions: nobody needs "AI
visibility" explained to them as a concept once you show them the right
picture — every business already understands, instantly, what it means to
be the one thing an audience is looking at versus everything left in the
dark around it.

**The world:** an AI-generated answer works like a stage spotlight. Very
few names get to stand in the light — sometimes just one — and everyone
else the model considered stays offstage, invisible to the person who
asked. AIVis shows a business which one it currently is, for the exact
questions its own customers are asking.

**Primary tagline:** "There's a spotlight on every AI answer. Make sure
it's on you."

**Boundary:** everything in this file is for the four static marketing
pages (`index.html`, `how-it-works.html`, `privacy.html`, `terms.html`) —
hero, FAQ, footer, and any future ads/social/email copy built on this
direction. The in-app product dashboard stays calm and professional,
unchanged, by CEO decision — same boundary this file has always had,
independent of which creative direction sits on top of it.

---

## 1. Tagline / headline variants (10)

All lean on the spotlight metaphor while keeping the causal chain intact:
**you're in the light → you get picked → more sales.** None invent
statistics or customer counts.

| # | Line | Best-fit placement | Why it works |
|---|---|---|---|
| 1 | **"There's a spotlight on every AI answer. Make sure it's on you."** | Hero headline / brand anchor (primary — use everywhere: hero, logo lockup, deck cover) | States the mechanic (every AI answer has a spotlight, and it only fits a few names) and the ask (make sure it's you) in one line, with no jargon. |
| 2 | "Get in the spotlight." | Nav CTA, OG image, tight spaces | Short, imperative, the whole brand in three words. |
| 3 | "Cited, or offstage. There's no in between." | Hero subhead / ad copy | Binary framing — matches exactly how the product scores a mention: present or absent, nothing fuzzy. |
| 4 | "AI already picked someone. Was it you?" | Ad copy / retargeting | Loss-framed, states the causal chain's stakes directly — a real answer already went out today, with or without your name in it. |
| 5 | "Every AI answer has room for a few names. See if yours is one of them." | Ad copy | Mid-length, sets up the scarcity of the spotlight without needing the metaphor spelled out first. |
| 6 | "Most businesses never make it into the light." | Ad copy / atmospheric lead-in | Longer, sets stakes before explaining the product — good opener for a "how it works" section. |
| 7 | "Are you the one AI recommends, or the one it skips?" | Social caption | Rhetorical, direct, invites a reply — the spotlight voice at its most pointed. |
| 8 | "AI played favorites today. Was it you?" | Email subject / social caption | Short (34 chars), curiosity-driven, causal logic implied rather than stated. |
| 9 | "Cited by AI, or invisible to it — check which." | Social caption / ad copy | Blunt, works as a retargeting jab without needing more context. |
| 10 | "Your score is your spot in the light." | Hero subhead / pairs under headline #1 or #3 | Ties the metaphor directly back to the literal product mechanic (the 0-100 score). |

---

## 2. Product microcopy — OPTIONAL FLAVOR-TEXT SUGGESTIONS (not a mandate)

**These are illustrative only.** The in-app dashboard copy is not changing
today — this section exists so a future implementation pass has a
reference for tone if/when the CEO decides to extend the spotlight voice
into the product itself. Auth, billing, and legal/error copy that affects
trust or comprehension (login failures, payment errors, terms of service)
should stay plain and professional regardless — flavor text is for
low-stakes, low-risk moments only.

| Location | Current (plain) | Voice example (future/optional) |
|---|---|---|
| Primary CTA button (marketing → signup) | "Get started" | "Step into the light" |
| "Run new scan" button | "Run scan" | "Check the spotlight" |
| Scan loading state | "Loading..." / "Running scan..." | "Checking who's in the light..." |
| Companies list, zero companies | "No companies yet. Add one to get started." | "Nobody on stage yet. Add your first business to find out." |
| Company detail, zero scans | "No scans yet." | "Not checked yet. Run your first scan to see where you stand." |
| Scan failed error | "Scan failed. Try again." | "Couldn't reach the stage. Try again." |
| Scan complete, high score | "Scan complete." | "You're in the spotlight." |
| Scan complete, low score | "Scan complete." | "Still offstage. Here's how to change that." |
| Progress chart, only 1 scan (no trend yet) | "Run more scans to see a trend." | "One check down. Scan again to see the trend." |
| "Generate deeper advice" button | "Generate deeper advice" | "Get your plan for the spotlight" |
| Pro plan upsell button | "Upgrade to Pro" | "Stay in the light" |
| Login/auth error | "Invalid credentials." | *(unchanged — stays plain, no flavor voice on auth/trust-critical copy)* |

---

## 3. Brand voice rules

1. **Loss-framing is a feature, not fear-mongering.** Naming the
   competitor who's winning instead of you is the literal mechanism the
   product measures (`competitorTallies` in the scoring engine) — say it
   plainly.
2. **Short sentences. Zero SaaS filler.** No "leverage," "unlock,"
   "empower," "seamless," "game-changing," or similar.
3. **The metaphor should never need decoding.** If a line requires
   explaining what "the spotlight" or "offstage" means, cut it — every
   reader gets it instantly or it doesn't ship.
4. **Stay literal about what the product does.** Four AI models (OpenAI's
   GPT-5 mini, Google's Gemini 3 Flash, Anthropic's Claude Haiku 4.5,
   xAI's Grok 4.6), five prompts per scan, twenty checks total, a 0-100
   score tracked over time. No invented stats, no fabricated customer
   counts, no claiming real-time "AI recommends you" beyond what the
   product actually checks (presence/mention in a generated answer).
5. **Confident and literal, never cutesy — and marketing-only.** No
   character voice, no anthropomorphizing the product ("I searched for
   you" — wrong; "AIVis checked whether AI search mentions you" — right).
   Not deployed in the in-app dashboard today (see Section 2's boundary
   note).
