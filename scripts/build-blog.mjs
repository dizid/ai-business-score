// Renders content/blog/*.md into static blog pages under dist/blog/, and
// appends their URLs to dist/sitemap.xml (already copied there verbatim
// from public/sitemap.xml by the preceding `vite build` step, since files
// in public/ are copied as-is). Runs as a post-build step — see the
// `build` script in package.json — because the rest of this site's
// indexable pages (index.html, how-it-works.html, privacy.html,
// terms.html) are plain static HTML, not Vue mounts, and the blog follows
// that same pattern rather than adding a client-side router/framework for
// content AI crawlers like GPTBot/ClaudeBot need to read without executing
// JS (see vite.config.ts's comment on why index.html etc. are plain HTML).
//
// Output is dist/blog/<slug>/index.html (folder + index.html) rather than
// a flat dist/blog/<slug>.html, so each post resolves at a clean
// trailing-slash URL via Netlify's default static-directory serving with
// zero netlify.toml redirect entries needed — unlike how-it-works.html/
// privacy.html/terms.html, which each need their own explicit redirect.
// That matters here specifically because posts get added over time and
// none of them should require a config edit to go live.

import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { marked } from 'marked';
import { resolveIncludes } from './html-includes.mjs';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const contentDir = path.join(rootDir, 'content', 'blog');
const distDir = path.join(rootDir, 'dist');
const partialsDir = path.join(rootDir, 'partials');
const siteUrl = 'https://foreground.info';

// --- frontmatter: plain `key: value` lines between `---` fences. Simple on
// purpose — content/blog/*.md only ever needs title/description/date, no
// arrays or nesting, so a hand-rolled parser avoids a dependency
// (gray-matter et al.) for a format this small. -----------------------
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error('Missing frontmatter fence (---...---) at top of file');
  const [, fmBlock, body] = match;
  const data = {};
  for (const line of fmBlock.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    data[key] = value;
  }
  return { data, body };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Shared nav/footer/head-boilerplate markup now lives in partials/ (see
// scripts/html-includes.mjs) — the same source index.html/how-it-works.html/
// privacy.html/terms.html/app.html pull from via a Vite plugin. This script
// isn't Vite-processed (it runs as plain Node after `vite build`), so it
// calls resolveIncludes() directly and does its own %VITE_GA4_MEASUREMENT_ID%
// substitution afterward via process.env, same as it always has.
// __EXTRA_HEAD__/__BODY_HTML__ are plain string placeholders, not passed
// through resolveIncludes() — caller-supplied blog-post content should
// never be scanned for include markers.
function pageShell({ title, description, canonicalPath, ogImagePath = '/og-image.png', ogType = 'website', bodyHtml, extraHead = '' }) {
  const canonicalUrl = `${siteUrl}${canonicalPath}`;
  const shell = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${canonicalUrl}" />

<!--#include:favicon-->
<meta name="theme-color" content="#0a0a0d" />

<meta property="og:type" content="${ogType}" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${canonicalUrl}" />
<meta property="og:image" content="${siteUrl}${ogImagePath}" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta property="twitter:image" content="${siteUrl}${ogImagePath}" />

<!--#include:fonts-->
<!--#include:marketing-theme-link-->
<link rel="stylesheet" href="/blog-theme.css" />
__EXTRA_HEAD__

<!-- Google Analytics (GA4) — see partials/ga4.html. Its measurement-ID
     token is substituted directly below via process.env, since this script
     runs as plain Node after vite build, not through Vite's htmlEnvHook. -->
<!--#include:ga4-->
</head>
<body>

<!--#include:nav-->

<div class="wrap blog-wrap">
__BODY_HTML__
</div>

<div class="wrap">
  <!--#include:footer-->
</div>

</body>
</html>
`;
  const gaId = process.env.VITE_GA4_MEASUREMENT_ID || '';
  return resolveIncludes(shell, partialsDir)
    .replaceAll('%VITE_GA4_MEASUREMENT_ID%', gaId)
    .replace('__EXTRA_HEAD__', () => extraHead)
    .replace('__BODY_HTML__', () => bodyHtml);
}

function formatDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function loadPosts() {
  if (!existsSync(contentDir)) return [];
  const files = readdirSync(contentDir).filter((f) => f.endsWith('.md'));
  const posts = files.map((file) => {
    const slug = file.replace(/\.md$/, '');
    const raw = readFileSync(path.join(contentDir, file), 'utf8');
    const { data, body } = parseFrontmatter(raw);
    if (!data.title || !data.description || !data.date) {
      throw new Error(`content/blog/${file}: frontmatter must include title, description, and date`);
    }
    return { slug, ...data, bodyHtml: marked.parse(body.trim()) };
  });
  posts.sort((a, b) => (a.date < b.date ? 1 : -1));
  return posts;
}

function buildPostPage(post) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    author: { '@type': 'Person', name: 'Marc de Ruijter' },
    publisher: { '@id': `${siteUrl}/#organization`, '@type': 'Organization', name: 'Foreground' },
    mainEntityOfPage: `${siteUrl}/blog/${post.slug}/`,
  };
  const bodyHtml = `
  <article class="blog-post">
    <a class="blog-back" href="/blog/">&larr; All posts</a>
    <h1>${escapeHtml(post.title)}</h1>
    <div class="blog-meta">${formatDate(post.date)}</div>
    <div class="blog-body">
${post.bodyHtml}
    </div>
  </article>`;
  return pageShell({
    title: `${post.title} — Foreground`,
    description: post.description,
    canonicalPath: `/blog/${post.slug}/`,
    ogType: 'article',
    bodyHtml,
    extraHead: `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>`,
  });
}

