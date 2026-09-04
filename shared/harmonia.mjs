// Harmonia: a technical/on-page/content-structure/UX audit of a scanned
// business's OWN website — distinct from aivis-core.mjs, which never fetches
// the target site itself (it only asks LLMs about the category). Only
// imported by run-scan-background.mts, never by proof-script or
// aivis-core.mjs, so it's free to use fetch()/regex HTML parsing without
// touching proof-script's zero-dep constraint.
//
// Every exported/internal step is wrapped so analyzeHarmonia() never throws
// — worst case it resolves with mostly-null fields plus an `errors` array,
// matching the "skip and count as failure, never block the rest" discipline
// already used throughout this codebase (callModelWithRetry, the
// scan-complete email, etc.). The Harmonia score is always a SEPARATE,
// secondary score from the AI Visibility Score computed in aivis-core.mjs
// — never blended into it.

import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';

const HOMEPAGE_TIMEOUT_MS = 8000;
const ROBOTS_TIMEOUT_MS = 5000;
const SITEMAP_TIMEOUT_MS = 5000;
const PSI_TIMEOUT_MS = 40000;
const MAX_REDIRECTS = 3;

// ---------- SSRF guard ----------
// website/robots.txt/sitemap.xml are all fetched by OUR server against a
// URL a signed-up user fully controls (a company's `website` field) — a
// classic SSRF vector (cloud metadata endpoints, internal services,
// localhost) if not restricted. PageSpeed Insights is deliberately NOT
// covered here — that fetch happens on Google's infrastructure, not ours.

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true; // malformed -> fail closed
  const [a, b] = parts;
  if (a === 127) return true; // loopback
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // link-local, incl. 169.254.169.254 cloud metadata
  if (a === 0) return true; // 0.0.0.0/8
  if (a >= 224) return true; // multicast/reserved
  return false;
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true; // loopback / unspecified
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // link-local fe80::/10
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local fc00::/7
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.split(':').pop();
    if (v4 && v4.includes('.')) return isPrivateIPv4(v4);
  }
  return false;
}

function isPrivateIP(address, family) {
  return family === 6 ? isPrivateIPv6(address) : isPrivateIPv4(address);
}

async function assertPublicHost(hostname) {
  const literalFamily = isIP(hostname);
  if (literalFamily) {
    if (isPrivateIP(hostname, literalFamily)) throw new Error(`Refusing to fetch private/internal address ${hostname}`);
    return;
  }
  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (err) {
    throw new Error(`DNS resolution failed for ${hostname}: ${err.message}`);
  }
  if (addresses.length === 0) throw new Error(`DNS resolution returned no addresses for ${hostname}`);
  for (const { address, family } of addresses) {
    if (isPrivateIP(address, family)) throw new Error(`Refusing to fetch private/internal address ${hostname} (resolved ${address})`);
  }
}

// fetch() with redirect: 'manual' + a hostname re-check on every hop —
// following a redirect blindly (fetch's default) would let a public
// hostname's response redirect the request to an internal address after
// the initial check already passed.
async function safeFetch(url, options, redirectsLeft = MAX_REDIRECTS) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Refusing non-http(s) scheme: ${parsed.protocol}`);
  }
  await assertPublicHost(parsed.hostname);
  const res = await fetch(url, { ...options, redirect: 'manual' });
  if ([301, 302, 303, 307, 308].includes(res.status)) {
    if (redirectsLeft <= 0) throw new Error('Too many redirects');
    const location = res.headers.get('location');
    if (!location) throw new Error('Redirect response missing Location header');
    return safeFetch(new URL(location, url).toString(), options, redirectsLeft - 1);
  }
  return res;
}

const PILLAR_WEIGHTS = { technicalSeo: 0.4, onPageSeo: 0.3, contentStructure: 0.2, uxSignals: 0.1 };

// Required (schema.org-recommended) properties per @type — used for a
// hand-rolled structural validity check. This is NOT a call to Google's
// Rich Results Test (no public API exists for that tool); it's a much
// smaller "does this block look plausible" check.
const SCHEMA_REQUIRED_PROPS = {
  Organization: ['name'],
  LocalBusiness: ['name', 'address'],
  Product: ['name'],
  FAQPage: ['mainEntity'],
  Article: ['headline'],
  BreadcrumbList: ['itemListElement'],
};

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

// ---------- HTML parsing (regex-based, no cheerio/jsdom dependency) ----------

function getAttr(tag, attr) {
  const m = tag.match(new RegExp(`${attr}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return m ? m[2] : null;
}

