# Social account setup checklist

Created 2026-09-07. Companion to `brand/BRAND.md` and `brand/voice.md` —
this file doesn't redefine brand rules, it just tells you exactly what to
paste where when creating Foreground's five social accounts. Reverses the
prior product-led-only stance recorded in `PLAN_NEXT_PHASE.md`.

**Why Claude can't do this part:** every platform below requires a
phone-number OTP and/or a CAPTCHA solved by a human, and all five prohibit
automated account creation in their Terms of Service. This is a ~15-20 min
per-platform manual task. Once done, hand the 5 profile URLs back so
`index.html`'s JSON-LD `sameAs` array can be filled in (see `TODO-MARKETING.md`).

## Step 0: business email (do this before any of the 5 signups)

**Gap found 2026-09-07**: `foreground.info` has no MX records at all
(confirmed via `dig MX foreground.info` — empty) — there is currently no
inbox that could receive a verification email at that domain. Every
platform below emails a confirmation code during signup, so this has to
exist first. Decision made 2026-09-07: **Google Workspace**, not free
forwarding, so the business account can send-as and reply-as
`foreground.info` too, not just receive.

**Done 2026-09-10**: Google Workspace set up, domain shows "Geverifieerd" /
"Gmail geactiveerd" in the admin console. **Mailbox created is
`founder@foreground.info`, not `hello@foreground.info`** as originally
planned below — that's the address to use for remaining platform signups
unless you also create `hello@` separately.

**Why Claude can't do this part either**: Workspace signup requires a live
payment method and clicking through Google's own ToS/verification flow —
same manual-only category as the 5 platform signups below.

