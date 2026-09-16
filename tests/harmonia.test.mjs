import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeHarmonia,
  assertPublicHost,
  extractPsiSignals,
  isPrivateIPv4,
  isPrivateIPv6,
  parseHtml,
  parseSitemapXml,
  safeFetch,
  validateJsonLdBlocks,
} from '../shared/harmonia.mjs';

describe('parseHtml — new SEO signals (2026-08-31)', () => {
  const origin = 'https://example.com';

  it('extracts html lang, favicon, manifest, hreflang, and twitter card tags', () => {
    const html = `
      <html lang="en-US">
      <head>
        <link rel="icon" href="/favicon.ico">
        <link rel="manifest" href="/manifest.json">
        <link rel="alternate" hreflang="es" href="https://example.com/es">
        <link rel="alternate" hreflang="x-default" href="https://example.com/">
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:site" content="@example">
      </head>
      <body></body>
      </html>
    `;
    const page = parseHtml(html, origin);
    expect(page.htmlLang).toBe('en-US');
    expect(page.faviconHref).toBe('/favicon.ico');
    expect(page.manifestHref).toBe('/manifest.json');
    expect(page.hreflangTags).toEqual([
      { hreflang: 'es', href: 'https://example.com/es' },
      { hreflang: 'x-default', href: 'https://example.com/' },
    ]);
    expect(page.twitterTags).toEqual([
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:site', content: '@example' },
    ]);
  });

  it('returns nulls/empty arrays when none of the new tags are present', () => {
    const html = '<html><head><title>Plain</title></head><body></body></html>';
    const page = parseHtml(html, origin);
    expect(page.htmlLang).toBeNull();
    expect(page.faviconHref).toBeNull();
    expect(page.manifestHref).toBeNull();
    expect(page.hreflangTags).toEqual([]);
    expect(page.twitterTags).toEqual([]);
  });

  it('does not confuse a canonical <link> for a favicon/manifest', () => {
    const html = '<html><head><link rel="canonical" href="https://example.com/"></head></html>';
    const page = parseHtml(html, origin);
    expect(page.faviconHref).toBeNull();
    expect(page.manifestHref).toBeNull();
    expect(page.canonicalUrl).toBe('https://example.com/');
  });
});

describe('parseHtml — HTML entity decoding in title/meta-description (2026-09-15)', () => {
  const origin = 'https://example.com';

  it('decodes named and numeric entities so length checks see real character counts, not markup', () => {
    const html = `
      <html><head>
        <title>Smith &amp; Sons Roofing &mdash; Trusted Roof Repairs</title>
        <meta name="description" content="Family owned &amp; operated since 1998 &#8212; free quotes.">
      </head></html>
    `;
    const page = parseHtml(html, origin);
    expect(page.title).toBe('Smith & Sons Roofing — Trusted Roof Repairs');
    expect(page.metaDescription).toBe('Family owned & operated since 1998 — free quotes.');
  });

  it('does not let entity-inflated raw length fail a title that is actually within the 10-60 char range', () => {
    // Raw markup is 53 chars (over some naive 50-char budget); decoded it's 43.
    const html = '<title>Smith &amp; Sons Roofing &mdash; Trusted Roof Repairs</title>';
    const page = parseHtml(html, origin);
    expect(page.title.length).toBe(43);
    expect(page.title.length).toBeLessThanOrEqual(60);
  });

  it('leaves plain text without entities untouched', () => {
    const html = '<title>Plain Title With No Entities</title>';
    const page = parseHtml(html, origin);
    expect(page.title).toBe('Plain Title With No Entities');
  });
});