function extractTags(html, tagName) {
  const re = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  return html.match(re) || [];
}

export function parseHtml(html, origin) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;

  const metaTags = extractTags(html, 'meta');
  const descriptionTag = metaTags.find((t) => (getAttr(t, 'name') || '').toLowerCase() === 'description');
  const viewportTag = metaTags.find((t) => (getAttr(t, 'name') || '').toLowerCase() === 'viewport');
  const ogTags = metaTags
    .filter((t) => (getAttr(t, 'property') || '').toLowerCase().startsWith('og:'))
    .map((t) => ({ property: getAttr(t, 'property'), content: getAttr(t, 'content') || '' }));
  const twitterTags = metaTags
    .filter((t) => (getAttr(t, 'name') || '').toLowerCase().startsWith('twitter:'))
    .map((t) => ({ name: getAttr(t, 'name'), content: getAttr(t, 'content') || '' }));

  const linkTags = extractTags(html, 'link');
  const canonicalTag = linkTags.find((t) => (getAttr(t, 'rel') || '').toLowerCase() === 'canonical');
  const faviconTag = linkTags.find((t) => /icon/i.test(getAttr(t, 'rel') || ''));
  const manifestTag = linkTags.find((t) => (getAttr(t, 'rel') || '').toLowerCase() === 'manifest');
  const hreflangTags = linkTags
    .filter((t) => (getAttr(t, 'rel') || '').toLowerCase() === 'alternate' && getAttr(t, 'hreflang'))
    .map((t) => ({ hreflang: getAttr(t, 'hreflang'), href: getAttr(t, 'href') }));
  const htmlLangMatch = html.match(/<html\b[^>]*\blang\s*=\s*(["'])(.*?)\1/i);

  const jsonLdRaw = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1]);

  const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
  const h2Count = (html.match(/<h2[\s>]/gi) || []).length;

  const imgTags = extractTags(html, 'img');
  const imgsWithAlt = imgTags.filter((t) => (getAttr(t, 'alt') || '').trim().length > 0).length;

  let internalLinkCount = 0;
  try {
    const hostname = new URL(origin).hostname;
    for (const tag of extractTags(html, 'a')) {
      const href = getAttr(tag, 'href');
      if (!href) continue;
      if (href.startsWith('/') || href.startsWith('#')) { internalLinkCount++; continue; }
      try {
        if (new URL(href, origin).hostname === hostname) internalLinkCount++;
      } catch {
        // not a resolvable URL (mailto:, javascript:, etc.) — not a link to count
      }
    }
  } catch {
    // origin itself failed to parse — internalLinkCount stays 0
  }

  // Same tag-stripping pipeline wordCount always used — now also captured
  // as text (not just counted) so the clarity check (shared/aivis-core.mjs)
  // has real homepage copy to classify without a second fetch of the same
  // page. Capped at 3000 chars: plenty for a homepage's hero/intro pitch,
  // short enough to keep the clarity-check LLM call cheap and fast.
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const wordCount = bodyText ? bodyText.split(' ').filter(Boolean).length : 0;

  return {
    title,
    metaDescription: descriptionTag ? (getAttr(descriptionTag, 'content') || '') : null,
    viewportPresent: Boolean(viewportTag),
    ogTags,
    twitterTags,
    canonicalUrl: canonicalTag ? getAttr(canonicalTag, 'href') : null,
    faviconHref: faviconTag ? getAttr(faviconTag, 'href') : null,
    manifestHref: manifestTag ? getAttr(manifestTag, 'href') : null,
    hreflangTags,
    htmlLang: htmlLangMatch ? htmlLangMatch[2] : null,
    jsonLdRaw,
    h1Count,
    h2Count,
    imgTotal: imgTags.length,
    imgsWithAlt,
    internalLinkCount,
    wordCount,
    bodyText: bodyText.slice(0, 3000),
  };
}

