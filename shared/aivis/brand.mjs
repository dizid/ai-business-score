// Brand-name/URL normalization and mention-detection — split out of
// aivis-core.mjs (2026-09-12 architecture refactor). See that file's header
// comment for why this split exists; nothing here changed behavior, only
// location.

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

export function isAmbiguousBrandName(name) {
  const words = name.trim().toLowerCase().split(/\s+/);
  return words.length === 1 && COMMON_WORD_STOPLIST.has(words[0]);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Accepts either a bare domain ("acme.com") or a full URL
// ("https://acme.com/path") and normalizes to a full clickable URL.
export function normalizeUrl(input) {
  const trimmed = input.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// Full URL or bare domain -> bare hostname, no protocol/www/path.
// "https://www.acmeplumbing.example.com/path" -> "acmeplumbing.example.com"
export function hostnameOf(input) {
  const url = normalizeUrl(input);
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return input.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
  }
}

// "acmeplumbing.example.com" -> "acmeplumbing"
export function domainAlias(website) {
  return hostnameOf(website).split('.')[0];
}

// Rejects input that can't possibly be a real business website, after
// normalizeUrl() has had a chance to add the https:// prefix — e.g. a typo
// like "reuters com" (space instead of dot, most likely a mobile
// autocorrect swallowing the period) previously sailed straight through
// normalizeUrl() into "https://reuters com" and got persisted as-is: a
// stored URL the WHATWG URL parser itself considers invalid (space is a
// forbidden host code point), which is exactly what later made
// harmonia.mjs's `new URL(website)` throw at scan time. normalizeUrl() is
// deliberately lenient (bare-domain support), so the actual validation has
// to happen here, one layer up, at every place user input becomes a
// company's website: enrich.mts (before spending a Perplexity call on an
// unresearchable URL) and companies.mts (the actual insert boundary, the
// authoritative gate regardless of how a request reached it).
export function isValidWebsiteUrl(input) {
  if (typeof input !== 'string' || !input.trim()) return false;
  let url;
  try {
    url = new URL(normalizeUrl(input));
  } catch {
    return false;
  }
  if (!/^https?:$/i.test(url.protocol)) return false;
  // Require a real-looking domain (at least one dot) — a bare single-label
  // host almost always means the input was malformed rather than a real
  // business website, and this product has no use for anything else.
  return url.hostname.includes('.');
}

export function findMentions(text, name) {
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
export function findBrandMention(text, prospect) {
  const primary = findMentions(text, prospect.brand);
  if (!primary.ambiguous) return primary;
  const alias = domainAlias(prospect.website);
  const aliasMatch = findMentions(text, alias);
  if (!aliasMatch.ambiguous) return aliasMatch;
  return primary; // both ambiguous — genuinely needs manual read
}
