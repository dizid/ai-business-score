// Entity presence: does a Wikipedia page exist for this brand, and does it
// link to the brand's own website? A lightweight "off-site authority"
// signal for AI knowledge grounding — genuinely distinct from the other two
// site-fetching modules in this codebase: harmonia.mjs only ever fetches
// the scanned business's OWN site, and aivis-core.mjs never fetches any
// site at all (it only asks LLMs). This is the one module that fetches a
// THIRD-PARTY site (Wikipedia), which is why it's its own file/column
// rather than a field bolted onto harmonia's existing shape.
//
// Never throws — analyzeEntityPresence() always resolves with a valid
// shape, worst case all-null plus an `errors` array, same "skip and count
// as failure, never block the rest" discipline as harmonia.mjs and
// callModelWithRetry.

import { isAmbiguousBrandName, hostnameOf } from './aivis-core.mjs';

const SEARCH_TIMEOUT_MS = 8000;
const EXTLINKS_TIMEOUT_MS = 8000;

// Wikimedia's API etiquette policy (https://meta.wikimedia.org/wiki/User-Agent_policy)
// requires a descriptive User-Agent identifying the application and a
// contact point — unidentified/generic traffic gets throttled or blocked
// more aggressively. Easy to forget, and forgetting it would silently
// degrade every scan's Wikipedia check to "not found" rather than erroring
// loudly, so it's called out here rather than left as an unexplained header.
const USER_AGENT = 'Foreground-AI-Visibility-Scanner/1.0 (https://foreground.info; dev@dizid.com)';

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function searchWikipedia(brand) {
  const { signal, clear } = withTimeout(SEARCH_TIMEOUT_MS);
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(brand)}&format=json&srlimit=1`;
    const res = await fetch(url, { signal, headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return null;
    const json = await res.json();
    const hit = json.query?.search?.[0];
    return hit ? { title: hit.title } : null;
  } finally {
    clear();
  }
}

// extlinks (not the rendered page HTML) — the MediaWiki API's own
// structured list of every external link a page cites, no HTML parsing
// needed.
async function fetchExternalLinks(title) {
  const { signal, clear } = withTimeout(EXTLINKS_TIMEOUT_MS);
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extlinks&titles=${encodeURIComponent(title)}&format=json&ellimit=500`;
    const res = await fetch(url, { signal, headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return [];
    const json = await res.json();
    const pages = json.query?.pages || {};
    const page = Object.values(pages)[0];
    return (page?.extlinks || []).map((l) => l['*']).filter(Boolean);
  } finally {
    clear();
  }
}

// English Wikipedia only for now — consistent with the app being
// English-only until Milestone C3's locale-aware prompts (aivis-core.mjs's
// PROMPT_TEMPLATES_BY_LANGUAGE) landed; a Dutch-market brand may well have
// its primary Wikipedia presence on nl.wikipedia.org instead, a real gap
// worth revisiting once this ships and is trusted, not a bug being papered
// over here.
export async function analyzeEntityPresence(brand, website) {
  const checkedAtDate = new Date();

  // Same discipline as the rest of this app's auto-detection: a common-word
  // brand name ("Best", "Prime") would match nearly any Wikipedia page,
  // producing a confident-looking false positive. Skip entirely rather than
  // guess.
  if (!brand || isAmbiguousBrandName(brand)) {
    return { wikipediaFound: false, wikipediaUrl: null, linksToOwnSite: null, checkedAtDate, errors: [] };
  }

  let hit;
  try {
    hit = await searchWikipedia(brand);
  } catch (err) {
    return { wikipediaFound: false, wikipediaUrl: null, linksToOwnSite: null, checkedAtDate, errors: [`Wikipedia search failed: ${err.message}`] };
  }
  if (!hit) {
    return { wikipediaFound: false, wikipediaUrl: null, linksToOwnSite: null, checkedAtDate, errors: [] };
  }

  const wikipediaUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, '_'))}`;
  const errors = [];

  let linksToOwnSite = null;
  if (website) {
    try {
      const targetHost = hostnameOf(website);
      const extlinks = await fetchExternalLinks(hit.title);
      linksToOwnSite = extlinks.some((link) => {
        try {
          return hostnameOf(link) === targetHost;
        } catch {
          return false;
        }
      });
    } catch (err) {
      errors.push(`Wikipedia external-links check failed: ${err.message}`);
    }
  }

  return { wikipediaFound: true, wikipediaUrl, linksToOwnSite, checkedAtDate, errors };
}