// ---------- JSON-LD structural validation + schema opportunities ----------

function validateJsonLdNode(node) {
  if (!node || typeof node !== 'object') return { valid: false, type: null, issues: ['Not a JSON-LD object'] };
  const context = node['@context'];
  const hasSchemaContext = typeof context === 'string'
    ? context.includes('schema.org')
    : JSON.stringify(context || '').includes('schema.org');
  const type = typeof node['@type'] === 'string' ? node['@type'] : null;
  const issues = [];
  if (!hasSchemaContext) issues.push('Missing or non-schema.org @context');
  if (!type) issues.push('Missing @type');
  const requiredProps = type && SCHEMA_REQUIRED_PROPS[type];
  if (requiredProps) {
    for (const prop of requiredProps) {
      if (node[prop] === undefined) issues.push(`Missing recommended property "${prop}" for ${type}`);
    }
  }
  return { valid: issues.length === 0, type, issues };
}

function validateJsonLdBlocks(rawBlocks) {
  const nodes = [];
  for (const raw of rawBlocks) {
    let parsed;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      nodes.push({ valid: false, type: null, issues: ['Not valid JSON'] });
      continue;
    }
    const candidates = Array.isArray(parsed) ? parsed : (Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed]);
    for (const node of candidates) nodes.push(validateJsonLdNode(node));
  }
  return nodes;
}

function generateSchemaOpportunities(detectedTypes, { brand, website }) {
  const opportunities = [];
  if (!detectedTypes.includes('Organization') && !detectedTypes.includes('LocalBusiness')) {
    opportunities.push({
      type: 'Organization',
      reason: 'No Organization or LocalBusiness schema detected — this is the baseline markup AI systems and search engines use to identify who you are.',
      example: JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: brand, url: website }, null, 2),
    });
  }
  if (!detectedTypes.includes('FAQPage')) {
    opportunities.push({
      type: 'FAQPage',
      reason: 'No FAQPage schema detected — FAQ markup maps directly to how people phrase questions to AI search tools, one of the higher-value additions for AI visibility.',
      example: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [{
          '@type': 'Question',
          name: `What makes ${brand} different?`,
          acceptedAnswer: { '@type': 'Answer', text: 'Replace with your actual answer.' },
        }],
      }, null, 2),
    });
  }
  if (!detectedTypes.includes('BreadcrumbList')) {
    opportunities.push({
      type: 'BreadcrumbList',
      reason: 'No BreadcrumbList schema detected — helps crawlers (AI and traditional) understand your site structure.',
      example: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: website }],
      }, null, 2),
    });
  }
  return opportunities.map((o) => ({ ...o, example: `${o.example}\n\n<!-- starter template — customize before publishing -->` }));
}

// ---------- Network checks ----------

async function fetchHomepage(origin) {
  const { signal, clear } = withTimeout(HOMEPAGE_TIMEOUT_MS);
  try {
    const res = await safeFetch(origin, { signal });
    const html = await res.text();
    return { statusCode: res.status, httpsOk: res.url.startsWith('https://'), headers: res.headers, html, error: null };
  } catch (err) {
    return { statusCode: null, httpsOk: false, headers: new Headers(), html: '', error: `Homepage fetch failed: ${err.message}` };
  } finally {
    clear();
  }
}

// Best-effort heuristic, not a full robots.txt spec parser — good enough to
// flag the common "blocked everything by accident" case.
function robotsBlanketDisallow(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  let inWildcardBlock = false;
  let disallowsRoot = false;
  for (const line of lines) {
    if (/^user-agent:\s*\*/i.test(line)) { inWildcardBlock = true; continue; }
    if (/^user-agent:/i.test(line)) { inWildcardBlock = false; continue; }
    if (inWildcardBlock && /^disallow:\s*\/\s*$/i.test(line)) disallowsRoot = true;
  }
  return disallowsRoot;
}

