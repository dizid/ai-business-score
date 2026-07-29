# Migration Plan: `web/` from Vanilla JS to Vite + TypeScript + Vue

This document outlines the steps to migrate `web/` from its current vanilla
JS/HTML structure to Vite + TypeScript + Vue 3, without breaking anything
that currently works.

**Goal:** a real build pipeline and typed tooling, with **zero production
downtime and zero regression** — the three existing pages (`index.html`,
`result.html`, `history.html`) get rewritten as Vue apps with full parity
*before* anything is cut over, not after.

**Hard constraints this plan must not violate** (each caused a concrete bug
in an earlier draft of this plan — kept here so they don't get reintroduced):

1. **`web/shared/aivis-core.mjs` stays exactly where it is, untouched,
   unconverted.** It's imported by `proof-script/index.mjs` (`../web/shared/
   aivis-core.mjs`, run via plain `node index.mjs` — zero deps, zero
   transpilation, no TypeScript support at all). Moving or converting this
   file to `.ts` breaks proof-script outright. It stays `.mjs` at its
   current path; the new Vue app imports it from there too.
2. **No placeholder window in production.** `result.html` (523 lines: score
   ring, scoreboard, advice cards — the most recently and carefully built
   part of this app) and `history.html` are rewritten *in place*, in full,
   before cutover. At no point does production show a "this page is
   migrating" stub.
3. **The native `<form method="POST" action="/scan">` submit in the index
   flow's step 2 must stay a native form submit.** Only a real browser
   navigation carries the `/scan` redirect's URL fragment through — not
   `fetch`, not `axios`, no exceptions, even though the rest of the page is
   now Vue-driven.
4. **Deploys currently happen via manual Netlify MCP `deploy-site` upload**
   (`web/netlify.toml` has no `[build] command` today). Switching to
   `command = "npm run build"` only works if Netlify itself runs builds
   (git-connected CI) — that has to actually be set up, not just assumed.
5. **Don't silently regress dependency versions or config.** Keep
   `@netlify/blobs` at its currently-installed `^8.2.0` (not an older pin).
   Use current stable Tailwind v4, not an alpha. Keep the existing
   `[functions] node_bundler = "esbuild"` directive in `netlify.toml`.

---

## Phase 1: Tooling & config

### Step 1: `web/package.json`

Preserve `@netlify/blobs`. Use Tailwind v4's Vite plugin (`@tailwindcss/
vite`) instead of the old PostCSS + `tailwind.config.js` setup — v4 is
CSS-first (`@theme {}`), matching this project's standing preference, and
needs no separate PostCSS wiring.

```json
{
  "name": "aivis-web",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview",
    "type-check": "vue-tsc --noEmit"
  },
  "dependencies": {
    "@netlify/blobs": "^8.2.0",
    "vue": "^3.5.0"
  },
  "devDependencies": {
    "@netlify/vite-plugin": "^2.1.1",
    "@tailwindcss/vite": "^4.1.0",
    "@tsconfig/node18": "^18.2.4",
    "@types/node": "^18.19.39",
    "@vitejs/plugin-vue": "^5.0.5",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.5.3",
    "vite": "^5.3.3",
    "vue-tsc": "^2.0.26"
  }
}
```

Install from `web/`: `npm install`.

### Step 2: `web/tsconfig.json` / `web/tsconfig.node.json`

Standard Vue 3 + Vite setup, with one addition: `"allowJs": true`. The
shared core stays plain `.mjs` (see constraint 1), so both Vite and
`vue-tsc` need to resolve untyped JS without erroring.

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "strict": true,
    "allowJs": true,
    "jsx": "preserve",
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "lib": ["ESNext", "DOM"],
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts", "src/**/*.tsx", "src/**/*.vue"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

### Step 3: `web/vite.config.ts`

**Multi-page app, not a single-page Vue-Router SPA.** Three independent Vue
app instances, one per existing URL — this preserves the current URL
structure and removes any temptation to route the `/scan` step through
client-side navigation (which would break constraint 3).

```typescript
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import netlifyPlugin from '@netlify/vite-plugin';

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
```

### Step 4: `web/netlify.toml`

```toml
[build]
  command = "npm run build"
  publish = "dist"
  functions = "netlify/functions"

[functions]
  node_bundler = "esbuild"

[dev]
  command = "npm run dev"
  targetPort = 5173
```

**Operational prerequisite (do this before relying on the `[build]` command
above):** Netlify only runs `command` for git-connected sites or configured
deploy hooks. The site is currently deployed via manual `deploy-site`
uploads with no git connection — link the Netlify site to this repo (or set
up a deploy hook) via the Netlify dashboard before cutover, otherwise
`npm run build` never runs and the site serves stale/missing output.

### Step 5: `.gitignore`

Add `web/dist` (build output). `node_modules/` is already covered by the
existing top-level rule.

---

## Phase 2: Restructure into `src/`, full parity, no deletions until verified

The three existing `.html` files are rewritten **in place** as thin Vite
entry shells (mount div + module script), not deleted. Their current inline
`<style>`/markup/logic moves into a corresponding Vue app under `src/`.

```
web/src/
  shared/
    theme.css      # @import "tailwindcss"; + @theme {} mapping the existing
                    # --bg/--accent/--good/--warning/--serious/--critical
                    # tokens once, instead of hand-copied into 3 files
  index/
    main.ts
    App.vue        # step 1 (fetch → /enrich) + step 2 (native form POST → /scan)
  result/
    main.ts
    App.vue        # score ring, scoreboard, advice cards, validatePayload()
  history/
    main.ts
    App.vue        # list from GET /history
