# PLANB: monetization/content/SEO-data — concrete next steps

Written 2026-08-31 from a brain-dump ("what's the quickest way to monetize,
what problem are we solving for paying customers, publish GEO content, add
more SEO data, general improvements"). Full plan record:
`~/.claude/plans/todo-so-what-s-the-spicy-valley.md`.

## Context

Four threads at once — quickest way to monetize, what problem paying
customers actually have, publishing GEO/AI-visibility content, and adding
more SEO data — plus "how do I get AI to recommend my business," which is
literally the product's own value prop turned on Dizid itself.

Research across `TODO.md`, the shipped code, and the nested `CLAUDE.md`
files found these four threads aren't actually independent, and the
instinct to build more features is wrong here — **the app doesn't need more
features to monetize faster; it needs two cheap fixes and two decisions**:

- **Stripe went live 2026-08-28**: Free + $99/mo Pro + $19 no-account
  single scan, restricted live-mode key. But **zero live-mode transactions
  have been verified end-to-end**, and **zero customer acquisition has
  happened** — no prospect list, no outbound sent. That's the actual
  blocker, not missing product surface area. (`netlify/functions/CLAUDE.md`'s
  "Billing" section still says $199/mo and test-mode — stale; `TODO.md` is
  the current source of truth.)
- Two small, real issues sit in the exact path a paying customer touches: a
  security finding in the $19-purchase receipt email (token leaks via
  URL/referrer — fixed here, see below), and a scan-polling dead-end bug
  `TODO.md` listed as open that was actually already fixed in commit
  `bc7e2e0` (2026-08-27) — corrected in `TODO.md` as part of this pass.
- The content backlog isn't "what to write next" — 4 posts are already
  built and live at `/blog`, gated behind Marc's own explicit "read before
  treating as final." No unwritten backlog exists (every `content/articles/`
  draft already has a matching `content/blog/` post) and no distribution
  channel exists yet (no newsletter/RSS/social auto-post).
- The SEO-data ask has one genuinely easy, zero-cost win: `shared/harmonia.mjs`
  already calls Google PageSpeed Insights for every scan but only reads the
  `performance` category out of several PSI provides for free in the same
  call. Pulling `seo`/`accessibility`/`best-practices` categories plus a few
  more already-fetched-HTML fields is pure upside — no new API call, no new
  cost, no new infra.

## Part A — Shipped this pass (code)

- **A1. Stripe webhook token-in-URL leak — partially fixed, rest
  deliberately accepted** — the referrer-leak half of the 2026-08-24
  finding is closed (`app.html` now sets `<meta name="referrer"
  content="no-referrer">`). The access-log half's originally-proposed fix
  (a one-time-redemption redirect that rotates the token on first click)
  was designed, then rejected: corporate email gateways commonly pre-fetch
  every link in an email to scan it, which would silently burn a strict
  single-use token before the real customer clicks it — locking a paying
  customer out of their own $19 receipt. See `TODO.md`'s entry for the
  full reasoning; this is a known, accepted residual risk, not an
  oversight.
- **A2. Docs corrected** — `TODO.md`'s stale "pollScan gap still open" item
  marked done (commit `bc7e2e0` already fixed it); root `CLAUDE.md`'s "no
  test framework" claim corrected (vitest was added the same commit).
- **A3. `shared/harmonia.mjs` extended** — more free signal pulled from the
  PageSpeed Insights call already made per scan (SEO/accessibility/
  best-practices category scores, more Lighthouse audits) and from the
  homepage HTML already fetched (favicon/manifest, hreflang, `<html lang>`,
  more OG/Twitter fields), plus sitemap URL counting. Backend-only, additive
  to the existing nullable `scans.harmonia` column — no migration needed,
  and not yet surfaced in `ScanDetail.vue` (deliberate follow-up, kept out
  of this batch).
- **A4. Test coverage** — `tests/harmonia.test.mjs` added for the new
  parsing logic, following the precedent set by `tests/aivis-core.test.mjs`.

## Part B — Decisions for Marc, not build tasks

These are business calls, not engineering gaps.

**Monetization — the quickest real lever:**
1. Run one real live-mode Checkout (Pro or the $19 single scan) with an
   actual card to confirm the live pipeline truly works end-to-end — needs
   Marc, not code. Nothing else about monetization matters until this is
   confirmed once.
2. The prospect list Marc already committed to (`TODO.md`, "Marc" section)
   is the actual growth lever, explicitly marked "not to be picked up
   proactively until Marc raises it again."
3. "Get jobs through it" / sell AI-visibility services as a Dizid offering
   — already surfaced and deliberately deferred in `PLAN_NEXT_PHASE.md`
   pending real demand signal. That decision still stands unless revisited.
4. If outbound ever resumes, `proof-script/OUTREACH.md` still closes on
   Dizid's separate Site Improver product, not Foreground — needs a
   rewrite before reuse.

**Content — the blocker is review, not production:**
1. The 4 `/blog` posts need Marc's actual read-through before being
   promoted anywhere (his own explicit gate, unmet since 2026-08-24).
2. Once approved: no distribution mechanism exists today (no newsletter,
   no RSS, no social auto-post) — an RSS feed is a cheap follow-up addition
   to `scripts/build-blog.mjs` once there's approved content to distribute.
3. Marc's own question ("Hoe zorg ik ervoor dat AI mijn bedrijf
   aanbeveelt?") is effectively a 5th article topic in the same voice as
   the existing 4 — flagged as a future candidate, not drafted here.