// AI crawlers relevant to a tool that specifically sells "AI visibility" —
// checked against robots.txt's own per-bot User-agent blocks, not just the
// generic `User-agent: *` block robotsBlanketDisallow() above already
// covers. A site can allow `*` while still explicitly blocking GPTBot.
const AI_CRAWLER_USER_AGENTS = [
  { bot: 'GPTBot', provider: 'OpenAI' },
  { bot: 'ChatGPT-User', provider: 'OpenAI' },
  { bot: 'OAI-SearchBot', provider: 'OpenAI' },
  { bot: 'ClaudeBot', provider: 'Anthropic' },
  { bot: 'anthropic-ai', provider: 'Anthropic' },
  { bot: 'PerplexityBot', provider: 'Perplexity' },
  { bot: 'Google-Extended', provider: 'Google' },
  { bot: 'CCBot', provider: 'Common Crawl' },
  { bot: 'Applebot-Extended', provider: 'Apple' },
];

// Groups robots.txt into User-agent blocks — one or more consecutive
// `User-agent:` lines share the Disallow rules that follow them, which is
// how real robots.txt files commonly list several bots under one ruleset.
// Same "good enough heuristic" philosophy as robotsBlanketDisallow above,
// not a full RFC 9309 parser.
function parseRobotsBlocks(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const blocks = [];
  let agents = [];
  let rules = [];
  const flush = () => {
    if (agents.length) blocks.push({ agents, rules });
    agents = [];
    rules = [];
  };
  for (const line of lines) {
    const uaMatch = /^user-agent:\s*(.+)$/i.exec(line);
    if (uaMatch) {
      if (rules.length) flush(); // a new User-agent after rules started means a new block
      agents.push(uaMatch[1].trim());
      continue;
    }
    const disallowMatch = /^disallow:\s*(.*)$/i.exec(line);
    if (disallowMatch) rules.push(disallowMatch[1].trim());
  }
  flush();
  return blocks;
}

function checkAiCrawlerAccess(text) {
  const blocks = parseRobotsBlocks(text);
  return AI_CRAWLER_USER_AGENTS.map(({ bot, provider }) => {
    const block = blocks.find((b) => b.agents.some((a) => a.toLowerCase() === bot.toLowerCase()));
    if (!block) return { bot, provider, matched: false, blocked: false };
    return { bot, provider, matched: true, blocked: block.rules.some((path) => path === '/') };
  });
}

async function fetchRobotsTxt(origin) {
  const { signal, clear } = withTimeout(ROBOTS_TIMEOUT_MS);
  try {
    const res = await safeFetch(`${origin}/robots.txt`, { signal });
    if (!res.ok) return { reachable: false, blanketDisallow: false, hasSitemapDirective: false, aiCrawlers: [], error: null };
    const text = await res.text();
    return {
      reachable: true,
      blanketDisallow: robotsBlanketDisallow(text),
      hasSitemapDirective: /^sitemap:/im.test(text),
      aiCrawlers: checkAiCrawlerAccess(text),
      error: null,
    };
  } catch (err) {
    return { reachable: false, blanketDisallow: false, hasSitemapDirective: false, aiCrawlers: [], error: `robots.txt check failed: ${err.message}` };
  } finally {
    clear();
  }
}

// A sitemap index's <sitemap> children point at other sitemap files (not
// fetched here — that would be a second hop per file, out of scope for
// this check); a plain sitemap's <url> entries are counted directly.
export function parseSitemapXml(text) {
  const isSitemapIndex = /<sitemapindex[\s>]/i.test(text);
  const urlCount = isSitemapIndex
    ? (text.match(/<sitemap[\s>]/gi) || []).length
    : (text.match(/<url[\s>]/gi) || []).length;
  return { isSitemapIndex, urlCount };
}