describe('validateJsonLdBlocks — @graph context inheritance (2026-09-05)', () => {
  it('treats a @graph node as valid when it inherits the parent @context (Yoast SEO shape)', () => {
    // Real-world shape: @context declared once on the wrapper, not repeated
    // on each node inside @graph — this is what Yoast SEO (and many other
    // JSON-LD generators) emit, and it's valid per the JSON-LD spec.
    const raw = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', '@id': 'https://example.com/', name: 'Example' },
        { '@type': 'WebSite', '@id': 'https://example.com/#website', url: 'https://example.com/' },
      ],
    });
    const nodes = validateJsonLdBlocks([raw]);
    expect(nodes).toHaveLength(2);
    expect(nodes.every((n) => n.valid)).toBe(true);
    expect(nodes.map((n) => n.type)).toEqual(['WebPage', 'WebSite']);
  });

  it('still flags a node missing @context when there is no @graph wrapper to inherit from', () => {
    const raw = JSON.stringify({ '@type': 'WebPage', name: 'Example' });
    const nodes = validateJsonLdBlocks([raw]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].valid).toBe(false);
    expect(nodes[0].issues).toContain('Missing or non-schema.org @context');
  });

  it('prefers a node\'s own @context over the wrapper\'s when both are present', () => {
    const raw = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [{ '@type': 'WebPage', '@context': 'https://not-schema.example', name: 'Example' }],
    });
    const nodes = validateJsonLdBlocks([raw]);
    expect(nodes[0].valid).toBe(false);
    expect(nodes[0].issues).toContain('Missing or non-schema.org @context');
  });

  it('flags a block that is not valid JSON, without throwing', () => {
    const nodes = validateJsonLdBlocks(['{ not valid json ']);
    expect(nodes).toEqual([{ valid: false, type: null, issues: ['Not valid JSON'] }]);
  });
});

describe('parseSitemapXml', () => {
  it('counts <url> entries in a plain sitemap', () => {
    const xml = '<urlset><url><loc>a</loc></url><url><loc>b</loc></url><url><loc>c</loc></url></urlset>';
    expect(parseSitemapXml(xml)).toEqual({ isSitemapIndex: false, urlCount: 3 });
  });

  it('counts <sitemap> children in a sitemap index, not <url> entries', () => {
    const xml = '<sitemapindex><sitemap><loc>a</loc></sitemap><sitemap><loc>b</loc></sitemap></sitemapindex>';
    expect(parseSitemapXml(xml)).toEqual({ isSitemapIndex: true, urlCount: 2 });
  });

  it('does not double-count <sitemapindex> itself as a <sitemap> entry', () => {
    const xml = '<sitemapindex><sitemap><loc>a</loc></sitemap></sitemapindex>';
    expect(parseSitemapXml(xml).urlCount).toBe(1);
  });

  it('returns zero for an empty sitemap', () => {
    const xml = '<urlset></urlset>';
    expect(parseSitemapXml(xml)).toEqual({ isSitemapIndex: false, urlCount: 0 });
  });
});

describe('extractPsiSignals', () => {
  it('extracts category scores as 0-100 integers and known audits as pass/fail', () => {
    const json = {
      lighthouseResult: {
        categories: {
          performance: { score: 0.47 },
          seo: { score: 0.92 },
          accessibility: { score: 1 },
          'best-practices': { score: 0.54 },
        },
        audits: {
          'largest-contentful-paint': { numericValue: 5956 },
          'cumulative-layout-shift': { numericValue: 0 },
          hreflang: { score: 1 },
          'crawlable-anchors': { score: 1 },
          'is-crawlable': { score: 1 },
          'color-contrast': { score: 1 },
          'link-text': { score: 0 },
        },
      },
      loadingExperience: { metrics: { INTERACTION_TO_NEXT_PAINT: { percentile: 232 } } },
    };
    const result = extractPsiSignals(json);
    expect(result.performanceScore).toBe(47);
    expect(result.seoScore).toBe(92);
    expect(result.accessibilityScore).toBe(100);
    expect(result.bestPracticesScore).toBe(54);
    expect(result.lcpMs).toBe(5956);
    expect(result.clsScore).toBe(0);
    expect(result.inpMs).toBe(232);
    expect(result.additionalAudits).toEqual([
      { id: 'hreflang', label: 'hreflang tags are valid (if present)', passed: true },
      { id: 'crawlable-anchors', label: 'Links are crawlable', passed: true },
      { id: 'is-crawlable', label: "Page isn't blocked from indexing", passed: true },
      { id: 'color-contrast', label: 'Text has sufficient color contrast', passed: true },
      { id: 'link-text', label: 'Links have descriptive text', passed: false },
    ]);
  });

  it('degrades to nulls for missing categories/audits rather than throwing', () => {
    const result = extractPsiSignals({ lighthouseResult: {} });
    expect(result.performanceScore).toBeNull();
    expect(result.seoScore).toBeNull();
    expect(result.accessibilityScore).toBeNull();
    expect(result.bestPracticesScore).toBeNull();
    expect(result.lcpMs).toBeNull();
    expect(result.inpMs).toBeNull();
    expect(result.additionalAudits.every((a) => a.passed === null)).toBe(true);
  });

  it('treats a partial (non-1) audit score as not passed, not as missing', () => {
    const json = { lighthouseResult: { categories: {}, audits: { hreflang: { score: 0.5 } } } };
    const result = extractPsiSignals(json);
    const hreflangAudit = result.additionalAudits.find((a) => a.id === 'hreflang');
    expect(hreflangAudit.passed).toBe(false);
  });
});

