import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import netlifyPlugin from '@netlify/vite-plugin';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveIncludes } from './scripts/html-includes.mjs';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const partialsDir = path.join(rootDir, 'partials');

// Expands <!--#include:name--> markers (reading partials/name.html) into
// each Vite HTML entry, at build time — see partials/ for what's shared
// across index.html/how-it-works.html/privacy.html/terms.html/app.html and
// scripts/build-blog.mjs (the last one reads the same partials directly,
// since it runs as plain Node after this build, not through Vite).
// `order: 'pre'` is required, not cosmetic: Vite's built-in htmlEnvHook
// (the %VITE_...% replacer) is appended to the *end* of Vite's internal
// preHooks array, so a plugin hook registered with order:'pre' runs before
// it — needed so partials/ga4.html's own %VITE_GA4_MEASUREMENT_ID% token
// is already inlined into the page by the time htmlEnvHook substitutes it.
// A 'normal' or 'post' order hook runs too late (Rollup's generateBundle
// phase, after htmlEnvHook already ran), leaving the literal token in
// dist/ unresolved.
function htmlIncludesPlugin() {
  return {
    name: 'html-includes',
    transformIndexHtml: {
      order: 'pre' as const,
      handler: (html: string) => resolveIncludes(html, partialsDir),
    },
  };
}

// Three entry points. `result.html` is the pre-SaaS-pivot shareable result
// page — kept alive indefinitely (CEO decision, Milestone 5) so links
// already shared from the old stateless-link flow never break; it decodes
// a `#d=` URL fragment client-side and never calls the API.
//
// `app.html` is the real product: a full vue-router SPA (see
// src/app/router.ts) — safe as an SPA because its data comes from
// authenticated API calls fetched by ID, not a URL fragment a client-side
// route change would drop. netlify.toml's [[redirects]] rule rewrites any
// /app/* path to this entry so direct nav/refresh on nested routes (e.g.
// /app/companies/123) still resolves.
//
// `index.html` (added for the monetization/marketing push) is the public
// landing page at `/` — plain static HTML/CSS, not a Vue mount. Several
// major AI crawlers (GPTBot, PerplexityBot, ClaudeBot) don't execute
// client-side JS, so the pitch has to exist as real HTML, not something a
// Vue mount renders after the fact.
//
// `how-it-works.html`, `privacy.html`, `terms.html` (converted from
// app.html SPA routes to static entries here) are the same story: real,
// valuable content that used to live behind vue-router (`/app/how-it-works`
// etc.) under app.html's blanket noindex — AI crawlers never saw it since
// they don't execute the JS that would've rendered it. Now plain static
// HTML/CSS at clean URLs (`/how-it-works`, `/privacy`, `/terms` via
// netlify.toml redirects), same non-Vue pattern as index.html, and
// genuinely indexable. index.html plus these three are the only pages
// meant to be indexed; app.html/result.html both keep noindex.
export default defineConfig({
  plugins: [htmlIncludesPlugin(), vue(), tailwindcss(), netlifyPlugin()],
  build: {
    rollupOptions: {
      input: {
        result: 'result.html',
        app: 'app.html',
        marketing: 'index.html',
        howItWorks: 'how-it-works.html',
        privacy: 'privacy.html',
        terms: 'terms.html',
      },
    },
  },
  resolve: {
    alias: { '@': '/src' },
  },
});