async function fetchSitemapXml(origin) {
  const { signal, clear } = withTimeout(SITEMAP_TIMEOUT_MS);
  try {
    const res = await safeFetch(`${origin}/sitemap.xml`, { signal });
    if (!res.ok) return { reachable: false, urlCount: null, isSitemapIndex: false, error: null };
    const text = await res.text();
    const { isSitemapIndex, urlCount } = parseSitemapXml(text);
    return { reachable: true, urlCount, isSitemapIndex, error: null };
  } catch (err) {
    return { reachable: false, urlCount: null, isSitemapIndex: false, error: `sitemap.xml check failed: ${err.message}` };
  } finally {
    clear();
  }
}

function checkSecurityHeaders(headers) {
  const csp = headers.get('content-security-policy') || '';
  return [
    { header: 'Strict-Transport-Security', present: headers.has('strict-transport-security') },
    { header: 'Content-Security-Policy', present: headers.has('content-security-policy') },
    { header: 'X-Content-Type-Options', present: headers.has('x-content-type-options') },
    { header: 'X-Frame-Options', present: headers.has('x-frame-options') || /frame-ancestors/i.test(csp) },
    { header: 'Referrer-Policy', present: headers.has('referrer-policy') },
  ];
}

// PSI's Lighthouse run gives lab-simulated LCP/CLS (always present).
// True INP is field data (real-user CrUX) and is frequently absent for
// lower-traffic sites — most businesses this tool scans — so it's null
// far more often than LCP/CLS. That's a real data-availability gap, not a
// bug, and is surfaced as-is rather than faked.
//
// Requesting seo/accessibility/best-practices alongside performance is the
// same PSI call, same latency/cost budget — Lighthouse computes all
// requested categories in one run. Live-verified against a real site
// (2026-08-31, same stripe.com precedent the original PSI integration
// used) before wiring in: category scores are 0-1 fractions like
// performance's; audit ids below were confirmed present with a real
// score (0/1) in that live response, not guessed from Lighthouse docs.
// Deliberately NOT pulling audits that duplicate a check `parseHtml`/
// `checkSecurityHeaders` already does independently (meta-description,
// document-title, canonical, robots-txt, image-alt, structured-data) —
// two sources of truth for the same fact risks them disagreeing; only
// genuinely new signal is added here.
const PSI_AUDIT_IDS = [
  { id: 'hreflang', label: 'hreflang tags are valid (if present)' },
  { id: 'crawlable-anchors', label: 'Links are crawlable' },
  { id: 'is-crawlable', label: "Page isn't blocked from indexing" },
  { id: 'color-contrast', label: 'Text has sufficient color contrast' },
  { id: 'link-text', label: 'Links have descriptive text' },
];

// Pure extraction from a already-parsed PSI JSON body — split out from
// fetchCoreWebVitals so it's testable against a fixture without a network
// call or an API key.
export function extractPsiSignals(json) {
  const lighthouse = json.lighthouseResult;
  const categoryScores = lighthouse?.categories || {};
  const toScore = (score) => (typeof score === 'number' ? Math.round(score * 100) : null);
  const audits = lighthouse?.audits || {};
  const additionalAudits = PSI_AUDIT_IDS.map(({ id, label }) => {
    const score = audits[id]?.score;
    return { id, label, passed: typeof score === 'number' ? score >= 1 : null };
  });
  return {
    strategy: 'mobile',
    performanceScore: toScore(categoryScores.performance?.score),
    seoScore: toScore(categoryScores.seo?.score),
    accessibilityScore: toScore(categoryScores.accessibility?.score),
    bestPracticesScore: toScore(categoryScores['best-practices']?.score),
    lcpMs: audits['largest-contentful-paint']?.numericValue ?? null,
    clsScore: audits['cumulative-layout-shift']?.numericValue ?? null,
    inpMs: json.loadingExperience?.metrics?.INTERACTION_TO_NEXT_PAINT?.percentile ?? null,
    additionalAudits,
  };
}

