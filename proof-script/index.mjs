#!/usr/bin/env node
// AIVis manual proof script — Approach A from the office-hours design doc:
// ~/.gstack/projects/ai-business-score/marc-none-no-git-repo-design-20260728-153615.md
//
// Usage:
//   node index.mjs --dry-run                          (run this first, free, no network)
//   node index.mjs --prospects prospects.json          (the real run)

import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- CLI args ----------
function parseArgs(argv) {
  const args = { prospects: 'prospects.json', dryRun: false, concurrency: 4, out: 'results' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--prospects') args.prospects = argv[++i];
    else if (a.startsWith('--prospects=')) args.prospects = a.split('=')[1];
    else if (a === '--concurrency') args.concurrency = Number(argv[++i]);
    else if (a.startsWith('--concurrency=')) args.concurrency = Number(a.split('=')[1]);
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
  }
  return args;
}

function printHelp() {
  console.log(`
AIVis manual proof script

Usage:
  node index.mjs --dry-run
  node index.mjs --prospects prospects.json [--concurrency 4] [--out results]

Flags:
  --prospects <path>    Path to prospect list JSON (default: prospects.json)
  --dry-run             Run the full pipeline against 1 fake prospect with mocked
                         API responses. No real API calls, no cost. Run this first.
  --concurrency <n>     Max concurrent API calls in flight (default: 4)
  --out <dir>           Directory for per-prospect result files (default: results)

Setup:
  1. Copy .env.example to .env and set PERPLEXITY_API_KEY
  2. Copy prospects.example.json to prospects.json and fill in real prospects
  3. Run with --dry-run first to sanity-check the pipeline (free, no network calls)
  4. Run for real: node index.mjs --prospects prospects.json

Before sending any email: read the raw responses in the per-prospect result file
and do a manual sentiment/accuracy skim. Detection here is presence-only, not
sentiment-aware — do not paste unreviewed claims into a cold email. Use the
directional email draft in each result file, not a precise re-verifiable number
(AI responses vary between runs).
`);
}

