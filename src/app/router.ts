import { createRouter, createWebHistory } from 'vue-router';
import { isAuthenticated, restoreSession } from './lib/auth';

// privacy/terms/how-it-works used to live here as SPA routes nested under
// this shell. Converted to static HTML pages (privacy.html, terms.html,
// how-it-works.html at the repo root, served at clean top-level URLs via
// netlify.toml redirects) since app.html carries a blanket noindex and
// requires JS to render — AI crawlers (GPTBot, ClaudeBot, PerplexityBot)
// never saw that content regardless of the per-page robots intent. Removed
// here rather than kept as duplicate routes: one canonical URL per page
// avoids a duplicate-content SEO penalty. App.vue's footer now links to the
// static pages with plain <a> tags instead of router-link.
const routes = [
  { path: '/app', name: 'companies', component: () => import('./views/CompaniesListView.vue'), meta: { requiresAuth: true, title: 'Your companies — Foreground' } },
  { path: '/app/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { title: 'Log in — Foreground' } },
  { path: '/app/signup', name: 'signup', component: () => import('./views/SignupView.vue'), meta: { title: 'Sign up — Foreground' } },
  {
    path: '/app/companies/:id',
    name: 'company',
    component: () => import('./views/CompanyDetailView.vue'),
    meta: { requiresAuth: true, title: 'Foreground' }, // real title set dynamically elsewhere (other workstream)
    props: true,
  },
  {
    path: '/app/billing/success',
    name: 'billing-success',
    component: () => import('./views/BillingSuccessView.vue'),
    meta: { requiresAuth: true, title: 'Billing — Foreground' },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  await restoreSession();

  if (to.meta.requiresAuth && !isAuthenticated.value) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if ((to.name === 'login' || to.name === 'signup') && isAuthenticated.value) {
    return { name: 'companies' };
  }
  return true;
});

router.afterEach((to) => {
  document.title = (to.meta.title as string) || 'Foreground';
});

export default router;
