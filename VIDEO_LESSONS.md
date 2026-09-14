# Lessons learned — making the Foreground promo video (2026-09-12)

What actually worked, after a false start. Read this before starting the
next video project so the same mistakes aren't repeated.

## What went wrong first

1. **Started with abstract "brand mood" prompts** (glowing dials, radial
   gold light, storefronts fading into shadow) instead of asking what kind
   of video the user actually wanted. Result: three "nice video intros"
   with zero relation to the SaaS product. Wasted Flow credits and time.
   **Lesson: ask "what's the concept — demo, story, or spokesperson?"
   before writing a single prompt, not after generating clips.**

2. **Wrote long multi-page guides (VIDEO_PROMPT.md, VIDEO_GUIDE.md,
   START-HERE.md checklists) when the user just wanted a working prompt.**
   Explicit feedback: *"still, you give me a 3 page todo list and i just
   want a promo video with my avatar."* **Lesson: for a first-time/casual
   task like this, give ONE next action, not a project plan. Expand only
   if asked.**

3. **Assumed a multi-scene, multi-tool pipeline (Flow + ElevenLabs +
   screen recording + CapCut) was necessary.** It wasn't — Flow's Veo can
   generate a single 8-second avatar clip with lip-synced audio that IS a
   complete short ad on its own. **Lesson: check whether the simplest
   single-step output already satisfies the ask before designing a
   pipeline.**

## What actually worked

- **Google Flow's "Ingredients to Video" mode** (labs.google/flow): attach
  a person image (an avatar the user made earlier in Flow) as the
  ingredient, write a prompt, Veo generates an 8s clip of that person
  talking, with generated lip-synced speech. No separate voiceover tool
  needed for a talking-head style ad.
- **Finding the mode toggle was the first real obstacle** — "Ingredients
  to Video" isn't a top-level tab, it's a dropdown/mode-switch near the
  prompt box (also reachable by clicking the "+" add-image icon in the
  prompt box, which auto-switches modes). Not obvious from the main UI.
- **Veo prioritizes the *scene description* over *quoted dialogue* if the
  dialogue is buried mid-prompt.** First attempt: full script in a
  sentence like `they say: "..."` → Veo ignored it and improvised a
  generic line ("get your score today"). Fix: lead with an explicit
  `Dialogue, spoken exactly, word for word: "..."` instruction, put it
  FIRST in the prompt, keep it short. Longer lines are more likely to get
  cut short or paraphrased — shorter, punchier scripts survive intact.
- Judging a generated clip only needs 3 fast questions: does it look like
  the avatar, is the line spoken correctly, does the voice fit. No need
  for elaborate rubrics.

## Reusable prompt pattern for avatar/spokesperson clips

```
Dialogue, spoken exactly, word for word: "<short line, one sentence>"

The person from the ingredient image says this line <tone>, looking
straight into the camera, <one small physical beat, e.g. "with a small
smile at the end">. <setting: one clause>, <lighting: one clause>, slow
push-in, realistic TV-commercial look. No captions, no on-screen text.
```

Keep the whole thing well under 8 seconds of spoken content — that's
Flow's hard clip length, and Veo will not always let dialogue run over it.

## Process lesson for next time

Default to the smallest deliverable that satisfies the request, hand it
over, and only build out supporting scaffolding (checklists, multi-scene
plans, alternate tools) if the user asks for more after seeing the first
result actually work.
