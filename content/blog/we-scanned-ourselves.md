---
title: We ran Foreground's own scan on Foreground. Here's what came back.
description: A real self-scan turned up a problem no amount of schema markup fixes — most models don't know which "Foreground" we mean, and one partly made up a fake version of our own company.
date: 2026-09-13
---

If you build a tool that checks whether AI models know who you are, the
obvious thing to do eventually is point it at yourself. So this week I ran
the exact same pipeline a customer gets — real prompts, real models, real
web-grounded calls, no mocking — against Foreground itself.

The honest number: 11 of 37 completed checks mentioned us (13 of 50 calls
failed outright — Grok and GPT-5 mini's reasoning overhead account for
most of that, a known cost of running the full unthrottled research script
instead of the hosted app's tuned concurrency). Read as a bare percentage,
that's a mediocre score. Read by actually opening the raw responses — the
step proof-script's own output insists on before you trust anything it
says — it's a much more specific and more useful problem than "mediocre."

**Most of the models don't know which Foreground we are.** Ask GPT-5 mini
who Foreground is and it stops to ask you back: "an AI meeting-notes app,
or a brand-visibility tool like Otterly.AI?" Ask Claude Haiku and it finds
a real, unrelated Wikipedia-adjacent nonprofit called Foreground AI — "a
research collective exploring the possibilities and effects of AI across
narrative and culture" — and confidently describes *that*, correctly, as
if it had answered your question. Ask Mistral Small and it describes a
"conversational AI platform" with file uploads and SSO that has nothing to
do with us. Three different models, three different wrong answers, each
delivered with full confidence.

Gemini was the one model that consistently found the real thing — mostly.
Its best answer accurately described the 5-prompt, 5-model, web-grounded
scoring approach well enough that it read like it had actually visited the
site. Its *worst* answer, on a "what do people say about Foreground vs.
Otterly.AI" prompt, invented an entire fictional offering: a "Foreground
Digital" agency selling a "$1,997 AI Visibility Foundation Fix" for
"Wikidata, schema, and entity graph repair." That service doesn't exist. No
one on our team wrote it, priced it, or shipped it. Gemini's web search
found *something* that pattern-matched closely enough to "Foreground" plus
"AI visibility" to get stitched into a confident, detailed, entirely wrong
paragraph — a textbook [hallucination](/glossary#hallucination), the kind
our own glossary already warns about, now demonstrated on our own name.

Here's the part worth sitting with: our own [presence
detection](/glossary#presence-detection) counted every one of those as a citation. The
regex doesn't know the difference between "Foreground accurately
described" and "Foreground confused with a nonprofit" and "Foreground
partly invented." It just matches the string. That's not a bug we're
quietly going to patch and pretend didn't happen — it's the exact reason
[how-it-works.html](/how-it-works) says presence detection is
"intentionally conservative" and this repo's own process requires a human
to actually read the raw text before trusting a number, every time. We ran
that process on ourselves and it caught something real.

**Why this is happening to us specifically:** "Foreground" is not a rare
string. It's a common English word, already the name of a nonprofit, a
recorder app, and apparently whatever Gemini's search index decided to
merge together. A model with no other signal reaches for whichever
"Foreground" it can find the most text about — and right now, that's not
consistently us. This is precisely the "off-site authority" gap our own
`entity_presence` check exists to catch (we don't have a Wikipedia page;
of course a model reaching for a Wikipedia-shaped answer finds someone
else's), and precisely the "specific, quotable claim" gap our
`clarity_check` exists to catch. We're not exempt from the problem we
built a product to measure. That's the whole point of running it on
ourselves instead of only ever reading the methodology.

What we're actually doing about it: building a clearer, more specific
public-facing description of what Foreground *is* (this post, plus the new
[glossary](/glossary), are part of that), and treating our own score the
same way we'd tell you to treat yours — a real signal, worth tracking
again after we've actually changed something, not a number to be
embarrassed about in the meantime.

— Marc. If a search for your own business name turns up a stranger's
answer instead of yours, that's exactly what
[Foreground](/app/signup) is built to catch — including, evidently, when
the business is us.
