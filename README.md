# AIVis

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
   QuickFlow Plumbing".
3. **Run a scan** — click "Run new scan" on the company's detail page.
   Expect **20-30 seconds** — it's making 6 real parallel Perplexity calls
   (3 prompts x 2 models) and polls every 2s. The status line will say
   "Queued…" then "Running checks (~20-30s)…".
4. **Check the result** — score ring, scoreboard (your brand vs.
   competitors), 1-3 advice cards, raw responses in a collapsible
   `<details>`. **A banner saying some calls failed is normal, not a
   bug** — see "Known quirks" below.
5. **Generate deep advice** — the "Generate deeper advice" button on a
   completed scan. This is a second, on-demand live Perplexity call
   (another 15-20s wait) — only trigger it a few times while testing, it
   roughly doubles the Perplexity spend for that scan.
6. **Run a second scan on the same company** — once you have 2+ scans,
   `CompanyProgressChart.vue` renders a score-over-time line on the
   company detail page. With only 1 scan, no chart shows (by design — a
   single point isn't a trend).
7. **Log out / log back in** — confirm the session round-trips and you
   land back on `/app`, not stuck on a blank page.
8. **Legacy link check (optional)** — `result.html#d=<encoded>` still
   renders old pre-2026-08-03 shareable links client-side, no login, no
   API call. There's no way to generate a *new* one of these anymore
   (see `CLAUDE.md` if you're wondering why) — this step just confirms
   old links weren't broken by later changes.

### Known quirks (expected, not bugs)

- **~50% of individual scan calls time out or fail.** Real-world
  Perplexity `web_search` latency, not a bug — the result page shows
  "N calls failed" honestly instead of hiding it. A scan with 3-4 of 6
  calls succeeding is normal.
- **Score shows "unavailable", never a fake 0**, if every call in a scan
  failed. A 0 always means "genuinely invisible," never "the API broke."
- **Brand names that are common words** (e.g. "Best") get flagged
  ambiguous and skip auto-detection rather than false-matching everywhere
  in the raw responses.
- **`enrich.mts` (URL auto-fill) isn't wired into "+ New company" yet** —
  the endpoint works and is auth-gated, but the form is manual-entry only
  for now. Not a bug, just not connected.
- Two throwaway test accounts already exist in the database
  (`milestone2-test@example.com`, `milestone4-test-23215@example.com`)
  from building this app — ignore them, sign up with your own email.

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
- **`DASHBOARD.md`** — plain-English explanation of the score formula and
  what the scoreboard/advice cards mean.
- **`TODOS.md`** — project history and current status.
- **`proof-script/OUTREACH.md`** — the cold-outreach playbook for using
  `proof-script` against a real prospect list.
