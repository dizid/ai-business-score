import { createRouter, createWebHistory } from 'vue-router';
import { isAuthenticated, restoreSession } from './lib/auth';

const routes = [
  { path: '/app', name: 'companies', component: () => import('./views/CompaniesListView.vue'), meta: { requiresAuth: true } },
  { path: '/app/login', name: 'login', component: () => import('./views/LoginView.vue') },
  { path: '/app/signup', name: 'signup', component: () => import('./views/SignupView.vue') },
  {
    path: '/app/companies/:id',
    name: 'company',
    component: () => import('./views/CompanyDetailView.vue'),
    meta: { requiresAuth: true },
    props: true,
  },
  {
    path: '/app/billing/success',
    name: 'billing-success',
    component: () => import('./views/BillingSuccessView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/app/privacy',
    name: 'privacy',
    component: () => import('./views/PrivacyView.vue'),
    // No requiresAuth — a privacy policy has to be readable before signup.
  },
  {
    path: '/app/terms',
    name: 'terms',
    component: () => import('./views/TermsView.vue'),
    // No requiresAuth — same reasoning as /app/privacy.
  },
  {
    path: '/app/how-it-works',
    name: 'how-it-works',
    component: () => import('./views/HowItWorksView.vue'),
    // No requiresAuth — genuine product content, shareable pre-signup.
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

export default router;
