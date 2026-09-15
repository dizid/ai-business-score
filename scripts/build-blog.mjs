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
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { marked } from 'marked';
import { resolveIncludes } from './html-includes.mjs';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const contentDir = path.join(rootDir, 'content', 'blog');
const distDir = path.join(rootDir, 'dist');
const partialsDir = path.join(rootDir, 'partials');
const siteUrl = 'https://foreground.info';

// Marc's/Foreground's social profiles — added 2026-09-15 (the last open
// item from Phase 6 of the deep-research pass, see TODO.md) to strengthen
// the previously-bare Organization/Person JSON-LD nodes below. Same three
// URLs used for both the founder/author Person node and the Organization
// node, since Marc is the solo founder and "dizid" is his shared handle
// across all three platforms.
const FOUNDER_SAME_AS = [
  'https://www.linkedin.com/in/dizid/',
  'https://github.com/dizid',
  'https://x.com/dizid',
];

// Manually authored HowTo steps for specific posts — added 2026-09-15
// (Phase 6 of the deep-research improvement pass), mirroring
// how-it-works.html's own "no steps invented beyond what's on the page"
// discipline: every name/text below is drawn verbatim from that post's real
// body copy, not summarized or invented. Keyed by slug; only posts whose
// content is genuinely step-shaped get an entry — most posts won't.
const HOWTO_STEPS = {
  'ai-visibility-checklist': {
    totalTime: 'PT40M',
    steps: [
      {
        name: 'Ask the question yourself, more than once',
        text: 'Open ChatGPT, Gemini, whatever you’ve got, and type the question a real customer would type — "best [what you do] in [where you are]." Don’t ask about your business by name. Ask the way a stranger would ask. Do it in two or three different tools if you can, because they genuinely don’t agree with each other.',
      },
      {
        name: 'Read what it says about the businesses it does name, not just who it names',
        text: 'If the model says "Business A is known for fast emergency response" and "Business B offers plumbing services," pay attention to which sentence you just read. One of those is a fact a model could find and repeat. The other is filler it generated because it had nothing sharper to say.',
      },
      {
        name: 'Go find that sharp sentence about yourself, and if it doesn’t exist yet, write it',
        text: 'Not "quality you can trust" — a model can’t repeat that, because it’s not a fact, it’s a mood. Something specific: what you actually do differently, who you’re actually for, a number if you have one worth saying. Put it in plain text on your site, not inside an image, not buried three clicks deep in a PDF.',
      },
      {
        name: 'Check that the basics are actually readable by something that isn’t a browser',
        text: 'Name, location, category, hours — in real text, not a logo graphic, not a JavaScript widget that never renders for anything that isn’t doing a full browser render pass.',
      },
      {
        name: 'Don’t stop at your own site',
        text: 'A lot of what these models pull from isn’t your homepage — it’s your Google Business Profile, directory listings, review sites, anywhere your name and category already sit together in public text.',
      },
      {
        name: 'Recheck in a month',
        text: 'These answers move. Models get updated, retrained, re-indexed, and an answer that named a competitor in June can name you in September for reasons that have nothing to do with anything you changed — or everything to do with it.',
      },
    ],
  },
};

