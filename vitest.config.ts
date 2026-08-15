import { defineConfig } from 'vitest/config';

// Deliberately standalone, not an extension of vite.config.ts — that file
// pulls in the Netlify dev-server plugin, Tailwind, and a multi-page HTML
// build setup that a plain unit-test run of shared/aivis-core.mjs has no
// use for.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.mjs'],
  },
});
