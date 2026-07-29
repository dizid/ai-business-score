# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AIVis: a local, single-file Node.js script that checks whether a business shows
up when AI search engines (ChatGPT, Gemini) are asked about their category, and
formats the result as a cold-email hook. This is deliberately **not** a hosted
product — no server, no database, no accounts. It's a same-day proof-of-concept
run manually by one person against a hand-curated prospect list.

The full rationale (why this scope, what was rejected, what's deferred) lives in
the design doc at `~/.gstack/projects/ai-business-score/marc-none-no-git-repo-design-20260728-153615.md`
and its eng-review addendum. Read it before proposing scope changes — several
things that look like obvious improvements (hosting, a test suite, vertical
prompt templating) were deliberately deferred based on evidence gathered there.

## Commands

All commands run from `proof-script/`:

```bash
node index.mjs --dry-run                       # sanity-check the pipeline, no network calls, no cost
node index.mjs --prospects prospects.json       # the real run (needs PERPLEXITY_API_KEY in .env)
node index.mjs --prospects prospects.json --concurrency 4 --out results
node index.mjs --help
```

No build step, no lint config, no test framework — Node 18+ only (uses native
`fetch`). There is no `package.json`; the script has zero npm dependencies.
Formal automated tests were explicitly deferred (see eng-review in the design
doc) in favor of `--dry-run` as the pre-flight check — this is a same-day,
likely-single-use script, not shipped product code.

Setup: copy `proof-script/.env.example` to `proof-script/.env` and set
`PERPLEXITY_API_KEY`. Copy `proof-script/prospects.example.json` to
`prospects.json` and fill in real prospects (schema: brand, website,
competitors, category, use_case, region, customer_segment).

## Architecture

Everything lives in `proof-script/index.mjs`, top to bottom in execution order:

1. **CLI/env loading** — hand-rolled arg parser and `.env` loader (no deps).
2. **Prompt templates** (8, generic brand/competitor substitution only —
   vertical-specific templating was explicitly deferred, see `TODOS.md`) x
   **2 models** (`openai/gpt-5-mini`, `google/gemini-3-flash-preview`) = 16
   checks per prospect.
3. **Perplexity Agent API client** — calls `POST https://api.perplexity.ai/v1/responses`
   (the OpenAI-SDK-compatible alias for `/v1/agent`), routing both OpenAI- and
   Google-branded models through one Perplexity key via `provider/model-name`
   addressing. Response shape is the OpenAI Responses API shape
   (`output[].content[].text`) — `extractText()` is defensive about this since
   it was verified via live smoke test, not a documented guarantee.
4. **Fail-fast + retry** (`FailFastTracker`, `callWithRetry`) — one retry per
   call; if 3 consecutive calls fail across the whole run, the process aborts
   rather than burning through the remaining budget against a dead key/endpoint.
5. **Concurrency-limited runner** (`runWithConcurrency`) — small hand-rolled
   worker pool, no `p-limit` dependency.
6. **Detection** (`findBrandMention`, `findMentions`) — whole-word,
   case-insensitive regex match on the brand name and a domain-derived alias.
   Presence-only, not sentiment-aware (a negative mention still counts as
   "cited" — the output explicitly tells the human to skim raw responses
   before sending anything). Common-word brand names (e.g. "Best") are flagged
   ambiguous and skip auto-detection rather than false-matching everywhere.
7. **Aggregation** (`aggregateProspect`) — cited count, completed vs. failed
   call counts (tracked separately so a failed batch doesn't silently read as
   "zero citations"), and a heuristic first-mention-order ranking
   (ranked-1 / beaten / not-mentioned) — explicitly labeled as unverified
   since detection is presence-only.
8. **Output** (`formatInternalSummary`, `csvRow`) — one Markdown file per
   prospect in `results/` (precise numbers, raw responses, a *directional*
   email draft — deliberately not a precise re-verifiable number, since LLM
   responses vary between runs) plus one row per prospect appended to
   `tracking.csv` (sent-date/replied/note columns left blank for manual
   fill-in after sending).

`results/` and `tracking.csv` are gitignored — they're run output, not source.
