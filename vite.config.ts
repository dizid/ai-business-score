import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import netlifyPlugin from '@netlify/vite-plugin';

// Multi-page app, deliberately not a Vue-Router SPA: index.html, result.html,
// and history.html stay three independent entry points/URLs, each mounting
// its own Vue app. This preserves the current URL structure and keeps the
// index page's step-2 `<form method="POST" action="/scan">` a plain native
// browser navigation — the /scan redirect's URL fragment only survives a real
// navigation, not a client-side route change.
export default defineConfig({
  plugins: [vue(), tailwindcss(), netlifyPlugin()],
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        result: 'result.html',
        history: 'history.html',
      },
    },
  },
  resolve: {
    alias: { '@': '/src' },
  },
});