// ---------- SSRF guard (2026-09-12 — closing a real zero-coverage gap) ----------
// website/robots.txt/sitemap.xml are all fetched by OUR server against a URL
// a signed-up user fully controls — a classic SSRF vector (cloud metadata
// endpoints, internal services, localhost) this guard exists specifically to
// block, and it had zero test coverage before this. isPrivateIPv4/
// isPrivateIPv6/assertPublicHost/safeFetch are pure/async-testable and were
// promoted from internal to exported for exactly this (see harmonia.mjs's
// own comment on the export).

describe('isPrivateIPv4', () => {
  it.each([
    ['127.0.0.1', true, 'loopback'],
    ['10.0.0.5', true, '10.0.0.0/8'],
    ['172.16.0.1', true, '172.16.0.0/12 lower bound'],
    ['172.31.255.255', true, '172.16.0.0/12 upper bound'],
    ['172.15.255.255', false, 'just below the 172.16.0.0/12 range'],
    ['172.32.0.0', false, 'just above the 172.16.0.0/12 range'],
    ['192.168.1.1', true, '192.168.0.0/16'],
    ['169.254.169.254', true, 'link-local — the cloud metadata endpoint'],
    ['0.0.0.0', true, '0.0.0.0/8'],
    ['224.0.0.1', true, 'multicast'],
    ['8.8.8.8', false, 'a real public address'],
    ['93.184.216.34', false, 'a real public address'],
  ])('%s -> %s (%s)', (ip, expected) => {
    expect(isPrivateIPv4(ip)).toBe(expected);
  });

  it('fails closed on a malformed address', () => {
    expect(isPrivateIPv4('not.an.ip')).toBe(true);
    expect(isPrivateIPv4('1.2.3')).toBe(true);
    expect(isPrivateIPv4('999.999.999.999')).toBe(true);
  });
});

describe('isPrivateIPv6', () => {
  it.each([
    ['::1', true, 'loopback'],
    ['::', true, 'unspecified'],
    ['fe80::1', true, 'link-local fe80::/10'],
    ['fc00::1', true, 'unique local fc00::/7'],
    ['fd12:3456::1', true, 'unique local fc00::/7'],
    ['::ffff:127.0.0.1', true, 'IPv4-mapped loopback'],
    ['::ffff:169.254.169.254', true, 'IPv4-mapped cloud metadata'],
    ['::ffff:8.8.8.8', false, 'IPv4-mapped public address'],
    ['2001:4860:4860::8888', false, 'a real public address (Google DNS)'],
  ])('%s -> %s (%s)', (ip, expected) => {
    expect(isPrivateIPv6(ip)).toBe(expected);
  });
});