1. Go to [workspace.google.com](https://workspace.google.com) → Get
   started. Business name: "Dizid Web Development" (the entity that
   `privacy.html` names as the operator) — Foreground is a product of
   Dizid, not a separate legal entity, so bill and register it that way.
2. When asked for a domain, choose **"I have one I'll use with Workspace"**
   and enter `foreground.info` — it's already registered on Porkbun, no
   need to buy a new one through Google.
3. Plan: **Business Starter** (~$7/user/month) is enough — one mailbox,
   no need for the higher tiers' extra storage/admin features yet.
4. Google gives you a **TXT record** to prove domain ownership, then **MX
   records** to route mail. **Add both in Netlify's DNS panel, not
   Porkbun's** — `foreground.info`'s nameservers are delegated to Netlify
   DNS (confirmed via `dig NS foreground.info` → `*.p06.nsone.net`,
   Netlify's DNS infrastructure), per this project's `CLAUDE.md` domain
   setup. Porkbun is just the registrar; its own DNS panel is inactive for
   this domain. Remove any placeholder MX records first if one exists by
   default.
5. ~~Create the mailbox as `hello@foreground.info`~~ — **superseded, see
   "Done 2026-09-10" note above: the mailbox actually created is
   `founder@foreground.info`.** Use that address everywhere below unless
   you deliberately also create `hello@` as a second mailbox/alias.
6. Turn on 2FA on the Workspace account itself (not just the individual
   social platforms) — this is now the account that can reset every social
   account's password via email, so it's the highest-value target to
   protect.
7. Once mail is flowing (send yourself a test from `founder@foreground.info`
   and confirm it lands), come back to Step 1 below.

## Before you start

- **Create a business/creator account type on every platform**, not a
  personal profile — this is what unlocks analytics and (later) Buffer's
  API connection.
- **Handle to try first: `foreground`.** If taken, fall back to
  `getforeground` (matches the live domain `foreground.info`). Checked
  2026-09-07: `@foreground` is already taken on Instagram (unrelated
  private account) — use `getforeground` there. X and TikTok couldn't be
  checked automatically (X blocks unauthenticated lookups, TikTok profile
  pages need JS) — just try `foreground` first at signup, platforms tell
  you immediately if it's taken.
- **Profile picture (all 5):** `public/icon-512.png`
- **Cover/banner (X, LinkedIn, Facebook only — Instagram and TikTok don't
  have one):** `public/og-image.png`. It's 1200×630; each platform's own
  upload tool lets you re-crop to its exact spec, no pre-resizing needed.
- **Bio (long form, where space allows):** "Every AI answer has a
  foreground. Make sure you're in it."
- **Bio (short form, tight character limits):** "Get in the foreground."
- **Website link:** `https://foreground.info`
- **Business email for every signup below:** `founder@foreground.info`
  (Step 0 above — set this up first; note this is the mailbox actually
  created, not the `hello@` address the rest of this file was originally
  drafted against).
- **Use a dedicated browser profile** (a new Chrome/Firefox profile, or at
  minimum log out of your personal accounts first) for all 5 signups. This
  matters most for Meta (Facebook/Instagram) — if you're logged into your
  personal Facebook in the same browser, it will actively suggest
  merging/linking the new Page to your personal profile.
- **Unique password per platform**, saved in your password manager under a
  "Foreground" folder — don't reuse personal-account passwords.
- **Phone number for OTP**: fine to reuse your own personal number. It
  only proves you're human during signup — it doesn't merge account
  identity or content with any personal profile on that platform.
- **LinkedIn and Meta both require an existing personal profile to
  administer the new Page/Company Page** — that's how those platforms
  work, not a leak of personal/business separation. The one setting that
  *would* make it publicly visible as connected to you is adding the Page
  to your personal LinkedIn profile's "Experience" section — skip that.

## Per-platform steps

### 1. X (Twitter)
1. **Done 2026-09-10, via a different method than originally planned:**
   raw email/username signup on X's web flow is currently hard-blocked —
   it walls you into "get the app to finish signing up," even in
   incognito, for any email/username entry. The one web path that still
   works is **OAuth signup** ("Continue with Google") — use it with
   `founder@foreground.info` logged in as the active Google account in
   that browser. Worth trying this OAuth-first approach on the remaining
   platforms too if raw email signup stalls the same way.
2. Convert to/create as a **Professional account** (Settings → Monetization
   → Professional account) — needed for analytics later.
3. **Handle actually used: `@foreground_info`** — both `@foreground` and
   X's random-suffix suggestions (`foregroundgire` etc.) were rejected;
   `@getforeground` (the tagline-based fallback) wasn't tried since
   `@foreground_info` was chosen directly. Use `@foreground_info` for
   consistency if any other platform's `@foreground`/`@getforeground` also
   turns out to be taken.
4. Profile photo: `icon-512.png`. Header image: `og-image.png` (X crops to
   1500×500).
5. Bio: short form ("Get in the foreground.") — X's bio field is 160
   characters, long form fits but leaves no room for anything else.
6. Website: `https://foreground.info`.
7. **First post and pinned post — drafted 2026-09-10, not yet posted.**
   Both deliberately say "Gemini and Claude," not "ChatGPT and Gemini" (the
   framing `index.html`'s meta description uses) — the hosted scan only
   queries those two providers today (see this file's closing note below),
   and naming ChatGPT here would overclaim what the product actually
   checks. Update this post if the 4-provider scan comes back.

   First post (231 chars):
   ```
   AI search doesn't link out — it just answers. Ask it "best plumber near me" and if your business isn't in that answer, a competitor got the mention instead of you.

   Built Foreground to check exactly that. Free scan:
   foreground.info
   ```

   Pinned post (217 chars):
   ```
   Foreground checks whether AI search — Gemini and Claude today — recommends your business, or a competitor, when someone asks a question in your category.

   Run a free scan. See exactly where you stand.

   foreground.info
   ```

   After posting the first one, pin it (or the second, your call) via
   the post's **···** menu → **Pin to your profile**.

### 2. LinkedIn (Company Page, not a personal profile)
1. From an existing personal LinkedIn account: **+ Create → Company Page**
   ([linkedin.com/company/setup/new](https://linkedin.com/company/setup/new)).
2. Page name: "Foreground". Public URL slug: `foreground` (fallback
   `getforeground`).
3. Logo: `icon-512.png`. Cover image: `og-image.png` (LinkedIn crops to
   1128×191).
4. Tagline field (120 char limit): long-form tagline fits — "Every AI
   answer has a foreground. Make sure you're in it."
5. About section: expand on the positioning statement in `brand/BRAND.md`
   ("For small and local businesses who have no idea whether ChatGPT and
   Gemini recommend them...").
6. Website: `https://foreground.info`.

### 3. Facebook Page
1. Create at [facebook.com/pages/create](https://facebook.com/pages/create)
   — Page, not personal profile or Group.
2. Page name: "Foreground". Category: "Software company" or "Internet
   marketing service".
3. Profile picture: `icon-512.png`. Cover photo: `og-image.png` (Facebook
   crops to 820×312 desktop).
4. Bio/description: long form tagline.
5. Website: `https://foreground.info`. Contact email (Page settings →
   General): `founder@foreground.info`.
6. This account will later link to Instagram via Meta Business Suite —
   worth creating this one first so Instagram setup (below) can attach to
   it directly.

### 4. Instagram (Business/Creator account)
1. Since Facebook Page exists first (step 3), create Instagram from inside
   **Meta Business Suite** so it's linked from day one — simpler than
   linking two separately-created accounts later.
2. Handle: `@getforeground` (`@foreground` is confirmed taken by an
   unrelated account).
3. Switch to a **Business account** (not Creator) during setup — Business
   accounts are what Buffer's API connects to.
4. Profile photo: `icon-512.png` (Instagram displays it circular — the
   square source crops fine).
5. Bio (150 char limit): short form ("Get in the foreground.") plus the
   website link field below it.
6. Website: `https://foreground.info`.

### 5. TikTok (Business account)
1. Sign up at tiktok.com with `founder@foreground.info`, then switch to a
   **Business account** (Settings →
   Account → Switch to Business Account) — required for analytics and for
   Buffer's API connection later.
2. Handle: `@foreground` (fallback `@getforeground`).
3. Profile photo: `icon-512.png`.
4. Bio (80 char limit): short form ("Get in the foreground.").
5. Website: `https://foreground.info` (TikTok may require the site to be
   claimed/verified via a meta tag or file upload before the link goes
   live in the bio — follow TikTok's own in-app prompt if it appears).

## After all 5 are created

1. Send Claude the 5 profile URLs — they get added to `index.html`'s
   JSON-LD `sameAs` array (closes the gap `TODO-MARKETING.md` documents).
2. Decide on Buffer (or an alternative scheduling tool) per the plan in
   `~/.claude/plans/okay-i-want-to-velvety-swing.md` — this needs your
   explicit sign-off on cost (~$5/channel/month) before signing up, since
   it's a recurring spend.
3. Connect all 5 accounts to Buffer via each platform's OAuth screen (also
   manual — OAuth consent has to be clicked by a logged-in human).
4. Add Buffer's MCP server to Claude Code so Claude can draft and schedule
   posts directly going forward.

## A note on content already in the repo

`content/articles/01-ai-is-the-new-front-page.md` through
`04-ai-visibility-checklist.md` are already written in LinkedIn/Substack/
X-thread/Facebook variants, but every one is marked "needs Marc's read
before posting" in its own frontmatter/notes — read and approve those
before they're the first thing that goes out on the new accounts.

One more thing to know before any post cites specifics: `voice.md`'s rule
4 says "four AI models... five prompts per scan, twenty checks" — that
described the local `proof-script` tool. The **hosted** product currently
runs on 2 providers, not 4 (cut 2026-09-04 for cost control, see root
`CLAUDE.md`'s Deployment section, "Free-only mode with cost control").
Don't let old copy drafted before that date overstate the hosted scan's
model count.
