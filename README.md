# Foreground

Checks whether a business shows up when AI search engines (ChatGPT, Gemini,
via Perplexity's Agent API) are asked about their category, scores the
result, and tracks it over time.

Two separate tools live in this repo — this README covers both, with a
focus on how to click/run through them for manual testing (there's no
automated test suite, see "Why there's no test suite" below).

| | `proof-script/` | repo root (this app) |
|---|---|---|
| What | A local CLI you run yourself | A hosted, self-serve, multi-tenant web app |
| Who uses it | One person, hand-picked prospect list | Anyone who signs up |
| State | None — writes local files | Neon Postgres, per-user accounts |
| Deployed? | No — `node index.mjs` on your machine | Yes — `aivis-scan.netlify.app` |

If you just want to poke at the real app, skip to **"Testing the hosted
app"** below. If you're running outbound checks against a prospect list,
see `proof-script/OUTREACH.md`.

## Testing the hosted app

### Setup

```bash
npm install
npm run dev
```

Opens on `http://localhost:5173`. There's no `/` page — go straight to
`/app` (redirects to login/signup automatically). `@netlify/vite-plugin`
emulates Netlify Functions, and pulls env vars (`PERPLEXITY_API_KEY`,
`DATABASE_URL`, `NEON_AUTH_JWKS_URL`) from the linked Netlify site
automatically — this repo is already linked (see `.netlify/state.json`),
so no local `.env` file is needed. If you ever clone fresh and it's not
linked, run `netlify link` first (or ask whoever has access to the
`aivis-scan` Netlify site).

### Manual walkthrough (the de facto test plan)

There's no automated test suite, so this is the checklist to run through
after any change to `src/app/`, `netlify/functions/`, or `shared/aivis-core.mjs`:

1. **Sign up** — `/app/signup`, any real-looking email/password (min 8
   chars) works, no email verification step, you're logged in immediately.
2. **Add a company** — `+ New company` on `/app`. All 7 fields are
   required: brand, website, category, use case, region, customer
   segment, competitors (comma-separated, 2-3). Example: brand "Acme
   Plumbing", category "emergency plumber", competitors "Bob's Pipes,
   QuickFlow Plumbing". **Since 2026-08-12**: on submit, you're taken
   straight to the new company's detail page and its first scan starts
   automatically — you won't land back on the list.
3. **Watch the auto-triggered scan** (or click "Run new scan" on any
   existing company). **Since 2026-08-13, expect 5-8 minutes, not
   30-45 seconds** — it's making 20 real Perplexity calls (a 5-prompt slice
   × 4 models) fully sequentially (`CONCURRENCY_LIMIT = 1` — Perplexity's
   real per-key concurrency limit turned out to be ~1, confirmed via a live
   smoke test; anything higher silently dropped a large fraction of calls
   to HTTP 429) and polls every 2s. The status line will say "Queued…" then
   "Running checks (~5-8 min)…". A scan-complete notification (so you don't
   have to sit and watch this) is planned but not yet built.
4. **Check the result** — an **Overview tab** (since 2026-08-19) with the
   score ring, scoreboard (your brand vs. competitors), advice cards, a
   compact sentiment-classification summary (since 2026-08-20 — see point 5
   below), and the secondary "Harmonia" technical/SEO score (also since
   2026-08-19, its own 4-pillar breakdown — schema/JSON-LD, crawlability,
   Core Web Vitals, security headers — never blended into the main AI
   Visibility Score); and a **Details tab** with the check-by-check
   breakdown grouped by prompt (per-model raw text, expandable) inside
   collapsible sections, and — **since 2026-08-12** — a list of exactly
   which prompt/model failed and why, if any did, instead of just an
   aggregate count. **Some calls failing is normal, not a bug** — see
   "Known quirks" below.
5. **Sentiment classification** — **since 2026-08-20**, every check where
   your brand was actually mentioned gets auto-classified (recommended /
   neutral / negative / comparison-only) right after the scan finishes, no
   extra click needed — summarized on the Overview tab, with the full
   per-check badges on the Details tab. A manual "Judge sentiment" button
   (shipped 2026-08-15) still appears on any check the automatic pass
   didn't reach in time, or to re-judge one.
