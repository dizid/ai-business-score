# Foreground — Competitive Position & Improvement Plan

*Written 2026-09-02. Domain: `foreground.info` (registered). Beta testers get
free Pro via manual DB edit — already safe/webhook-proof by design, just
needs an in-app request path. Google AI Overviews coverage: skipped, see P2.4
(no public API; either a $50-150+/mo SERP-API vendor cost or fragile
in-house scraping with Google ToS risk — Marc chose to lean into transparency
messaging instead).*

## Where we stand vs. the category

| | Foreground | Category (Otterly, Peec, Profound, AthenaHQ, Scrunch...) |
|---|---|---|
| Entry price | Free / $19 one-time / $99mo | $29–$500+/mo |
| Models/engines | 4 (GPT-5-mini, Gemini, Claude, Grok — direct provider APIs since the 2026-08-15 migration, not routed via Perplexity; Perplexity is still used for `enrich.mts`/`stripe-webhook.mts`/`judge-sentiment.mts`/`generate-deep-advice.mts`, corrected 2026-09-02) | 8–17+ |
| Google AI Overviews / Copilot | Not covered | Some competitors cover it |
| Sentiment + citation attribution | Shipped | Common at $99+/mo |
| Monitoring | On-demand + Pro weekly opt-in | Continuous by default |
| Alerts | Email only | Slack/webhook common |
| Agency/white-label, export | None | Common, fast-growing segment |

**Edge**: price, the no-account $19 scan, and unusually honest disclosure of
its own limitations. **Biggest weakness**: the "AI search" pitch doesn't cover
Google AI Overviews at all, and 3 of 4 models are queried via raw API rather
than real front-end sessions (the industry's more-trusted method).

**Strategy**: compete on trust, frictionless entry, and price — not
engine-count parity with funded competitors (not realistic for a solo team).

---

## P0 — Do now

1. **Domain → `foreground.info`**
   Code: update canonical/OG/JSON-LD tags in `index.html`, `how-it-works.html`,
   `privacy.html`, `terms.html`; `robots.txt`/`sitemap.xml`/`llms.txt`;
   `scripts/build-blog.mjs`'s one `siteUrl` constant (fixes 8 downstream
   uses); the scanner's User-Agent string in `shared/entityPresence.mjs`;
   `proof-script/OUTREACH.md` (live prospect-email copy).
   Outside code: attach domain + DNS in Netlify → add it to Neon Auth's
   `trusted_origins` (or sign-in breaks) → point Stripe's webhook at the new
   URL. Do in that order — nothing else works until the domain is live.

2. **Beta access request + notification email**
   New `beta_access_requests` table + `request-beta-access.mts` function +
   a "Request free beta access" link next to every "Upgrade to Pro" button
   → emails a new `FOUNDER_NOTIFICATION_EMAIL` env var. Replaces the current
   fully-manual Google-Form process. The actual free-Pro grant (manual SQL,
   already documented in `netlify/functions/BETA_TESTERS.md`) is already
   webhook-safe — nothing changes there.

3. **Restore live Stripe billing** — mechanically small (plan/Pro status is
   fully decoupled from Stripe already), but do it *after* #2 ships so
   there's a real "don't pay" path before real charging goes live. Flipping
   the actual Stripe keys live is a separate, explicit step — confirm with
   Marc at the time, real money.

4. **Fix top-up-pack copy/code mismatch** — delete the disabled
   `create-topup-checkout-session.mts` and its webhook branch, remove
   credit-pack math from `scan.mts`/`scheduled-rescan.mts`/`plan.mts`,
   remove the stale banner in `CompanyDetailView.vue`, drop the "top-ups
   available" copy from `index.html`/`llms.txt`. Leave the old DB table in
   place (historical data, matches repo convention). Check with Marc before
   touching the stray live `STRIPE_TOPUP_PRICE_ID` env var.

5. **Password reset** — `better-auth` already has the primitives, just never
   wired up. First confirm Neon Auth's console actually has reset-email
   delivery turned on, then add the client calls + two new views.

6. **Cookie consent banner** — small custom banner (fits the brand better
   than a library), gates the GA4 script load behind consent, stored in
   `localStorage`.

## P1 — Close the biggest gaps

7. **Continuous tracking by default** — extend the existing
   `scheduled-rescan.mts` cron. Make **Pro auto-weekly by default** (opt-out,
   not opt-in). Leave **Free on-demand only** — their 3-scan *lifetime* cap
   makes silent auto-scanning a bad experience.

8. **Slack/webhook alerts** — add alongside the existing score-regression
   email trigger in `run-scan-background.mts` (same condition, same
   best-effort pattern). New `user_profiles.notification_webhook_url` column
   + a settings field. Plain webhook POST, not Slack-specific, so it also
   covers Discord etc.

9. **CSV/JSON export** — the data-gathering chain already exists
   (`toScanPayload` → `scanDerived.ts`'s pure functions, same as the
   Markdown report). Start with per-company export (full history), new
   `GET /companies/:id/export` endpoint.

## P2 — Growth / moat

10. **Agency/portfolio view** — already fully scoped in `REPORTPLAN.md`
    Change 2 (lightweight view, explicitly *not* full multi-user sharing —
    re-read that doc before building).

11. **Embeddable "scored by Foreground" badge** — concept only so far
    (`PLAN_NEXT_PHASE.md` Milestone G), gated on live billing (#3) actually
    landing a payment. Needs its own short design pass; keep the link target
    opt-in per company (the leaderboard/public-page idea has been built and
    killed twice before over privacy concerns — don't repeat that).

12. **Vertical prompt packs (3–5 verticals)** — add
    `PROMPT_TEMPLATES_BY_VERTICAL[vertical][language]` alongside the
    existing generic templates in `shared/aivis-core.mjs`. Query real
    `companies.category` values first to pick verticals by actual usage,
    not guesswork.

13. **Market the transparency angle** — copy-only. Pull the existing
    "limitations, honestly stated" disclosure from `how-it-works.html` into
    `index.html`'s hero as an actual differentiator; a blog post once Marc's
    reviewed the drafted content backlog.

---

## Suggested order

Domain (1) → password reset + cookie consent (5, 6) → top-up cleanup (4) →
beta-access flow (2) → **go live with Stripe (3)** → Slack alerts + export
(8, 9) → continuous tracking (7) → transparency copy (13) → vertical packs
(12) → agency view (10) → badge (11, after #3 has a real payment).

Each batch: `npm run build` + `type-check` + `test:run`, manual browser check
for anything in `src/app/**`. Billing batches additionally need a real
Stripe test-mode checkout run end-to-end before being called done.
