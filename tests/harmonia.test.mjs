import { describe, expect, it } from 'vitest';
import { extractPsiSignals, parseHtml, parseSitemapXml, validateJsonLdBlocks } from '../shared/harmonia.mjs';

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
