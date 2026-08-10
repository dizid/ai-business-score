# Outreach playbook — AIVis-hooked cold email → Site Improver

Phase 1 of the AIVis GTM plan (2026-08-03): use real AIVis scan results as
the opener for a small, hand-picked outbound batch. The close is Dizid's
existing web-rebuild offer (Site Improver) — AI-visibility fixes are framed
as part of that rebuild, not sold as a separate product. Volume target:
10-15 prospects/week, not a list blast — `proof-script` was built for a
curated list and the whole hook only works if the finding is real.

## 1. Qualify before you draft (~5 min/prospect)

1. Add the prospect to `prospects.json` (copy the shape from
   `prospects.example.json`) and run them through `proof-script`:
   `node index.mjs --prospects prospects.json`
2. **Only proceed if they're actually invisible or beaten.** Check
   `results/<slug>.md` — if `citedCount` is high and they're ranked #1,
   drop them from this batch. Emailing someone who already wins undercuts
   the whole premise; the point is a real, specific finding, not a form
   letter.
3. For qualified prospects, sign into your own AIVis account at
   `https://aivis-scan.netlify.app/app`, add them as a company, and run a
   scan there too. This is your visual asset: **take a screenshot** of the
   resulting score ring / scoreboard and attach or inline it in the email —
   a real screenshot is a stronger "look at this" moment than a text
   summary. (There is no public shareable link for a scan run this way —
   that mechanism was retired 2026-08-03 when the hosted site became an
   authenticated multi-tenant app; every scan now lives behind login +
   company ownership, on purpose, so don't hunt for a `/result.html#d=...`
   link for anything scanned after that date, it won't exist. `proof-script`
   stays the qualifier either way — more thorough, 8 prompts vs. the hosted
   app's 3.)
4. Pull the one-line hook from `results/<slug>.md`'s **"Directional email
   draft"** section — don't write your own claim, that section already
   exists specifically so the wording stays honest about what was actually
   observed. Do not turn it into a precise/re-verifiable number — see the
   repo's `CLAUDE.md` for why (LLM responses vary between runs).

## 2. Who to target (default — override anytime)

- Local service businesses: plumbers, dentists, contractors, HVAC, local
  law/accounting — categories where "who does X near me" is exactly the
  kind of question people now ask ChatGPT/Gemini instead of Google.
- Bonus qualifying signal (not required): their existing site also looks
  dated/slow — makes the Site Improver close land naturally instead of
  feeling bolted on.
- Businesses you'd genuinely want as a client. This list is small on
  purpose — quality over volume.

## 3. The sequence — 5 touches over ~18 days

Merge fields: `{first_name}` `{brand}` `{category}` `{region}`
`{competitor}` `{hook_line}` (from the results file) `{screenshot}` (the
score-ring/scoreboard screenshot from step 1.3, attached or inlined)
`{signup_link}` (`https://aivis-scan.netlify.app/app/signup`) `{signature}`
`{calendar_link}`

### Touch 1 — Day 0 — the hook

Subject (A/B test both):
- A: `Quick one about {brand} and ChatGPT`
- B: `Does AI even know {brand} exists?`

```
Hi {first_name},

Quick experiment: I asked AI search — the same models people are
increasingly asking instead of typing into Google — who does {category}
in {region}.

{hook_line}

[attached: {screenshot}]

Curious what AI search says about your own site? The checker's free to
run yourself: {signup_link}

Worth a look — if {competitor} is the one showing up instead of you,
that's business walking to them before anyone ever hits your site.

{signature}
```

### Touch 2 — Day 3 — make it concrete

Subject: `one more thing on {brand}'s AI visibility`

```
Hey {first_name},

Following up on the AI search check I sent over. This isn't really a
"wait and see" thing — more people are starting with ChatGPT or Gemini
before Google these days, so what those models say about {brand} matters
more every month, not less.

We rebuild sites for businesses like {brand} anyway, and fixing this
(clearer service pages, structured data, the stuff these models actually
pull from) is usually one of the first things that comes out of that
work. Happy to point out the 2-3 specific things that would move the
needle for {brand} if useful.

{signature}
```

### Touch 3 — Day 7 — lower the ask

Subject: `worth 15 minutes?`

```
{first_name} — no pressure, just circling back.

The gap between "AI mentions you" and "AI doesn't" usually comes down to
a handful of fixable things: how your services are described, structured
data, what's actually indexable. That's exactly the kind of work we do
when we rebuild a site.

If it's useful, I can walk through the specifics for {brand} on a quick
call — no pitch, just what I'd actually change.

{signature}
```

*Once a first client has gone through this and has a real result, replace
this touch with an actual case study (specific before/after, verified —
see `@Sales` persona rule: never cite a claim you haven't checked). Until
then, don't invent one.*

### Touch 4 — Day 12 — direct ask

Subject: `15 min this week?`

```
{first_name}, want to grab 15 minutes this week or next to go through
the {brand} AI-visibility check together? I'll show you what
{competitor} is doing that's getting picked up, and what a rebuild would
fix.

{calendar_link}

{signature}
```

### Touch 5 — Day 18 — breakup

Subject: `closing the loop`

```
{first_name} — I'll leave this here so I'm not cluttering your inbox.

If AI search visibility becomes a priority later, the offer stands —
just reply anytime.

Good luck out there.

{signature}
```

## 4. Tracking

Use `tracking.csv` — already created by `proof-script` on first run, with
exactly the columns this needs: `brand,website,cited_count,completed_calls,
failed_calls,sent_date,replied,note`. Fill in `sent_date`/`replied`/`note`
by hand per touch. No new tracking system needed.

## 5. Metric that matters

Reply rate and meetings booked — not opens. At 10-15/week you'll know
within 2-3 weeks whether the hook is landing. If reply rate is near zero
after ~20 sends, the issue is more likely targeting or subject lines than
volume — don't scale a broken message.
