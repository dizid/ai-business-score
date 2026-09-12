// Deep advice (on-demand, live LLM call) — split out of aivis-core.mjs
// (2026-09-12 architecture refactor). Milestone 6 of the SaaS-pivot plan:
// unlike advice.mjs's selectAdvice, this DOES make a live grounded
// Perplexity call — safe to add specifically because scans are async
// (Milestone 5), so there's no synchronous function-timeout budget left to
// blow. Deliberately on-demand (a button on the completed-scan view, not
// automatic) rather than run for every scan: it roughly doubles Perplexity
// spend per scan, and pricing/plan limits aren't finalized yet — the CEO's
// call, not a default to bake in silently.

import { PROMPT_LABELS } from './prompts.mjs';
import { findCompetitorExcerpts } from './advice.mjs';

// Groups perPromptRank (one entry per completed model call, keyed by which
// of the 3 templates produced it) into a per-template breakdown, so
// buildDeepAdvicePrompt can ground steps in specifics like "you're missing
// from the comparison-style query" instead of only aggregate counts.
function summarizePerPromptRank(perPromptRank) {
  const byPrompt = new Map();
  for (const r of perPromptRank || []) {
    if (!byPrompt.has(r.promptIndex)) {
      byPrompt.set(r.promptIndex, {
        'ranked-1': 0,
        'ranked-2': 0,
        'ranked-3': 0,
        mentioned: 0,
        'not-mentioned': 0,
      });
    }
    const counts = byPrompt.get(r.promptIndex);
    if (counts[r.rank] !== undefined) {
      counts[r.rank]++;
    }
  }
  return [...byPrompt.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([promptIndex, counts]) => {
      const total = Object.values(counts).reduce((s, v) => s + v, 0);
      const label = PROMPT_LABELS[promptIndex] || `prompt ${promptIndex}`;

      const parts = [];
      if (counts['ranked-1'] > 0) parts.push(`ranked first in ${counts['ranked-1']}`);
      if (counts['ranked-2'] > 0) parts.push(`ranked 2nd in ${counts['ranked-2']}`);
      if (counts['ranked-3'] > 0) parts.push(`ranked 3rd in ${counts['ranked-3']}`);
      const otherMentions = counts.mentioned;
      if (otherMentions > 0) parts.push(`mentioned (but not top 3) in ${otherMentions}`);
      if (counts['not-mentioned'] > 0) parts.push(`not mentioned in ${counts['not-mentioned']}`);

      if (parts.length === 0) {
        return `- ${label}: no data (of ${total} checks)`;
      }
      return `- ${label}: ${parts.join(', ')} (of ${total} checks)`;
    })
    .join('\n');
}

// ---------- Deep advice excerpt selection ----------
// Grounds buildDeepAdvicePrompt in what competitors are ACTUALLY cited for,
// not just tallies/ranks — the difference between "Rival Co beat you 4x" and
// "Rival Co beat you 4x, and here's the actual sentence citing them for
// same-day delivery." toScanPayload() already carries the full rawResponses
// array into this prompt builder's input; this was the only piece not yet
// reading it. No new LLM call, no new data collection — pure re-derivation
// of data the scan already produced, so it carries none of the cost/latency
// risk that automatic (non-on-demand) additions to this file have a real
// documented incident history around.
const MAX_DEEP_ADVICE_EXCERPTS = 4;
const TOP_COMPETITORS_FOR_EXCERPTS = 2;

function selectDeepAdviceExcerpts(scan) {
  const topCompetitors = [...(scan.competitorTallies || [])]
    .filter((c) => !c.ambiguous)
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .slice(0, TOP_COMPETITORS_FOR_EXCERPTS);
  if (topCompetitors.length === 0) return [];

  const lines = [];
  for (const competitor of topCompetitors) {
    if (lines.length >= MAX_DEEP_ADVICE_EXCERPTS) break;
    const remaining = MAX_DEEP_ADVICE_EXCERPTS - lines.length;
    for (const { promptLabel, snippet } of findCompetitorExcerpts(scan, competitor.name, remaining)) {
      lines.push(`- [${competitor.name}, ${promptLabel}]: "...${snippet}..."`);
    }
  }
  return lines;
}

export function buildDeepAdvicePrompt(scan) {
  const competitorLines = (scan.competitorTallies || [])
    .map((c) => `- ${c.name}: mentioned in ${c.mentionCount}/${scan.completedCalls} checks, beat ${scan.brand} in ${c.beatBrandCount}`)
    .join('\n');
  const perPromptLines = summarizePerPromptRank(scan.perPromptRank);
  const excerptLines = selectDeepAdviceExcerpts(scan).join('\n');
  // Clarity check (added 2026-09-04, see clarityCheck.mjs) — whether the
  // business's own homepage states a specific, quotable claim. Purely
  // extra context for THIS advisory prompt, never fed into the scan's own
  // unprompted-visibility questions.
  const clarityLine = scan.clarityCheck
    ? scan.clarityCheck.hasSpecificClaim
      ? `\nHomepage clarity check: found a specific, quotable claim on the homepage ("${scan.clarityCheck.quote}") — build on this rather than suggesting the brand add specifics from scratch.\n`
      : `\nHomepage clarity check: the homepage does NOT currently state a specific, quotable claim (no named service, credential, number, or differentiator found — likely only generic marketing language). This is very likely worth a step of its own.\n`
    : '';

  return `You are a world-class SEO and AI-search-visibility strategist. A brand called "${scan.brand}" (${scan.website}, category: "${scan.category}") was just checked for how often it comes up when AI assistants (ChatGPT, Gemini) are asked about their category.

Results: cited in ${scan.citedCount ?? 0} of ${scan.completedCalls ?? 0} completed checks, visibility score ${scan.score ?? 'unavailable'}/100.
Competitor tallies:
${competitorLines || '(no named competitors)'}

Breakdown by query type:
${perPromptLines || '(no per-query data)'}
${excerptLines ? `\nActual excerpts where a competitor was cited and ${scan.brand} wasn't ranked first — use these to identify concrete content/topic gaps, not just aggregate counts:\n${excerptLines}\n` : ''}${clarityLine}
Based on this, respond with ONLY a JSON object (no markdown fences, no commentary before or after) with this shape:
{
  "steps": [
    { "title": "short actionable step", "reasoning": "1-2 sentences on why this helps AI search visibility specifically", "difficulty": "Easy" | "Medium" | "Hard" }
  ]
}
Provide up to 5 steps, ordered by highest-leverage first. Ground each step in the actual data above — reference specific competitors, the citation rate, which query type(s) from the breakdown the brand is weak in, and any concrete topics/attributes from the excerpts above that the brand doesn't own — rather than generic SEO advice.`;
}

// Same lenient-extraction, always-safe-shape pattern as
// enrichment.mjs's parseEnrichmentResponse — a malformed or unparseable
// response degrades to an empty steps list rather than throwing, since deep
// advice is a bonus on top of the rule-based advice that's already showing.
export function parseDeepAdviceResponse(text) {
  const empty = { steps: [] };
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return empty;
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.steps)) return empty;
    const validDifficulties = new Set(['Easy', 'Medium', 'Hard']);
    return {
      steps: parsed.steps
        .filter((s) => s && typeof s.title === 'string' && s.title.trim())
        .slice(0, 5)
        .map((s) => ({
          title: s.title.trim().slice(0, 200),
          reasoning: typeof s.reasoning === 'string' ? s.reasoning.trim().slice(0, 500) : '',
          difficulty: validDifficulties.has(s.difficulty) ? s.difficulty : 'Medium',
        })),
    };
  } catch {
    return empty;
  }
}