```

Example shell (repeat per page, swapping the entry path):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <title>AIVis — AI search visibility check</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/index/main.ts"></script>
  </body>
</html>
```

```typescript
// web/src/index/main.ts
import '../shared/theme.css';
import { createApp } from 'vue';
import App from './App.vue';

createApp(App).mount('#app');
```

### Porting notes

- **`index/App.vue`** — step 1's `fetch()` to `/enrich` ports directly and
  can use Vue reactivity freely. Step 2's `<form>` must remain a plain
  native HTML form element posting to `/scan` (constraint 3) — bind/validate
  the inputs reactively, but don't intercept the final submit with
  `preventDefault()` + fetch.
- **`result/App.vue`** — port `validatePayload()` verbatim: score bounds
  0–100 or `null`; `competitorTallies` capped at 12 with `mentionCount <=
  completedCalls` / `beatBrandCount <= mentionCount`; `advice` capped at 3
  with enum checks on `id`/`tone`, each `params` field re-validated
  individually at render time. This is the only thing standing between a
  forged `#d=` link and the render path — don't weaken it in translation.
  **Import `scoreBand` (and any other pure function currently hand-copied)
  directly from `../shared/aivis-core.mjs`** instead of re-deriving it by
  hand — this fixes the manual-sync burden the old vanilla-JS version had no
  choice but to accept (no module graph across plain `<script>` files).
- **`history/App.vue`** — port the `GET /history?passphrase=...` fetch and
  card rendering; each card still links to `/result.html#d=<encoded>` using
  the persisted `encoded` string as-is, no re-encoding client-side.
- **`shared/theme.css`** — the `@theme {}` block maps `--color-*` tokens to
  the *current* hand-tuned hex values (light block + dark `@media`/
  `[data-theme]` overrides copied from `result.html`), not Tailwind's
  default palette. Tailwind utilities are additive for layout; they must not
  replace the existing dataviz-skill-derived status colors.

**Netlify functions are untouched.** `web/netlify/functions/scan.mts` and
`enrich.mts` keep importing `../../shared/aivis-core.mjs` exactly as today —
the path doesn't change because the file doesn't move.

---

## Phase 3: Verification (before touching deploy/cutover)

1. `npm run dev` — manually walk the full flow for all three pages: enrich
   → scan → result redirect (fragment intact) → history list. No console
   errors. Passphrase gating still enforced on both `/enrich` and `/scan`.
2. `npm run type-check` — clean.
3. `npm run build` — succeeds; `dist/` contains all three HTML entries and
   their bundled assets.
4. Visual check of `result.html` against current production specifically —
   score ring proportions, scoreboard bar emphasis color, advice card border
   colors/tags — this is the page most at risk of a quiet styling
   regression during translation.
5. `proof-script/index.mjs --dry-run` still runs unmodified — proves the
   shared core wasn't touched in a way that breaks its other consumer.

---

## Phase 4: Cutover

1. Merge to `main` only once Phase 3 passes in full.
2. Link the Netlify site to the git repo (or configure a deploy hook) — see
   the operational prerequisite in Phase 1, Step 4.
3. Push → Netlify CI runs `npm run build` → publishes `dist/`.
4. Post-deploy smoke test on the real production URL: one full `/scan` run
   end-to-end, confirm it appears in `/history`, confirm functions still
   read `PERPLEXITY_API_KEY` / `SCAN_PASSPHRASE` (env vars are site-level and
   shouldn't be affected by the build-mechanism change — verify, don't
   assume).

---

## Phase 5: Update docs

`CLAUDE.md` has several claims that become false after this migration —
update them, don't leave them stale:

- "No build step... Node 18+ only" → describe the new Vite/TypeScript build.
- The "Hosted site" deploy description (manual `deploy-site` MCP upload) →
  describe the new git-connected Netlify CI flow.
- Note that `aivis-core.mjs` remains untouched/canonical and is now also
  imported by the Vue app directly — the "single source of truth" claim
  still holds, and the old note about `result.html` hand-duplicating
  `scoreBand()` can be removed since it's now a real import.
- `web/package.json`'s description field (the old one said "no build
  step") needs rewriting to match reality.

Update `TODOS.md`'s status block to record the migration as shipped, same
pattern as the existing 2026-07-29 entry.

---

## Verification checklist

- [ ] `npm run type-check` clean
- [ ] `npm run build` produces `dist/` with 3 HTML entries
- [ ] `npm run dev`: manual walk of enrich→scan→result→history, no console errors
- [ ] `proof-script/index.mjs --dry-run` still runs unmodified
- [ ] Real `/scan` smoke test against deployed production URL after cutover
- [ ] Visual check of `result.html` dashboard against pre-migration screenshots
- [ ] `CLAUDE.md` and `TODOS.md` updated to match the new reality