// ---------- .env loader (no dependency) ----------
function loadEnv(envPath) {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

// ---------- Prompts (8, generic — brand/competitor substitution only) ----------
// Vertical-adjusted templating explicitly deferred, see TODOS.md.
const PROMPT_TEMPLATES = [
  (p) => `What's the best ${p.category} for ${p.use_case}?`,
  (p) => `Compare ${p.brand} vs ${p.competitors[0]} vs ${p.competitors[1] ?? p.competitors[0]}.`,
  (p) => `I need a ${p.category} — what do you recommend and why?`,
  (p) => `Top ${p.category} companies in ${p.region}?`,
  (p) => `Is ${p.brand} a good choice for ${p.use_case}? What are the alternatives?`,
  (p) => `What are people saying about ${p.brand} vs ${p.competitors[0]}?`,
  (p) => `Best ${p.category} for ${p.customer_segment}?`,
  (p) => `Who are the leaders in ${p.category}?`,
];

// ---------- Models (2, cheap tier, per office-hours cost model) ----------
const MODELS = ['openai/gpt-5-mini', 'google/gemini-3-flash-preview'];

// ---------- Common-word stoplist for brand-name ambiguity flag ----------
// Design doc: "common-word or ambiguous brand names (e.g. a brand literally
// called 'Best' or 'Prime') get flagged for skip-auto-detection and a manual
// read instead" — a naive string match on a name like "Best" would match
// nearly every response regardless of whether the brand was actually meant.
const COMMON_WORD_STOPLIST = new Set([
  'best', 'prime', 'top', 'first', 'plus', 'pro', 'go', 'now', 'here',
  'home', 'local', 'quick', 'fast', 'easy', 'simple', 'smart', 'the',
  'one', 'you', 'we', 'us', 'it', 'new', 'good', 'great', 'super',
]);

function isAmbiguousBrandName(name) {
  const words = name.trim().toLowerCase().split(/\s+/);
  return words.length === 1 && (words[0].length <= 4 || COMMON_WORD_STOPLIST.has(words[0]));
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Accepts either a bare domain ("acme.com") or a full URL
// ("https://acme.com/path") and normalizes to a full clickable URL.
function normalizeUrl(input) {
  const trimmed = input.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// Full URL or bare domain -> bare hostname, no protocol/www/path.
// "https://www.acmeplumbing.example.com/path" -> "acmeplumbing.example.com"
function hostnameOf(input) {
  const url = normalizeUrl(input);
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return input.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
  }
}

// "acmeplumbing.example.com" -> "acmeplumbing"
function domainAlias(website) {
  return hostnameOf(website).split('.')[0];
}

function findMentions(text, name) {
  if (isAmbiguousBrandName(name)) {
    return { ambiguous: true, mentioned: null, firstIndex: -1 };
  }
  const pattern = new RegExp(`\\b${escapeRegex(name)}\\b`, 'i');
  const match = text.match(pattern);
  return { ambiguous: false, mentioned: !!match, firstIndex: match ? match.index : -1 };
}

// Brand match with a fallback: if the brand name itself is too ambiguous to
// auto-detect (e.g. "Best"), try the domain-derived alias instead, which is
// far less likely to collide with common English words.
function findBrandMention(text, prospect) {
  const primary = findMentions(text, prospect.brand);
  if (!primary.ambiguous) return primary;
  const alias = domainAlias(prospect.website);
  const aliasMatch = findMentions(text, alias);
  if (!aliasMatch.ambiguous) return aliasMatch;
  return primary; // both ambiguous — genuinely needs manual read
}

// ---------- Perplexity Agent API client ----------
// Endpoint + provider/model-name addressing verified against live docs
// (docs.perplexity.ai/docs/agent-api) during /plan-eng-review, 2026-07-28.
// Uses the /v1/responses OpenAI-SDK-compatible alias since the request/
// response shape is the documented OpenAI Responses API shape.
const PPLX_URL = 'https://api.perplexity.ai/v1/responses';

async function callModel(apiKey, model, prompt) {
  const res = await fetch(PPLX_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: prompt,
      tools: [{ type: 'web_search' }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} from ${model}: ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  return { text: extractText(json), usage: json.usage ?? null };
}

// Defensive extraction: the exact response shape wasn't verified with a live
// call (docs only), so try the documented OpenAI-Responses-API shape first,
// then chat-completions-style as a fallback, then fail loudly rather than
// silently returning garbage into a cold email.
function extractText(json) {
  if (typeof json.output_text === 'string') return json.output_text;
  if (Array.isArray(json.output)) {
    const chunks = [];
    for (const item of json.output) {
      if (Array.isArray(item.content)) {
        for (const c of item.content) {
          if (typeof c.text === 'string') chunks.push(c.text);
        }
      }
    }
    if (chunks.length) return chunks.join('\n');
  }
  if (json.choices?.[0]?.message?.content) return json.choices[0].message.content;
  throw new Error(`Could not extract text from response — unexpected shape: ${JSON.stringify(json).slice(0, 300)}`);
}

// ---------- Fail-fast + retry ----------
// Abort the whole run if the first 3 consecutive calls fail — signals a dead
// endpoint or expired key, not per-call flakiness. Resets on any success so
// isolated flakiness later in the run doesn't trip it.
class FailFastTracker {
  constructor(threshold = 3) {
    this.threshold = threshold;
    this.consecutiveFailures = 0;
  }
  recordSuccess() { this.consecutiveFailures = 0; }
  recordFailure() {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.threshold) {
      throw new Error(
        `FAIL-FAST: ${this.threshold} consecutive API calls failed. ` +
        `Likely a dead endpoint or expired/invalid PERPLEXITY_API_KEY, not per-call flakiness. ` +
        `Aborting before burning through the remaining budget. Check .env and try --dry-run.`
      );
    }
  }
}

async function callWithRetry(apiKey, model, prompt, failFast) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await callModel(apiKey, model, prompt);
      failFast.recordSuccess();
      return { ok: true, ...result };
    } catch (err) {
      if (attempt === 1) {
        failFast.recordFailure();
        return { ok: false, error: err.message };
      }
      // one retry, no backoff needed at this volume
    }
  }
}

// ---------- Concurrency-limited runner (no dependency) ----------
async function runWithConcurrency(tasks, limit, worker) {
  const results = new Array(tasks.length);
  let next = 0;
  async function runner() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await worker(tasks[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, runner));
  return results;
}

// ---------- Mock response for --dry-run ----------
function mockCall(prompt, prospect) {
  const mentionsBrand = Math.random() > 0.4;
  const mentionsCompetitor = Math.random() > 0.3;
  const text = [
    mentionsBrand ? `${prospect.brand} is a solid option for this.` : '',
    mentionsCompetitor ? `${prospect.competitors[0]} is also frequently recommended.` : '',
    'Other factors to consider include price and availability.',
  ].filter(Boolean).join(' ');
  return { text, usage: { total_tokens: 850 } };
}