// partials/nav.html includes <script type="module" src="/src/marketing/
// authNav.ts">, which the four Vite-built static pages (index.html etc.)
// get bundled/hashed automatically by vite build's own HTML pipeline. This
// script runs as plain post-build Node, so it has to resolve that same
// script to its real hashed path itself, or it ships the dead source path
// verbatim (dist has no /src/ directory). Looked up by the manifest
// entry's `name` field ("authNav", derived from the source filename)
// rather than by source path — confirmed by inspecting a real build's
// dist/.vite/manifest.json that authNav.ts has no top-level source-path
// key (it's pulled into a shared chunk since it's referenced identically
// from 4 separate HTML entries), only a hash-suffixed chunk key whose
// `name` field is the one stable thing to match on.
function resolveAuthNavAssetPath() {
  const manifestPath = path.join(distDir, '.vite', 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(
      `build-blog: expected Vite manifest at ${manifestPath} — did vite build run first, and is build.manifest enabled in vite.config.ts?`
    );
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const matches = Object.values(manifest).filter((entry) => entry.name === 'authNav');
  if (matches.length === 0) {
    throw new Error(
      'build-blog: no "authNav" entry found in the Vite manifest — src/marketing/authNav.ts may have been renamed or removed; update this lookup to match.'
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `build-blog: expected exactly one "authNav" manifest entry, found ${matches.length} — the lookup in resolveAuthNavAssetPath() is no longer unique enough.`
    );
  }
  return `/${matches[0].file}`;
}

// Set once at the start of main(), read by every pageShell() call below —
// simpler than threading it through buildPostPage()/buildIndexPage() as a
// parameter, since it's a single build-wide constant, not per-page data.
let authNavAssetPath;

// --- frontmatter: plain `key: value` lines between `---` fences. Simple on
// purpose — content/blog/*.md only ever needs title/description/date (plus
// an optional `updated` date, added 2026-09-14 for a real dateModified
// freshness signal — see buildPostPage()), no arrays or nesting, so a
// hand-rolled parser avoids a dependency (gray-matter et al.) for a format
// this small. -----------------------
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
<!--#include:llms-link-->

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
    .replace('/src/marketing/authNav.ts', authNavAssetPath)
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
  // Self-contained @graph, not a flat BlogPosting: this page is a separate
  // HTTP document from index.html, so a publisher @id-only reference would
  // point at a WebSite/Organization node most JSON-LD parsers can't
  // resolve unless it's also defined right here — same reasoning
  // privacy.html/terms.html's own comments give for duplicating these
  // nodes per document.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        url: `${siteUrl}/`,
        name: 'Foreground',
        publisher: { '@id': `${siteUrl}/#organization` },
      },
      {
        '@type': 'Organization',
        '@id': `${siteUrl}/#organization`,
        name: 'Foreground',
        url: `${siteUrl}/`,
        logo: `${siteUrl}/og-image.png`,
        founder: { '@type': 'Person', name: 'Marc de Ruijter', sameAs: FOUNDER_SAME_AS },
        foundingDate: '2026-07-29',
        slogan: 'Get in the foreground.',
        sameAs: FOUNDER_SAME_AS,
      },
      {
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.description,
        datePublished: post.date,
        // updated is an optional frontmatter field (added 2026-09-14) — a
        // real freshness signal for posts that get revised after
        // publishing, instead of dateModified always trailing
        // datePublished verbatim regardless of actual edits. Falls back to
        // post.date so existing posts (none of which set this field yet)
        // are unaffected.
        dateModified: post.updated || post.date,
        author: { '@type': 'Person', name: 'Marc de Ruijter', sameAs: FOUNDER_SAME_AS },
        publisher: { '@id': `${siteUrl}/#organization` },
        mainEntityOfPage: `${siteUrl}/blog/${post.slug}/`,
      },
      // BreadcrumbList — added 2026-09-15 (Phase 6), matching the pattern
      // the static pages (how-it-works.html etc.) already use; blog posts
      // previously had no breadcrumb schema at all.
      {
        '@type': 'BreadcrumbList',
        '@id': `${siteUrl}/blog/${post.slug}/#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/` },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${siteUrl}/blog/` },
          { '@type': 'ListItem', position: 3, name: post.title, item: `${siteUrl}/blog/${post.slug}/` },
        ],
      },
    ],
  };
  // HowTo — only for posts with a HOWTO_STEPS entry above (genuinely
  // step-shaped content, not every post). Added 2026-09-15 (Phase 6).
  const howTo = HOWTO_STEPS[post.slug];
  if (howTo) {
    jsonLd['@graph'].push({
      '@type': 'HowTo',
      '@id': `${siteUrl}/blog/${post.slug}/#howto`,
      name: post.title,
      description: post.description,
      totalTime: howTo.totalTime,
      mainEntityOfPage: `${siteUrl}/blog/${post.slug}/`,
      step: howTo.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: s.name, text: s.text })),
    });
  }
  const updatedNote = post.updated && post.updated !== post.date
    ? ` &middot; updated ${formatDate(post.updated)}`
    : '';
  const bodyHtml = `
  <article class="blog-post">
    <a class="blog-back" href="/blog/">&larr; All posts</a>
    <h1>${escapeHtml(post.title)}</h1>
    <div class="blog-meta">${formatDate(post.date)}${updatedNote}</div>
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

  // Same self-contained-@graph pattern as buildPostPage() and the four
  // static marketing pages — see buildPostPage()'s comment for why.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        url: `${siteUrl}/`,
        name: 'Foreground',
        publisher: { '@id': `${siteUrl}/#organization` },
      },
      {
        '@type': 'Organization',
        '@id': `${siteUrl}/#organization`,
        name: 'Foreground',
        url: `${siteUrl}/`,
        logo: `${siteUrl}/og-image.png`,
        founder: { '@type': 'Person', name: 'Marc de Ruijter', sameAs: FOUNDER_SAME_AS },
        foundingDate: '2026-07-29',
        slogan: 'Get in the foreground.',
        sameAs: FOUNDER_SAME_AS,
      },
      {
        '@type': 'CollectionPage',
        '@id': `${siteUrl}/blog/#webpage`,
        url: `${siteUrl}/blog/`,
        name: 'Blog — Foreground',
        isPartOf: { '@id': `${siteUrl}/#website` },
        publisher: { '@id': `${siteUrl}/#organization` },
      },
      {
        '@type': 'ItemList',
        itemListElement: posts.map((post, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: `${siteUrl}/blog/${post.slug}/`,
          name: post.title,
        })),
      },
    ],
  };

  return pageShell({
    title: 'Blog — Foreground',
    description: 'Notes on AI search visibility, GEO vs SEO, and what actually changes whether ChatGPT and Gemini mention your business.',
    canonicalPath: '/blog/',
    bodyHtml,
    extraHead: `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>`,
  });
}

