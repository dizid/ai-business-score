// Free-tier limits, centralized so they're tunable in one place instead of
// scattered magic numbers across scan.mts/companies.mts. Pro is unlimited on
// company count and lifetime scan count, but see PRO_PLAN_MONTHLY_SCAN_LIMIT
// below — "unlimited" stopped being literally true once model count started
// growing (see aivis-core.mjs's MODELS comment).
export const FREE_PLAN_COMPANY_LIMIT = 1;
export const FREE_PLAN_SCAN_LIMIT = 3;

// Pro fair-use cap, added 2026-08-13 alongside MODELS growing from 2 to 4.
// Monthly, not lifetime like FREE_PLAN_SCAN_LIMIT above — Pro is a real
// working plan, not a one-time allotment. Originally sized off actual
// Perplexity cost: a scan was 20 calls across 4 pricier-mixed models (was 2
// cheaper ones), roughly $0.30-0.80 in Perplexity spend per scan — 20
// scans/month capped worst-case per-Pro-user API exposure at roughly
// $6-16/month against a fixed monthly subscription price.
//
// Raised 20 -> 50 on 2026-09-07, sized against a since-stale 2-provider/
// 10-call-per-scan cost basis (the 2026-09-04 free-only cost-control pass).
// That basis was never revisited when HOSTED_MODELS grew back to 5
// providers/25 calls on 2026-09-14 — a real per-provider cost check on
// 2026-09-16 (actual scans.total_tokens from live scans x current
// published per-token/per-tool-call pricing across all 5 providers) found
// a single scan can run $2-4, meaning a Pro user maxing out 50 scans/month
// could cost $100-200 in AI spend against a $99/month subscription — a
// real loss on power users, not sized as such deliberately. Dropped 50 -> 20
// the same day: caps worst-case AI spend per Pro user at roughly $40-80/month
// (20 scans x $2-4), a real margin under the $129/month price set the same
// day (see root CLAUDE.md's Deployment section). Revisit if HOSTED_MODELS'
// provider count or per-call cost changes again.
export const PRO_PLAN_MONTHLY_SCAN_LIMIT = 20;

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