6. **Generate deep advice** — the "Generate deeper advice" button on a
   completed scan. This is a second, on-demand live Perplexity call
   (another 15-20s wait) — only trigger it a few times while testing, it
   roughly doubles the Perplexity spend for that scan. **Since 2026-08-24,
   Pro-gated**: a free-tier account sees a locked "Upgrade to Pro" CTA
   instead of the button (see `CLAUDE.md`'s Billing section).
7. **Run a second scan on the same company** — once you have 2+ scans,
   `CompanyProgressChart.vue` renders a score-over-time line on the
   company detail page. With only 1 scan, no chart shows (by design — a
   single point isn't a trend).
8. **Log out / log back in** — confirm the session round-trips and you
   land back on `/app`, not stuck on a blank page.
9. **Check the footer** — every `/app/*` page (added 2026-08-12) has a
   footer linking to `/app/privacy`, `/app/terms`, `/app/how-it-works`, and
   Dizid's site. Click through all three — they're real static content,
   not placeholders.
10. **Legacy link check (optional)** — `result.html#d=<encoded>` still
   renders old pre-2026-08-03 shareable links client-side, no login, no
   API call. There's no way to generate a *new* one of these anymore
   (see `CLAUDE.md` if you're wondering why) — this step just confirms
   old links weren't broken by later changes.
11. **Confirm removed features stay removed** — `/app/leaderboard` should
    resolve to nothing (deleted 2026-08-12); a company's detail page should
    show no "+ Add URL" / multi-URL chip selector and no public-leaderboard
    toggle (also removed 2026-08-12).

### Known quirks (expected, not bugs)

- **Some individual scan calls time out or fail.** Real-world Perplexity
  `web_search` latency, not a bug — the result page lists exactly which
  prompt/model failed and why (since 2026-08-12) instead of hiding it
  behind an aggregate count. A scan with most of the 20 calls succeeding
  is normal; occasional failures don't invalidate the score.
- **Scans take 5-8 minutes, not under a minute** (since 2026-08-13). This
  is a deliberate reliability tradeoff, not a regression to "fix" by
  raising concurrency back up — see `shared/CLAUDE.md`'s "Update 2026-08-13"
  note (moved there from root `CLAUDE.md` on 2026-08-20 via `/doctor`).
- **Score shows "unavailable", never a fake 0**, if every call in a scan
  failed. A 0 always means "genuinely invisible," never "the API broke."
- **Brand names that are actual common words** (e.g. "Best", "Pro") get
  flagged ambiguous and skip auto-detection rather than false-matching
  everywhere in the raw responses. **Fixed 2026-08-12**: this used to also
  (incorrectly) trigger for any single-word brand of 4 characters or
  fewer regardless of whether it was a real common word — short real
  brands (ASML, TSMC, NRC, IBM, SAP) were getting a false `0/100` because
  of this. No longer does; see `CLAUDE.md`'s Detection section.
- Throwaway test accounts already exist in the database
  (`milestone2-test@example.com`, `milestone4-test-23215@example.com`,
  `aivis-qa-test-20260811@dizid.com`) from building/verifying this app —
  ignore them, sign up with your own email.

### Why there's no test suite

Deliberately deferred from day one (see `CLAUDE.md`) — `--dry-run` covers
`proof-script/`'s pipeline with zero network calls, and the hosted app
relies on `npm run type-check` (`vue-tsc`, covers `netlify/functions/**`
too) plus this manual walkthrough. Revisit if a regression slips through
that the walkthrough should have caught.

## Testing `proof-script/`

```bash
cd proof-script
cp .env.example .env        # fill in PERPLEXITY_API_KEY
cp prospects.example.json prospects.json   # fill in real prospects
node index.mjs --dry-run    # sanity check — no network calls, no cost
node index.mjs --prospects prospects.json  # the real run
```

`--dry-run` is the standing regression check — re-run it after touching
`shared/aivis-core.mjs`, regardless of which consumer motivated the
change, since both `proof-script` and the hosted app import the same
file. Real runs write one Markdown file per prospect to `results/` and
append a row to `tracking.csv` (both gitignored — run output, not source).

## Further reading

- **`CLAUDE.md`** — full architecture, database schema, why decisions
  were made the way they were. The authoritative technical reference.
- **`PLAN_NEXT_PHASE.md`** — the active roadmap (correctness fixes,
  scope cuts, model coverage, monetization), what's shipped vs. deferred,
  and why.
- **`DASHBOARD.md`** — plain-English explanation of the score formula and
  what the scoreboard/advice cards mean.
- **`TODOS.md`** — project history and current status.
- **`WISH_LIST.md`** — deferred ideas not yet promoted to `TODOS.md`.
- **`proof-script/OUTREACH.md`** — the cold-outreach playbook for using
  `proof-script` against a real prospect list.