// dns.promises.lookup is mocked so assertPublicHost's hostname-resolution
// path is deterministic and offline; a literal IP input (tested separately)
// never reaches it at all.
vi.mock('node:dns', () => ({
  promises: { lookup: vi.fn() },
}));

describe('assertPublicHost', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('skips DNS entirely for a literal public IP', async () => {
    const dns = await import('node:dns');
    await expect(assertPublicHost('8.8.8.8')).resolves.toBeUndefined();
    expect(dns.promises.lookup).not.toHaveBeenCalled();
  });

  it('rejects a literal private/internal IP without touching DNS', async () => {
    const dns = await import('node:dns');
    await expect(assertPublicHost('169.254.169.254')).rejects.toThrow('Refusing to fetch private/internal address');
    expect(dns.promises.lookup).not.toHaveBeenCalled();
  });

  it('resolves a hostname that resolves only to public addresses', async () => {
    const dns = await import('node:dns');
    dns.promises.lookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
    await expect(assertPublicHost('example.com')).resolves.toBeUndefined();
  });

  it('rejects a hostname that resolves to a private/metadata address — the core SSRF-via-DNS case', async () => {
    const dns = await import('node:dns');
    dns.promises.lookup.mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }]);
    await expect(assertPublicHost('attacker-controlled.example')).rejects.toThrow('Refusing to fetch private/internal address');
  });

  it('rejects when only one of several resolved addresses is private', async () => {
    const dns = await import('node:dns');
    dns.promises.lookup.mockResolvedValueOnce([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    await expect(assertPublicHost('mixed.example')).rejects.toThrow('Refusing to fetch private/internal address');
  });

  it('rejects when DNS resolution fails', async () => {
    const dns = await import('node:dns');
    dns.promises.lookup.mockRejectedValueOnce(new Error('ENOTFOUND'));
    await expect(assertPublicHost('nonexistent.example')).rejects.toThrow('DNS resolution failed');
  });

  it('rejects when DNS resolution returns no addresses', async () => {
    const dns = await import('node:dns');
    dns.promises.lookup.mockResolvedValueOnce([]);
    await expect(assertPublicHost('empty.example')).rejects.toThrow('no addresses');
  });
});

describe('safeFetch', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('refuses a non-http(s) scheme before ever calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(safeFetch('ftp://example.com/x')).rejects.toThrow('Refusing non-http(s) scheme');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a request whose host resolves to a private address before calling fetch', async () => {
    const dns = await import('node:dns');
    dns.promises.lookup.mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }]);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(safeFetch('http://internal.example/')).rejects.toThrow('Refusing to fetch private/internal address');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The literal SSRF-via-redirect scenario this guard exists for: a
  // public-looking hostname whose server responds with a redirect to a
  // cloud metadata address. Following redirects blindly (fetch's default)
  // would let the SECOND hop bypass the FIRST hop's host check entirely —
  // this is the regression this test protects against.
  it('does not follow a redirect to a private/metadata address', async () => {
    const dns = await import('node:dns');
    dns.promises.lookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
    const fetchMock = vi.fn().mockResolvedValueOnce({
      status: 302,
      headers: { get: (name) => (name === 'location' ? 'http://169.254.169.254/latest/meta-data' : null) },
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(safeFetch('http://looks-public.example/')).rejects.toThrow('Refusing to fetch private/internal address');
    // Exactly one request was made — the redirect target (a literal private
    // IP) was rejected before a second fetch call was ever issued.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('follows a redirect to a genuinely public address', async () => {
    const dns = await import('node:dns');
    dns.promises.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 302,
        headers: { get: (name) => (name === 'location' ? 'http://also-public.example/' : null) },
      })
      .mockResolvedValueOnce({ status: 200, headers: { get: () => null } });
    vi.stubGlobal('fetch', fetchMock);
    const res = await safeFetch('http://looks-public.example/');
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after too many redirects rather than looping forever', async () => {
    const dns = await import('node:dns');
    dns.promises.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const fetchMock = vi.fn().mockResolvedValue({
      status: 302,
      headers: { get: (name) => (name === 'location' ? 'http://looks-public.example/next' : null) },
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(safeFetch('http://looks-public.example/')).rejects.toThrow('Too many redirects');
  });
});

