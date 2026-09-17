---
title: We ran the scan again. This time, a model invented a fake competitor with our name.
description: A second self-scan, four days after "we-scanned-ourselves," found the same disambiguation problem — plus a new one. Two models described detailed, confident, entirely fictional products called Foreground. Neither exists.
date: 2026-09-17
---

Four days after [we first ran Foreground on Foreground](/blog/we-scanned-ourselves)
and found that most models didn't reliably know which "Foreground" we
meant, we ran it again — same pipeline, real prompts, real web-grounded
calls, no mocking. Not because the number needed defending. Because the
whole point of building this on ourselves first is to keep checking, the
same way we'd tell you to.

The honest number this time: 12 of 40 completed checks mentioned us (10 of
50 calls failed outright — the same known cost of proof-script's
unthrottled research mode, not the hosted app's tuned pipeline). Read the
raw responses, and the story underneath that number got *more* interesting
than last time, not less.

**One model got it exactly right.** Asked directly whether Foreground is a
good choice for a small business tracking AI mentions, Gemini answered:
"Foreground is a strong choice... a Visibility Score (0-100) across major
models like ChatGPT (GPT-5) and Gemini (3 Flash)... a free tier that
doesn't require a credit card... it translates complex AI behavior into a
'foreground vs. background' concept." That's not a lucky string match —
that's an accurate, specific, unprompted description of the actual
product, including the actual metaphor its own name is built on. When a
model has enough real signal to work with, it gets there.

**Two models didn't have that signal, and confidently invented a
replacement.** Asked "what are people saying about Foreground vs.
Otterly.AI," GPT-5 mini answered: "Foreground is a journal‑club /
literature‑management tool aimed at clinicians: it finds papers, helps run
journal‑club meetings, generates study decks..." — and cited a real,
working URL, `foreground-jc.com`. We checked. It's a real site. It's a
real, unrelated product for medical journal clubs. It is not us, and the
model presented it as though answering the question asked.

Gemini, same prompt, did something stranger: it described "Foreground (by
Foreground Digital)... a Free Agency Utility Tool... Fixed set of 8
diagnostic questions... includes API calls to models like DeepSeek and
Claude by default" — complete with specific pros, specific cons, and a
full comparison table against Otterly.AI. None of it is true. There is no
"Foreground Digital."
There is no 8-question fixed diagnostic. We don't call DeepSeek. This
wasn't a mix-up with a real company — it's a fully synthesized product,
assembled from category-shaped fragments and delivered with the same
confidence as Gemini's *correct* answer two prompts earlier. Separately,
Mistral answered the identical prompt by quietly substituting Profound's
real stats — "$58.5M in funding... 130M+ prompts across 9 AI engines" —
under our name, as if "Foreground" and "Profound" were the same word typed
slightly differently.

Claude Haiku, to its credit, did the thing we'd actually want a model to
do when it doesn't know: "I couldn't find any product called 'Foreground'
in my search results... could you clarify if you meant 'Profound'
instead?" No invention. No wrong answer delivered as a right one. Just an
honest gap, which — read against the two answers above it — is
underrated behavior.

**This is the same problem the first post found, sharper.** Last time, the
worst case was a model merging us with an unrelated nonprofit. This time,
two different models independently manufactured two different fictional
products under our exact name, each internally consistent enough to read
as researched rather than guessed. Our own [presence
detection](/glossary#presence-detection) still can't tell "accurately
described," "confused with a real unrelated company," and "confused with
a company that doesn't exist" apart — all three still just count as a
citation, the same conservative, string-matching limitation the first post
already flagged and this repo's process already requires a human to catch
before trusting a number. It caught something real, again.

**What we're actually doing about it, concretely, this time:** the first
post said the fix was "off-site authority" — being findable, correctly,
in the places a model's search reaches for when it doesn't have enough
signal on its own. That's no longer just a diagnosis. We're submitting
Foreground to the directories that show up in exactly these searches
(Product Hunt, AlternativeTo, SaaSHub) with the same plain, factual
description every time — same approach as fixing our own JSON-LD entity
data, just off our own domain this time, where a model that doesn't trust
us yet might actually go looking.

— Marc. Two AI models made up a company with our name and described it in
more detail than some real startups get in their own pitch decks. If you
want to find out whether something similar is happening to your business
— a competitor's name getting attached to you, or a fictional version of
you filling the gap where a real answer should be —
[run a free scan](/app/signup). We're not exempt from the problem we
built a product to measure. We keep finding that out in public, on
purpose.
