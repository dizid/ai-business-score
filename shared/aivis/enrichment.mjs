// Enrichment (auto-fill prospect fields from a URL) — split out of
// aivis-core.mjs (2026-09-12 architecture refactor). One Perplexity
// web_search call that researches a site and guesses the rest of the scan
// form's fields, so the founder can start from a single URL instead of
// typing seven fields by hand. Best-effort by design: every field comes
// back empty rather than guessed wildly when the model isn't confident,
// since a wrong guess the user doesn't notice is worse than an empty box
// they have to fill in themselves (auto-fill must stay optional and
// editable, never authoritative).

import { SUPPORTED_LANGUAGES } from './prompts.mjs';

export function buildEnrichPrompt(website) {
  return `Research the company at ${website}. Based on their website and anything else you can find about them online, respond with ONLY a JSON object (no markdown fences, no commentary before or after) with these fields:
{
  "brand": "the company's brand/business name",
  "category": "the general category a customer would search for, e.g. 'emergency plumber' or 'project management software'",
  "use_case": "a concrete scenario someone in this category is trying to solve, e.g. 'a burst pipe at home'",
  "region": "the city, country, or market they primarily serve",
  "customer_segment": "who typically buys from them, e.g. 'homeowners' or 'small marketing teams'",
  "competitors": ["2-3 real, named competing companies or brands in the same category"],
  "language": "the primary language of the website's own content and target market — must be exactly \\"en\\" or \\"nl\\", pick the closer match if genuinely uncertain, default to \\"en\\""
}
Rules: only include a competitor if it's a real, currently-operating company distinct from ${website} itself — never list the company you're researching as its own competitor. Leave a field as an empty string (or empty array for competitors) if you can't confidently determine it from the site or can't verify it's real. Do not guess or invent facts to fill a field.`;
}

// Lenient JSON extraction: models sometimes wrap JSON in markdown fences or
// add a stray sentence before/after — strip both rather than failing the
// whole enrichment over formatting. Always returns every field (defaulted
// empty), so the caller can spread the result straight into form fields
// without further null-checking.
export function parseEnrichmentResponse(text) {
  const empty = { brand: '', category: '', use_case: '', region: '', customer_segment: '', competitors: [], language: 'en' };
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return empty;
  try {
    const parsed = JSON.parse(match[0]);
    const brand = typeof parsed.brand === 'string' ? parsed.brand.trim() : '';
    // Defense-in-depth against the prompt's "never list the company you're
    // researching as its own competitor" rule — models occasionally ignore
    // instructions, so also filter it out here rather than trusting the
    // prompt alone.
    const competitors = Array.isArray(parsed.competitors)
      ? parsed.competitors
          .filter((c) => typeof c === 'string' && c.trim())
          .map((c) => c.trim())
          .filter((c) => !brand || c.toLowerCase() !== brand.toLowerCase())
          .slice(0, 3)
      : [];
    // language: bounds-checked against SUPPORTED_LANGUAGES rather than
    // trusted verbatim — a model can ignore the prompt's exact-match
    // instruction, and an unsupported value here would silently fall
    // through to promptTemplatesForLanguage()'s own 'en' fallback anyway,
    // so failing closed to 'en' here just makes that explicit.
    const language = SUPPORTED_LANGUAGES.includes(parsed.language) ? parsed.language : 'en';
    return {
      brand,
      category: typeof parsed.category === 'string' ? parsed.category.trim() : '',
      use_case: typeof parsed.use_case === 'string' ? parsed.use_case.trim() : '',
      region: typeof parsed.region === 'string' ? parsed.region.trim() : '',
      customer_segment: typeof parsed.customer_segment === 'string' ? parsed.customer_segment.trim() : '',
      competitors,
      language,
    };
  } catch {
    return empty;
  }
}