// The 4 root marketing pages' <lastmod> in public/sitemap.xml is hand-set
// and goes stale the moment any of them is edited again. Rewrite it here
// at build time from each file's real last-commit date, so it self-updates
// instead of silently drifting. Falls back to today (the build date) if
// git has no history for a path (e.g. a shallow CI checkout) — still more
// accurate than a permanently frozen date.
const STATIC_PAGES = [
  { file: 'index.html', url: `${siteUrl}/` },
  { file: 'how-it-works.html', url: `${siteUrl}/how-it-works` },
  { file: 'privacy.html', url: `${siteUrl}/privacy` },
  { file: 'terms.html', url: `${siteUrl}/terms` },
];

function lastCommitDate(file) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', file], {
      cwd: rootDir,
      encoding: 'utf8',
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function updateStaticPageLastmods() {
  const sitemapPath = path.join(distDir, 'sitemap.xml');
  if (!existsSync(sitemapPath)) {
    console.warn('build-blog: dist/sitemap.xml not found, skipping static-page lastmod update');
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  let xml = readFileSync(sitemapPath, 'utf8');
  for (const { file, url } of STATIC_PAGES) {
    const date = lastCommitDate(file) || today;
    const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(<loc>${escapedUrl}</loc>\\s*<lastmod>)[^<]*(</lastmod>)`);
    xml = xml.replace(re, `$1${date}$2`);
  }
  writeFileSync(sitemapPath, xml);
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
  authNavAssetPath = resolveAuthNavAssetPath();
  const posts = loadPosts();

  // Runs even with zero posts — the sitemap's 4 static-page <lastmod>
  // values need to stay fresh independent of whether content/blog/ has
  // anything in it.
  updateStaticPageLastmods();

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
