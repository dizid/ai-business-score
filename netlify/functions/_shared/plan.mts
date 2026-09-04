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

// One-time single-scan purchase, added 2026-08-24 (Milestone 2 of the
// monetization plan) — a full scan + deep advice for one company, no
// subscription required, for anonymous lead-gen visitors and logged-in
// free-tier users who don't want to subscribe. (The Pro-only bulk top-up
// pack this comment used to distinguish itself from was removed
// 2026-09-04 — see TODO.md.)
export const SINGLE_SCAN_PRICE_USD = 19;

// Score-regression alert threshold, added 2026-08-26 alongside scheduled
// weekly re-scans (scheduled-rescan.mts). A drop of this many points or
// more from a company's prior completed scan fires a distinct alert email
// (sendScoreRegressionEmail) in addition to the routine scan-complete one —
// big enough to reflect a real regression (roughly a score-band jump), not
// just normal run-to-run noise in AI answers.
export const REGRESSION_ALERT_THRESHOLD = 15;

export function isPro(planTier: string | null | undefined): boolean {
  return planTier === 'pro';
}
