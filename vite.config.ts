import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import netlifyPlugin from '@netlify/vite-plugin';

// Multi-page app: index.html, result.html, and history.html stay three
// independent entry points/URLs (pre-Milestone-4 legacy, slated for removal
// once the authenticated app shell fully replaces them), each mounting its
// own Vue app — this preserves the original URL structure and keeps the
// index page's step-2 `<form method="POST" action="/scan">` a plain native
// browser navigation, since the /scan redirect's URL fragment only survives
// a real navigation, not a client-side route change.
//
// `app.html` is different: the SaaS-pivot's authenticated dashboard IS a
// real vue-router SPA (see src/app/router.ts) — safe now because its data
// comes from authenticated API calls fetched by ID, not a URL fragment that
// a client-side route change would drop. netlify.toml's [[redirects]] rule
// rewrites any /app/* path to this entry so direct nav/refresh on nested
// routes (e.g. /app/companies/123) still resolves.
export default defineConfig({
  plugins: [vue(), tailwindcss(), netlifyPlugin()],
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        result: 'result.html',
        history: 'history.html',
        app: 'app.html',
      },
    },
  },
  resolve: {
    alias: { '@': '/src' },
  },
});