describe('analyzeHarmonia — end to end with the network fully mocked', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  const HOMEPAGE_HTML = `<html lang="en"><head>
    <title>Acme Plumbing — 24/7 Emergency Service</title>
    <meta name="description" content="Acme Plumbing offers fast, licensed emergency plumbing repairs across the metro area, day or night.">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta property="og:title" content="Acme Plumbing">
    <meta property="og:description" content="24/7 emergency plumbing">
    <link rel="canonical" href="https://acme.example/">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme Plumbing"}</script>
  </head><body>
    <h1>Acme Plumbing</h1>
    <h2>Our Services</h2>
    <p>${'Reliable plumbing repair since 1998. '.repeat(30)}</p>
    <a href="/about">About</a><a href="/contact">Contact</a><a href="/services">Services</a>
  </body></html>`;

  function fetchMockFor({ robotsStatus = 200, robotsBody = 'User-agent: *\nDisallow:\n', sitemapStatus = 200, sitemapBody = '<urlset><url><loc>a</loc></url></urlset>' } = {}) {
    return vi.fn(async (url) => {
      const href = typeof url === 'string' ? url : url.toString();
      if (href.includes('robots.txt')) {
        return { ok: robotsStatus < 400, status: robotsStatus, text: async () => robotsBody, headers: new Headers() };
      }
      if (href.includes('sitemap.xml')) {
        return { ok: sitemapStatus < 400, status: sitemapStatus, text: async () => sitemapBody, headers: new Headers() };
      }
      // Homepage
      return {
        ok: true,
        status: 200,
        url: href,
        text: async () => HOMEPAGE_HTML,
        headers: new Headers({ 'content-security-policy': "default-src 'self'" }),
      };
    });
  }

  it('resolves a full, error-free result for a normally-reachable public site', async () => {
    const dns = await import('node:dns');
    dns.promises.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    vi.stubGlobal('fetch', fetchMockFor());

    // No psiApiKey passed — fetchCoreWebVitals short-circuits to
    // { signals: null, error: null } without a network call, so this
    // exercises the homepage/robots/sitemap path without needing a 4th
    // mocked endpoint shape.
    const result = await analyzeHarmonia({ website: 'https://acme.example', brand: 'Acme Plumbing', category: 'plumber' });

    expect(result.errors).toEqual([]);
    expect(result.statusCode).toBe(200);
    expect(result.fetchedUrl).toBe('https://acme.example');
    expect(typeof result.harmoniaScore).toBe('number');
    expect(result.pillars.onPageSeo.score).toBeGreaterThan(0);
    expect(result.schema.detected.some((n) => n.type === 'Organization' && n.valid)).toBe(true);
    expect(result.homepageText).toContain('Reliable plumbing repair');
  });

  // The SSRF guard's job is to reject, not to crash the whole pipeline —
  // analyzeHarmonia's documented contract (see its own header comment) is
  // that it never throws, worst case resolving with mostly-null fields plus
  // an errors[] entry. A company's `website` field is fully user-controlled,
  // so this is the realistic "user pointed the scanner at an internal
  // address" case, not a hypothetical.
  it('surfaces an SSRF-guard rejection in errors[] instead of throwing', async () => {
    const dns = await import('node:dns');
    // Every hostname this run touches resolves to the cloud metadata
    // address — simulates a DNS-rebinding-style or directly-internal target.
    dns.promises.lookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await analyzeHarmonia({ website: 'https://attacker-controlled.example', brand: 'Acme', category: 'plumber' });

    expect(result.errors.some((e) => e.includes('Refusing to fetch private/internal address'))).toBe(true);
    expect(result.statusCode).toBeNull();
    expect(result.homepageText).toBeNull();
    // The guard rejected before any real network request was ever issued.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