// ---------- Aggregation ----------
function aggregateProspect(prospect, callResults) {
  const completed = callResults.filter((r) => r.ok);
  const failed = callResults.filter((r) => !r.ok);

  let citedCount = 0;
  let ambiguousBrandFlag = false;
  const perPromptRank = [];

  for (const r of completed) {
    const brandMatch = findBrandMention(r.text, prospect);
    if (brandMatch.ambiguous) ambiguousBrandFlag = true;
    const cited = brandMatch.ambiguous ? false : brandMatch.mentioned;
    if (cited) citedCount++;

    // Heuristic-only ranking: first-mention order between brand and
    // competitors. Detection is presence-only (not sentiment-aware) per the
    // design doc's explicit limitation — this is a starting point for the
    // mandatory manual skim, not a verified rank.
    let rank = 'not-mentioned';
    if (cited) {
      const competitorMatches = prospect.competitors
        .map((c) => findMentions(r.text, c))
        .filter((m) => !m.ambiguous && m.mentioned);
      const beatenBy = competitorMatches.find((m) => m.firstIndex < brandMatch.firstIndex);
      rank = beatenBy ? 'beaten' : 'ranked-1';
    }
    perPromptRank.push({ promptIndex: r.promptIndex, rank });
  }

  return {
    prospect,
    totalCalls: callResults.length,
    completedCalls: completed.length,
    failedCalls: failed.length,
    citedCount,
    ambiguousBrandFlag,
    perPromptRank,
    rawResponses: completed.map((r) => ({ model: r.model, promptIndex: r.promptIndex, text: r.text })),
    totalTokens: completed.reduce((sum, r) => sum + (r.usage?.total_tokens ?? 0), 0),
  };
}

// ---------- Output formatting ----------
function formatInternalSummary(agg) {
  const { prospect, completedCalls, totalCalls, failedCalls, citedCount, ambiguousBrandFlag } = agg;
  const url = normalizeUrl(prospect.website);
  const lines = [];
  lines.push(`# ${prospect.brand}`);
  lines.push(`Website: ${url}`);
  lines.push('');
  lines.push(`Cited in ${citedCount}/${completedCalls} completed checks (${failedCalls} of ${totalCalls} calls failed).`);
  if (ambiguousBrandFlag) {
    lines.push('');
    lines.push('WARNING: brand name is a common word — auto-detection was skipped for some checks. Manual read required.');
  }
  lines.push('');
  lines.push('## Breakdown (heuristic — first-mention order, not sentiment-aware; verify by reading raw responses below)');
  const rank1 = agg.perPromptRank.filter((r) => r.rank === 'ranked-1');
  const beaten = agg.perPromptRank.filter((r) => r.rank === 'beaten');
  const notMentioned = agg.perPromptRank.filter((r) => r.rank === 'not-mentioned');
  lines.push(`- Ranked #1 in ${rank1.length} check(s): prompts ${rank1.map((r) => r.promptIndex + 1).join(', ') || '—'}`);
  lines.push(`- Beaten by a competitor in ${beaten.length} check(s): prompts ${beaten.map((r) => r.promptIndex + 1).join(', ') || '—'}`);
  lines.push(`- Not mentioned in ${notMentioned.length} check(s): prompts ${notMentioned.map((r) => r.promptIndex + 1).join(', ') || '—'}`);
  lines.push('');
  lines.push(`Estimated tokens used: ${agg.totalTokens}`);
  lines.push('');
  lines.push('## MANUAL SENTIMENT SKIM REQUIRED (budget ~1 min) — do not skip');
  lines.push('Detection above is presence-only, not sentiment-aware. A negative or');
  lines.push('comparative mention ("X is worse than Y") still counts as "cited." Read the');
  lines.push('raw responses below before sending anything.');
  lines.push('');
  lines.push('## Directional email draft');
  lines.push('(Do not use a precise re-verifiable number — AI responses vary between runs.)');
  lines.push('');
  if (citedCount === 0) {
    lines.push(`> In our check, ${prospect.brand} wasn't showing up when people ask AI search about ${prospect.category}.`);
  } else if (rank1.length > 0) {
    lines.push(`> ${prospect.brand} is already showing up in AI search results for ${prospect.category} — worth making sure that holds as competitors catch on.`);
  } else {
    lines.push(`> In our check, ${prospect.brand} was getting outranked by competitors when people ask AI search about ${prospect.category}.`);
  }
  lines.push('');
  lines.push('## Raw responses (for manual skim)');
  for (const r of agg.rawResponses) {
    lines.push('');
    lines.push(`### Prompt ${r.promptIndex + 1} — ${r.model}`);
    lines.push(r.text);
  }
  return lines.join('\n');
}