function buildIndexPage(posts) {
  const items = posts
    .map(
      (post) => `      <a class="blog-index-card" href="/blog/${post.slug}/">
        <span class="blog-index-date">${formatDate(post.date)}</span>
        <h2>${escapeHtml(post.title)}</h2>
        <p>${escapeHtml(post.description)}</p>
      </a>`
    )
    .join('\n');
  const bodyHtml = `
  <section class="blog-index">
    <h1>Blog</h1>
    <p class="section-sub">Notes on AI search visibility, from building Foreground.</p>
    <div class="blog-index-list">
${items}
    </div>
  </section>`;
  return pageShell({
    title: 'Blog — Foreground',
    description: 'Notes on AI search visibility, GEO vs SEO, and what actually changes whether ChatGPT and Gemini mention your business.',
    canonicalPath: '/blog/',
    bodyHtml,
  });
}

function updateSitemap(posts) {
  const sitemapPath = path.join(distDir, 'sitemap.xml');
  if (!existsSync(sitemapPath)) {
    console.warn('build-blog: dist/sitemap.xml not found, skipping sitemap update');
    return;
  }
  let xml = readFileSync(sitemapPath, 'utf8');
  const newestPostDate = posts.reduce((max, p) => (p.date > max ? p.date : max), '2026-08-17');
  const entries = [
    `  <url><loc>${siteUrl}/blog/</loc><lastmod>${newestPostDate}</lastmod></url>`,
    ...posts.map((p) => `  <url><loc>${siteUrl}/blog/${p.slug}/</loc><lastmod>${p.date}</lastmod></url>`),
  ].join('\n');
  xml = xml.replace('</urlset>', `${entries}\n</urlset>`);
  writeFileSync(sitemapPath, xml);
}

function main() {
  const posts = loadPosts();
  if (posts.length === 0) {
    console.warn('build-blog: no posts found in content/blog/, nothing to do');
    return;
  }

  const blogDistDir = path.join(distDir, 'blog');
  mkdirSync(blogDistDir, { recursive: true });

  for (const post of posts) {
    const postDir = path.join(blogDistDir, post.slug);
    mkdirSync(postDir, { recursive: true });
    writeFileSync(path.join(postDir, 'index.html'), buildPostPage(post));
  }
  writeFileSync(path.join(blogDistDir, 'index.html'), buildIndexPage(posts));

  updateSitemap(posts);

  console.log(`build-blog: wrote ${posts.length} post(s) + index to dist/blog/, updated dist/sitemap.xml`);
}

main();
