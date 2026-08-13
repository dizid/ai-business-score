// Free-tier limits, centralized so they're tunable in one place instead of
// scattered magic numbers across scan.mts/companies.mts. Pro is unlimited on
// company count and lifetime scan count, but see PRO_PLAN_MONTHLY_SCAN_LIMIT
// below — "unlimited" stopped being literally true once model count started
// growing (see aivis-core.mjs's MODELS comment).
export const FREE_PLAN_COMPANY_LIMIT = 1;
export const FREE_PLAN_SCAN_LIMIT = 3;

// Pro fair-use cap, added 2026-08-13 alongside MODELS growing from 2 to 4.
// Monthly, not lifetime like FREE_PLAN_SCAN_LIMIT above — Pro is a real
// working plan, not a one-time allotment. Sized off actual Perplexity cost:
// a scan is 20 calls across 4 pricier-mixed models (was 2 cheaper ones),
// roughly $0.30-0.80 in Perplexity spend per scan — 20 scans/month caps
// worst-case per-Pro-user API exposure at roughly $6-16/month against a
// fixed monthly subscription price, without meaningfully constraining any
// real usage pattern observed so far.
export const PRO_PLAN_MONTHLY_SCAN_LIMIT = 20;

export function isPro(planTier: string | null | undefined): boolean {
  return planTier === 'pro';
}