function csvRow(agg) {
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return [
    esc(agg.prospect.brand),
    esc(normalizeUrl(agg.prospect.website)),
    agg.citedCount,
    agg.completedCalls,
    agg.failedCalls,
    '', // sent date — fill in manually
    '', // replied Y/N — fill in manually
    '', // note — fill in manually
  ].join(',') + '\n';
}

// ---------- Main ----------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv(path.join(__dirname, '.env'));

  if (!args.dryRun && !process.env.PERPLEXITY_API_KEY) {
    console.error('PERPLEXITY_API_KEY not set. Copy .env.example to .env and fill it in, or use --dry-run.');
    process.exit(1);
  }

  let prospects;
  if (args.dryRun) {
    prospects = [{
      brand: 'Example Co',
      website: 'https://example.com',
      competitors: ['Rival Inc', 'OtherBrand'],
      category: 'widget supplier',
      use_case: 'bulk widget orders',
      region: 'a test region',
      customer_segment: 'test customers',
    }];
    console.log('DRY RUN — using 1 fake prospect, mocked API responses, no network calls, no cost.\n');
  } else {
    const prospectsPath = path.isAbsolute(args.prospects) ? args.prospects : path.join(process.cwd(), args.prospects);
    if (!existsSync(prospectsPath)) {
      console.error(`Prospects file not found: ${prospectsPath}\nCopy prospects.example.json to prospects.json and fill in real prospects.`);
      process.exit(1);
    }
    prospects = JSON.parse(readFileSync(prospectsPath, 'utf8'));
  }

  for (const [i, p] of prospects.entries()) {
    const missing = ['brand', 'website', 'competitors', 'category', 'use_case', 'region', 'customer_segment']
      .filter((field) => !p[field] || (Array.isArray(p[field]) && p[field].length === 0));
    if (missing.length) {
      console.error(`Prospect ${i} (${p.brand ?? 'unnamed'}) is missing: ${missing.join(', ')}. Fix the prospects file and re-run.`);
      process.exit(1);
    }
  }

  const outDir = path.isAbsolute(args.out) ? args.out : path.join(process.cwd(), args.out);
  mkdirSync(outDir, { recursive: true });
  const csvPath = path.join(process.cwd(), 'tracking.csv');
  if (!existsSync(csvPath)) {
    writeFileSync(csvPath, 'brand,website,cited_count,completed_calls,failed_calls,sent_date,replied,note\n');
  }

  const failFast = new FailFastTracker(3);
  let totalTokens = 0;

  for (const prospect of prospects) {
    const tasks = [];
    for (const [promptIndex, template] of PROMPT_TEMPLATES.entries()) {
      const prompt = template(prospect);
      for (const model of MODELS) {
        tasks.push({ prompt, model, promptIndex });
      }
    }

    console.log(`Running ${tasks.length} checks for ${prospect.brand}...`);

    const callResults = await runWithConcurrency(tasks, args.concurrency, async (task) => {
      if (args.dryRun) {
        const { text, usage } = mockCall(task.prompt, prospect);
        return { ok: true, text, usage, model: task.model, promptIndex: task.promptIndex };
      }
      const result = await callWithRetry(process.env.PERPLEXITY_API_KEY, task.model, task.prompt, failFast);
      return { ...result, model: task.model, promptIndex: task.promptIndex };
    });

    const agg = aggregateProspect(prospect, callResults);
    totalTokens += agg.totalTokens;

    const summary = formatInternalSummary(agg);
    const slug = hostnameOf(prospect.website).replace(/[^a-z0-9]/gi, '-').toLowerCase();
    writeFileSync(path.join(outDir, `${slug}.md`), summary);
    appendFileSync(csvPath, csvRow(agg));

    console.log(`  -> ${agg.citedCount}/${agg.completedCalls} cited (${agg.failedCalls} failed). Written to ${outDir}/${slug}.md`);
  }

  console.log(`\nDone. ${prospects.length} prospect(s) processed. ~${totalTokens} tokens used.`);
  console.log(`Results: ${outDir}/   Tracking sheet: ${csvPath}`);
  console.log('\nBefore sending anything: read each result file and do the manual sentiment skim.');
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
