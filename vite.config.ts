import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import netlifyPlugin from '@netlify/vite-plugin';

// Two entry points. `result.html` is the pre-SaaS-pivot shareable result
// page — kept alive indefinitely (CEO decision, Milestone 5) so links
// already shared from the old stateless-link flow never break; it decodes
// a `#d=` URL fragment client-side and never calls the API.
//
// `app.html` is the real product now: a full vue-router SPA (see
// src/app/router.ts) — safe as an SPA because its data comes from
// authenticated API calls fetched by ID, not a URL fragment a client-side
// route change would drop. netlify.toml's [[redirects]] rule rewrites any
// /app/* path to this entry so direct nav/refresh on nested routes (e.g.
// /app/companies/123) still resolves. index.html and history.html (the
// passphrase-gated scan form and history list) were retired in Milestone 5
// once the authenticated app shell covered the same ground.
export default defineConfig({
  plugins: [vue(), tailwindcss(), netlifyPlugin()],
  build: {
    rollupOptions: {
      input: {
        result: 'result.html',
        app: 'app.html',
      },
    },
  },
  resolve: {
    alias: { '@': '/src' },
  },
});
