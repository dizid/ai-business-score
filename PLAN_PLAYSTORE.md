# Foreground — Play Store App: Planning

## Status (updated 2026-09-02)

Planning only. No code changed yet. This doc lays out the approach, what's
already in place, what's missing, and the decisions that need Marc before
implementation starts.

**Decided by Marc (2026-09-02):** domain registration happens **before**
the TWA work (not after, not in parallel) — see M0 below. The Play
Console developer account will be Marc's standard/personal Google
account, not a new one created for this — no new-account setup needed on
that front, just confirming access when M3 starts.

**Domain chosen: `foreground.info`** (registered 2026-09-02 by Marc).

## Handoff — resume here

As of 2026-09-02, this is a **live blocker**, not a future task:

- `foreground.info` is registered but **not yet attached to the Netlify
  site**. Checked via the Netlify MCP `get-project` call against site
  `aivis-scan` (`70e29675-6562-4245-831a-7a3392e51980`) — its
  `primarySiteUrl` still reads `aivis-scan.netlify.app`, no custom domain
  configured.
- The Netlify MCP tools available in this session have no domain-write
  operation (checked `netlify-project-services-updater`'s op list) — this
  step needs Marc directly in the Netlify dashboard:
  1. Netlify dashboard → site `aivis-scan` → Domain management → Add a
     domain → `foreground.info`.
  2. DNS: if registered through Netlify, it auto-configures. If through
     an external registrar, Netlify shows either nameservers to delegate
     (simplest — Netlify then manages DNS + free Let's Encrypt TLS) or an
     A/ALIAS + CNAME pair to add at the registrar instead.
  3. Wait for Netlify to confirm DNS + issue the cert (minutes to a few
     hours).
- **Once `foreground.info` actually resolves to the site**, come back and
  ask Claude to (this session or a fresh one — this doc has the full
  context):
  1. Swap all 18 hardcoded `aivis-scan.netlify.app` references (found via
     `grep -r aivis-scan.netlify.app`) to `foreground.info` — canonical/OG/
     JSON-LD tags in `index.html`, `how-it-works.html`, `privacy.html`,
     `terms.html`; `public/sitemap.xml`, `public/robots.txt`,
     `public/llms.txt`; `scripts/build-blog.mjs`'s blog template;
     `shared/entityPresence.mjs`; `netlify/functions/scheduled-rescan.mts`.
     (`proof-script/OUTREACH.md`, `TODO.md`, `WISH_LIST.md`, `README.md`,
     `TODO-MARKETING.md`, `CLAUDE.md`, `DASHBOARD.md` are historical/journal
     entries — leave those as-is per this repo's own dated-entry
     convention, same reasoning as the AIVis→Foreground rename note at the
     top of root `CLAUDE.md`.)
  2. Add `https://foreground.info` to Neon Auth's `trusted_origins`
     (dashboard step — no Neon MCP server available in this session; give
     Marc exact instructions if still unavailable next time, or check
     again in case Neon MCP has connected by then).
  3. Update root `CLAUDE.md`'s Deployment section to record the domain
     (matching how it already documents every other infra decision here).
  4. Then proceed to M1 (PWA hardening) below — done shortly after.
- The Netlify site itself is currently unaffected either way — no code
  changes have been made yet in this pass; the only artifact from this
  session so far is this planning doc.

**Resolved 2026-09-02**: all four steps above are done. All 10 hardcoded
`aivis-scan.netlify.app` references swapped to `foreground.info`
(`index.html`, `how-it-works.html`, `privacy.html`, `terms.html`,
`public/sitemap.xml`, `public/robots.txt`, `public/llms.txt`,
`scripts/build-blog.mjs`, `shared/entityPresence.mjs`,
`netlify/functions/scheduled-rescan.mts`'s comment). `https://foreground.info`
added to Neon Auth's `trusted_origins` via the Neon MCP (confirmed present
in a follow-up `list_auth_trusted_domains` call, alongside the untouched
`aivis-scan.netlify.app` entry). Root `CLAUDE.md` updated. M1 (PWA
hardening) was picked up shortly after in commit `a3a9757` ("Add real PWA
support to app.html") and **is fully done** — see M1's entry below.
(A 2026-09-02 doc-sweep pass briefly and incorrectly flagged
`<link rel="manifest">` as missing from `app.html` based on a grep of the
raw source file; that grep missed it because the tag is pulled in from
`partials/favicon.html` via the `<!--#include:favicon-->` marker, resolved
only at build time. Corrected same-day after checking the actual built
output — the tag is present, PWA installability is not blocked.)

## Current state relevant to this

- `app.html` is the real product: an authenticated vue-router SPA
  (`src/app/router.ts`) that talks to Netlify Functions + Neon Postgres.
  Auth is Neon Auth (Better Auth), billing is Stripe Checkout (currently
  test-mode — see root `CLAUDE.md`). Nothing about the app's data model
  assumes a browser tab specifically; it's ordinary fetch calls.
- `public/site.webmanifest` already exists (`name`/`short_name`
  "Foreground", `icon-192.png`/`icon-512.png`, `theme_color`/
  `background_color` `#0a0a0d`, `display: standalone`) and `index.html`
  sets `theme-color`. **Resolved by commit `a3a9757` (2026-08-18)**:
  `public/sw.js` now exists (cache-nothing install/activate/fetch handler)
  and is registered from `src/app/main.ts`
  (`navigator.serviceWorker.register('/sw.js', { scope: '/app' })`); the
  manifest gained a maskable icon variant (`icon-maskable-512.png`); and
  `app.html` links the manifest via `partials/favicon.html`'s
  `<link rel="manifest" href="/site.webmanifest" />`, included through the
  `<!--#include:favicon-->` marker already in `app.html`'s `<head>` — not a
  literal tag in `app.html` itself, which is why an earlier same-day docs
  pass grepped the raw file, found nothing, and briefly (incorrectly)
  flagged this as missing. Checked in the actual built `dist/app.html`:
  the tag is there. PWA groundwork is complete.
- No custom domain is registered yet — the live site is
  `aivis-scan.netlify.app` (see root `CLAUDE.md`). This matters directly
  for the Play path below (Digital Asset Links are bound to a specific
  origin).
- `privacy.html`/`terms.html` are finalized (banner removed 2026-08-24) and
  reusable as-is for the Play Console's required privacy policy URL.

## Framing the actual decision

"A Play Store app" for a product that's already a working authenticated web
app has three real shapes, in increasing cost:

1. **TWA (Trusted Web Activity)** — a thin native Android shell that opens
   `app.html` full-screen, no browser chrome, installed from the Play
   Store like any native app. The web app is the product; Android is just
   a distribution wrapper. Tooling: Google's own `bubblewrap` CLI or
   PWABuilder.com, both of which generate the Android project and signing
   scaffolding from the manifest.
2. **Capacitor/Cordova hybrid** — wraps the same web app in a WebView but
   gives access to native device APIs (push notifications, camera, etc.)
   through a plugin bridge. More build/release overhead (a real Android
   Studio project to maintain, native dependency updates) for capability
   this product doesn't currently need.
3. **Native rewrite** — a from-scratch Kotlin/Compose app reimplementing
   the scan/company/billing UI natively. Months of work duplicating a UI
   that already exists and works in a mobile browser; nothing about this
   product (data-heavy dashboards, occasional scan runs, no camera/
   sensors/offline-first requirement) benefits from native APIs.

**Recommendation: TWA.** This product has no need for (2) or (3) — it's a
account-gated SaaS dashboard, not a device-integrated app. TWA gets it into
the Play Store with the smallest surface area to maintain, and reuses
100% of the existing Vue app with no fork.

## What's actually missing before a TWA can ship

1. **PWA compliance** — Play Console (via Bubblewrap) checks that the site
   passes basic installability: a service worker (even a minimal
   cache-nothing one satisfies the check — TWAs don't need real offline
   support for this kind of always-online dashboard, but the manifest
   spec requires the registration to exist), a manifest reachable from
   `app.html` with `start_url` and `scope` scoped to `/app`, and icons
   including a **maskable** variant (the existing `icon-512.png` is a
   plain square; Android adaptive icons need a safe-zone maskable icon or
   the launcher icon gets awkwardly cropped).
2. **Digital Asset Links** — `/.well-known/assetlinks.json` on the served
   origin, listing the Android app's signing certificate SHA-256
   fingerprint. This is what lets the TWA open without a URL bar (Chrome
   verifies the site "owns" the app). It's generated by Bubblewrap once a
   signing key exists, then needs deploying as a static file (trivial —
   `public/.well-known/assetlinks.json` alongside `robots.txt`).
3. **Domain stability** — Digital Asset Links are bound to the exact
   origin serving the app. Resolved: domain gets registered first (M0),
   so the TWA is built against the real domain from the start — no
   redo-Asset-Links-and-ship-an-update churn.
4. **Google Play Console developer account** — one-time $25 registration
   (or already paid, if Marc's Google account has a developer account from
   a prior app). Resolved: Marc's existing standard Google account is the
   one to use — no new account needed. Still worth Marc confirming before
   M3 that account has (or gets) the $25 registration and identity
   verification Play requires, since that's a Marc-only step Claude can't
   do on his behalf.
5. **Store listing assets** — short/long description, feature graphic
   (1024×500), phone screenshots (min 2), app icon (512×512, already
   have), content rating questionnaire, target audience/age declaration.
6. **Data safety form** — Play Console requires declaring what user data
   the app collects/shares (account email via Neon Auth, scanned company
   URLs, Stripe billing metadata, GA4 analytics — all already disclosed in
   `privacy.html`, so this is a transcription task, not new legal work,
   but it's a real form that has to be filled out carefully).
7. **New-developer testing requirement** — Play currently requires new
   personal developer accounts to run a closed test with 12+ testers for
   14+ continuous days before a production release is allowed. This is a
   calendar constraint, not an engineering one — worth starting the
   account/testing track early since it gates the launch date regardless
   of how fast the app itself is ready.

## Proposed milestones

- **M0 — Domain registration** (blocking, do first): register a real
  domain, point it at Netlify (custom domain + DNS, Netlify manages free
  TLS via Let's Encrypt once DNS is verified), then repoint every
  canonical/OG/JSON-LD/sitemap/robots/llms.txt URL currently hardcoded to
  `aivis-scan.netlify.app` (per root `CLAUDE.md`, these were left pointing
  there deliberately, "until a domain nobody owns yet" — that condition is
  now being resolved) and update Neon Auth's `trusted_origins` to include
  the new domain. Netlify itself can register domains directly from the
  dashboard, or an external registrar (Namecheap, Google Domains/Squarespace,
  Cloudflare) works equally well with Netlify as the DNS/host target —
  Claude has no tool access to actually purchase a domain, so this step
  needs Marc to either buy it directly or hand over registrar credentials/
  a name choice for Claude to wire up DNS afterward. **Blocks M2** (Digital
  Asset Links are bound to this exact origin) — doing it after M2 means
  redoing Asset Links and shipping an Android app update.
- **M1 — PWA hardening**: add a minimal service worker + registration
  (✅ done, `a3a9757`), add a maskable icon variant (✅ done, same commit),
  confirm/add `<link rel="manifest">` in `app.html` (✅ done, same commit —
  via `partials/favicon.html`, see "Current state" above). Only remaining
  step: verify with a real Lighthouse PWA audit — not yet run. No behavior
  change to the product itself.
- **M2 — TWA generation**: run Bubblewrap against `app.html`'s manifest,
  produce the signed Android project, add `assetlinks.json`, verify the
  app installs and opens chrome-less on a real device/emulator.
- **M3 — Play Console setup**: Marc creates the developer account; store
  listing content, screenshots, data safety form, content rating.
- **M4 — Closed testing → production rollout**: satisfy the 12-tester/
  14-day track, then promote to production.
- **M5 (optional, later)** — web push via the TWA once there's an actual
  notification use case (e.g. scan-complete, which already sends email —
  push would be additive, not a replacement).

## Open questions for Marc

- **What domain name?** M0 is now the next actionable step and needs an
  actual name to register (e.g. something in the "Foreground"/AI-search-
  visibility space) before anything else here can proceed.
- Any preference on "Foreground" as the Play Store listing name, given the
  rename history in root `CLAUDE.md` (checked clean against direct
  competitors at rename time, but that check didn't include Play Store
  namespace collisions specifically)?
- Priority relative to the rest of `TODO.md`/`PLAN_NEXT_PHASE.md` — this
  is a new, unscheduled initiative, not a continuation of an existing
  milestone.
