// Clarity check (live LLM call) — split out of aivis-core.mjs (2026-09-12
// architecture refactor). Added 2026-09-04, replacing a "vertical prompt
// packs" ask once querying real companies.category data found no real
// vertical clustering to build from (mostly test/dev records). The blog
// content itself (content/blog/) argues the actual lever determining
// whether AI models mention a business is whether the business states
// something specific and quotable on its own site, versus generic filler
// ("quality service you can trust") — this turns that claim into an actual
// checked signal instead of just an essay. Deliberately does NOT feed
// anything back into the scan's own prompts (prompts.mjs's PROMPT_TEMPLATES)
// — doing that would turn an honest unprompted-visibility test into a
// leading question, which was the real problem with the original "inject a
// differentiator into the scan queries" idea this replaced. This only
// evaluates the business's own homepage text (shared/harmonia.mjs already
// fetches it — see its homepageText field), same "read what's already
// there" spirit as deepAdvice.mjs's excerpt selection.
//
// Runs through the same callModel() every other call in this codebase uses
// — there's no "ungrounded" (no web-search-tool) call path anywhere in this
// codebase to reuse (every provider branch in client.mjs's callModel always
// attaches a web-search tool), so this pays for that capability the same
// way sentimentJudge.mjs already does for its own classify-given-text task,
// rather than building a new call shape for one feature.
import { truncate } from '../textUtils.mjs';

export function buildClarityCheckPrompt(brand, homepageText) {
  return `You are evaluating whether a business's own homepage states something specific and quotable about what it does, versus only generic marketing filler. The business is "${brand}". Here is text extracted from their homepage:
"""
${homepageText}
"""
A "specific, quotable claim" is a concrete fact a person (or an AI model) could repeat: a named service, a credential or certification, years in business, a response-time commitment, a specific customer type, an award, a number — anything factual and distinct to this business. Generic filler ("quality service you can trust," "committed to excellence," "your one-stop shop") does NOT count, even if confidently worded.
Respond with ONLY a JSON object (no markdown fences, no commentary before or after):
{
  "hasSpecificClaim": true | false,
  "quote": "the exact specific sentence or phrase found, or null if none",
  "reasoning": "one sentence explaining the classification"
}
If the homepage text is empty or clearly not real content (e.g. a loading placeholder), respond with "hasSpecificClaim": false and say so in "reasoning".`;
}

// Same lenient-extraction, always-safe-shape pattern as
// sentimentJudge.mjs's parseSentimentJudgeResponse/deepAdvice.mjs's
// parseDeepAdviceResponse — a malformed or unparseable response degrades to
// "no specific claim found" rather than throwing, since this is a
// secondary signal, not something the scan's primary score depends on.
export function parseClarityCheckResponse(text) {
  const empty = { hasSpecificClaim: false, quote: null, reasoning: '' };
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return empty;
  try {
    const parsed = JSON.parse(match[0]);
    const hasSpecificClaim = parsed.hasSpecificClaim === true;
    const quote = hasSpecificClaim && typeof parsed.quote === 'string' && parsed.quote.trim()
      ? truncate(parsed.quote.trim(), 300)
      : null;
    const reasoning = typeof parsed.reasoning === 'string' ? truncate(parsed.reasoning.trim(), 300) : '';
    return { hasSpecificClaim, quote, reasoning };
  } catch {
    return empty;
  }
}
