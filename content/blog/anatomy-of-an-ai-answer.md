---
title: What happens between "best dentist near me" and the answer you get
description: An AI answer isn't a ranking of your website — it's a candidate cloud compressed into one sentence. How that compression actually works, and why it favors specific, quotable businesses.
date: 2026-08-24
---

People tend to picture this as a lookup. You ask an AI a question, it
"knows" the answer, it tells you. Simple as a phone book. It's not that,
and the difference matters if you're trying to understand why some
businesses show up in these answers and others don't.

Here's roughly what happens, stripped down. The model gets your question —
"best dentist near me," say. Depending on which model and which setup, it
either answers from what it already absorbed during training, or it runs
one or more searches first and reads through what comes back, or some mix
of both. Either way, at that point it isn't holding a single "correct"
business in mind. It's holding a small cloud of candidates — names it's
seen associated with that category, in that area, with some signal of
relevance attached to each. Then it does the part a search engine never had
to do: turn that cloud into a sentence, in an order, and commit to it.

That ordering is the whole game, and it's the part most people skip past
when they think about this. Getting mentioned at all and getting mentioned
first are not adjacent outcomes on a scale — they're closer to different
outcomes entirely. When I built the scoring behind Foreground, this was the
thing I kept redesigning, because a naive "mentioned yes/no" score was
lying to people. A business named first in an AI answer and a business
named fourth, buried in a "you could also consider" clause at the end,
aren't both "visible" in any sense a business owner would recognize. So the
scoring weights it that way on purpose: named first counts as a full point,
second is worth about 60% of that, third about 30%, and a passing mention
barely a tenth. Diminishing, fast, deliberately — because that's roughly
how much attention a real person pays past the first name in a
spoken-style answer.

Run that same question through four different models — I use GPT-5 mini,
Gemini 3 Flash, Claude Haiku 4.5, and Grok 4.6, because they don't agree
with each other nearly as often as you'd expect — and you start to see
that "AI visibility" isn't one number, it's a pattern. A business might get
named first by one model and skipped entirely by another, and that gap
alone tells you something. Usually it means the model that skips you simply
doesn't have a clean, specific fact to attach to your name — nothing
quotable, nothing distinct — so when it's forced to pick a short list, it
reaches for whoever gave it something easier to repeat.

That's the mechanism worth sitting with: an AI answer isn't a ranking of
your website. It's the model's best attempt at compressing "who should I
tell this person about" into one sentence, under real pressure to be short
and confident, using whatever specific, legible facts about you it managed
to pick up along the way. Vague businesses lose that compression contest
before it even starts — not because they're worse, but because there's
nothing about them sharp enough to survive being squeezed into a sentence.

It also explains something that confuses people at first: why the same
business can get a completely different answer depending on how the
question is asked. "Best dentist near me" and "dentist that does same-day
emergency appointments" pull from different corners of that candidate
cloud, because the model is matching the specific thing you asked, not
running one fixed ranking it applies to every version of the question.
There's no single "AI rank" the way there's a Google position — there's a
different compression each time, built fresh around what was actually
asked.

If you take one thing from this: stop asking "am I mentioned." Ask where.
The gap between first and fourth is the whole story, and most people asking
about their AI visibility right now aren't asking that question at all.

— Marc. [Foreground](/) runs this exact check — five questions, four
models, twenty data points — so you're not guessing at the pattern by hand.
[Try it free](/app/signup).
