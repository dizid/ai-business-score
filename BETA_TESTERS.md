# Beta Testers

Status (2026-09-02): plan approved, `foreground.info` confirmed live
(`curl -I` returns `200` via Netlify Edge — DNS finished propagating faster
than the estimated ~1 hour). Nothing sent yet — this doc is the ready-to-use
kit: intro email, feedback form questions, and the incentive-fulfillment
steps. No app code changes are part of this — see `~/.claude/plans/beta-testers-test-then-synthetic-lightning.md`
for the full reasoning.

**Incentive:** 1 free month of Pro, granted manually after a tester
completes a scan + the feedback form below. Free to give — Stripe is in
test mode right now (see root `CLAUDE.md`), so this is a plain database
flag, not a real subscription.

## 1. Intro email (send individually, personal, not a mail-merge blast)

Subject: `Quick favor — try something I built?`

> Hey [name],
>
> I've been building **Foreground** — it checks whether a business actually
> gets mentioned when people ask ChatGPT, Gemini, Claude, or Grok about
> their category (e.g. "best plumber in Rotterdam"). Turns out most businesses
> have no idea whether AI search even knows they exist, let alone
> recommends them over a competitor.
>
> Could you try it out? Takes about 10 minutes:
>
> 1. Sign up at https://foreground.info
> 2. Add a company — your own business, or one you know well
> 3. Run a scan and take a look at the report (the Overview tab has the
>    score + top advice; Details has the full breakdown if you want to dig
>    in)
>
> Everything's free to test right now — no card will be charged even if you
> poke around the pricing.
>
> Once you've run a scan, I'd really appreciate 5 minutes of feedback here:
> [GOOGLE FORM LINK] — and as a thank-you, I'll bump your account to a free
> month of Pro.
>
> Thanks for helping me test this,
> Marc

## 2. Feedback form (create in Google Forms, paste these in)

1. Your name / email — **must match the email you signed up to Foreground
   with** (needed to grant your free month of Pro)
2. How easy was signup and adding your first company? (1-5 scale +
   optional comment)
3. Did the AI Visibility Score make sense to you? Did you trust it? (open
   text)
4. Which part of the report was most useful? (multiple choice: Overview /
   Details per-check breakdown / Site Health (Harmonia) / AI advice /
   Other)
5. Did anything break, confuse you, or feel slow? (open text)
6. Looking at the pricing ($99/mo Pro, $19 one-time scan) — does that feel
   fair, high, or low for what you saw? (open text)
7. How likely are you to recommend Foreground to another business owner?
   (0-10)
8. Anything missing you expected to see? (open text)

## 3. Granting the incentive

Once a tester submits the form, run this via Neon MCP (project `aivis` /
`square-snow-36406551`, database `neondb`, branch `main`):

```sql
UPDATE public.user_profiles
SET plan_tier = 'pro', subscription_status = 'active'
WHERE user_id = (SELECT id FROM neon_auth."user" WHERE email = 'TESTER_EMAIL');
```

Mirrors exactly what a real Stripe subscription sets on `user_profiles`
(`plan_tier`/`subscription_status`), just without `stripe_customer_id`/
`stripe_subscription_id` — so there's no live Stripe object for a webhook
to ever revert this. Revert manually after 30 days:

```sql
UPDATE public.user_profiles
SET plan_tier = 'free', subscription_status = null
WHERE user_id = (SELECT id FROM neon_auth."user" WHERE email = 'TESTER_EMAIL');
```

**Verify the grant worked**: have the tester (or you, logged in as them)
refresh the app and confirm Pro-gated features unlock (deep advice button,
20-scan/month cap instead of 3 lifetime) — don't just trust the `UPDATE`
ran without error.

## Tracker

| Name | Email | Invited | Form submitted? | Pro granted | Revert due |
|------|-------|---------|------------------|--------------|------------|
|      |       |         |                  |              |            |