async function fetchCoreWebVitals(origin, apiKey) {
  if (!apiKey) return null;
  const { signal, clear } = withTimeout(PSI_TIMEOUT_MS);
  try {
    const categories = 'category=performance&category=seo&category=accessibility&category=best-practices';
    const url = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(origin)}&strategy=mobile&${categories}&key=${apiKey}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const json = await res.json();
    return extractPsiSignals(json);
  } catch {
    return null;
  } finally {
    clear();
  }
}

// ---------- Pillar scoring ----------

function scoreFromChecks(checks) {
  if (checks.length === 0) return null;
  return Math.round((checks.filter((c) => c.passed).length / checks.length) * 100);
}

function computeHarmoniaScore(pillars) {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(PILLAR_WEIGHTS)) {
    const score = pillars[key]?.score;
    if (typeof score === 'number') {
      weightedSum += score * weight;
      totalWeight += weight;
    }
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;
}

// ---------- Main entry ----------

export async function analyzeHarmonia(prospect, psiApiKey) {
  const { website, brand, category } = prospect;
  const errors = [];
  const checkedAtDate = new Date();

  let origin;
  try {
    origin = new URL(website).origin;
  } catch {
    return {
      fetchedUrl: website,
      statusCode: null,
      checkedAtDate,
      harmoniaScore: null,
      pillars: {
        technicalSeo: { score: null, checks: [] },
        onPageSeo: { score: null, checks: [] },
        contentStructure: { score: null, checks: [] },
        uxSignals: { score: null, checks: [] },
      },
      schema: { detected: [], opportunities: [] },
      coreWebVitals: null,
      securityHeaders: [],
      aiCrawlerAccess: { bots: [], blockedCount: 0, checkedCount: 0 },
      additionalSeoSignals: null,
      homepageText: null,
      errors: ['Invalid website URL — could not analyze'],
    };
  }

  const homepage = await fetchHomepage(origin);
  if (homepage.error) errors.push(homepage.error);
  const page = homepage.html ? parseHtml(homepage.html, origin) : null;

  const [robots, sitemap, coreWebVitals] = await Promise.all([
    fetchRobotsTxt(origin),
    fetchSitemapXml(origin),
    fetchCoreWebVitals(origin, psiApiKey),
  ]);
  if (robots.error) errors.push(robots.error);
  if (sitemap.error) errors.push(sitemap.error);

  const jsonLdNodes = page ? validateJsonLdBlocks(page.jsonLdRaw) : [];
  const detectedTypes = jsonLdNodes.map((n) => n.type).filter(Boolean);
  const opportunities = generateSchemaOpportunities(detectedTypes, { brand, website });
  const securityHeaders = homepage.statusCode !== null ? checkSecurityHeaders(homepage.headers) : [];

  // Checks that don't need the homepage HTML body (only that we got a
  // response, or are independent fetches entirely) still run even if HTML
  // parsing failed; checks that need the parsed page are omitted (not
  // failed) when the homepage was unreachable — an unreachable site
  // shouldn't read as "0/6 on-page checks failed."
  const technicalSeoChecks = [
    ...(homepage.statusCode !== null ? [{ id: 'https', label: 'Served over HTTPS', passed: homepage.httpsOk }] : []),
    { id: 'robots', label: 'robots.txt reachable and not blocking everything', passed: robots.reachable && !robots.blanketDisallow },
    { id: 'sitemap', label: 'Sitemap reachable', passed: sitemap.reachable || robots.hasSitemapDirective },
    ...(page ? [{ id: 'jsonld', label: 'At least one valid JSON-LD block', passed: jsonLdNodes.some((n) => n.valid) }] : []),
    ...(page ? [{ id: 'canonical', label: 'Canonical tag present', passed: Boolean(page.canonicalUrl) }] : []),
    ...(securityHeaders.length ? [{ id: 'security-headers', label: '≥3 of 5 common security headers present', passed: securityHeaders.filter((h) => h.present).length >= 3 }] : []),
    ...(robots.reachable ? [{ id: 'ai-crawlers', label: 'No major AI crawler (GPTBot, ClaudeBot, PerplexityBot, etc.) blocked in robots.txt', passed: robots.aiCrawlers.every((b) => !b.blocked) }] : []),
  ];

  const onPageSeoChecks = page ? [
    { id: 'title', label: 'Title tag present (10-60 chars)', passed: Boolean(page.title) && page.title.length >= 10 && page.title.length <= 60 },
    { id: 'meta-description', label: 'Meta description present (50-160 chars)', passed: Boolean(page.metaDescription) && page.metaDescription.length >= 50 && page.metaDescription.length <= 160 },
    { id: 'h1', label: 'Exactly one H1', passed: page.h1Count === 1 },
    { id: 'og-tags', label: 'OG title + description present', passed: page.ogTags.some((t) => t.property === 'og:title') && page.ogTags.some((t) => t.property === 'og:description') },
    { id: 'viewport', label: 'Viewport meta present', passed: page.viewportPresent },
    { id: 'image-alt', label: 'Image alt-text coverage ≥ 80%', passed: page.imgTotal === 0 || (page.imgsWithAlt / page.imgTotal) >= 0.8 },
  ] : [];

  const contentStructureChecks = page ? [
    { id: 'word-count', label: 'Homepage word count ≥ 300', passed: page.wordCount >= 300 },
    { id: 'h2', label: 'At least one H2 present', passed: page.h2Count >= 1 },
    { id: 'internal-links', label: 'At least 3 internal links', passed: page.internalLinkCount >= 3 },
    { id: 'schema-relevant', label: 'Schema present is category-appropriate (Organization/LocalBusiness)', passed: detectedTypes.includes('Organization') || detectedTypes.includes('LocalBusiness') },
  ] : [];

  const uxChecks = coreWebVitals ? [
    { id: 'performance', label: 'PageSpeed performance score ≥ 50 (mobile)', passed: (coreWebVitals.performanceScore ?? 0) >= 50 },
  ] : [];

  const pillars = {
    technicalSeo: { score: scoreFromChecks(technicalSeoChecks), checks: technicalSeoChecks },
    onPageSeo: { score: scoreFromChecks(onPageSeoChecks), checks: onPageSeoChecks },
    contentStructure: { score: scoreFromChecks(contentStructureChecks), checks: contentStructureChecks },
    uxSignals: { score: coreWebVitals?.performanceScore ?? null, checks: uxChecks },
  };

  // Visible-but-unscored data, same treatment coreWebVitals itself already
  // gives LCP/CLS/INP — not folded into any pillar's weighted score in this
  // pass (see this function's own PILLAR_WEIGHTS-based scoring above, left
  // untouched). A future pass can decide which of these, if any, should
  // become real scored checks once their shape has settled.
  const additionalSeoSignals = {
    htmlLang: page?.htmlLang ?? null,
    faviconPresent: Boolean(page?.faviconHref),
    manifestPresent: Boolean(page?.manifestHref),
    hreflangTags: page?.hreflangTags ?? [],
    twitterCard: page?.twitterTags ?? [],
    sitemapUrlCount: sitemap.urlCount ?? null,
    sitemapIsIndex: sitemap.isSitemapIndex ?? false,
  };

  return {
    fetchedUrl: origin,
    statusCode: homepage.statusCode,
    checkedAtDate,
    harmoniaScore: computeHarmoniaScore(pillars),
    pillars,
    schema: { detected: jsonLdNodes, opportunities },
    coreWebVitals,
    securityHeaders,
    aiCrawlerAccess: {
      bots: robots.aiCrawlers,
      blockedCount: robots.aiCrawlers.filter((b) => b.blocked).length,
      checkedCount: robots.aiCrawlers.length,
    },
    additionalSeoSignals,
    // Exposed so run-scan-background.mts's clarity check (aivis-core.mjs's
    // buildClarityCheckPrompt) can classify the homepage's own copy without
    // fetching the same page a second time. Null when the homepage was
    // unreachable, same as every other page-derived field above.
    homepageText: page?.bodyText || null,
    errors,
  };
}
