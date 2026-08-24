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

// Pro top-up scan packs, added 2026-08-23 — Pro users who hit the fair-use
// cap above can buy extra scans instead of just waiting for next month.
// $19/10 leaves healthy margin over the ~$0.30-0.80/scan API cost noted
// above, and lands close to competitor per-prompt pricing at their entry
// tier (Otterly $29/15 ≈ $1.93, Peec AI $95/50 ≈ $1.90). Single pack size
// for V1 — no tiered options.
export const SCAN_CREDIT_PACK_SIZE = 10;
export const SCAN_CREDIT_PACK_PRICE_USD = 19;

// Cap on packs purchasable per calendar month — a shared-infrastructure
// guardrail, not a margin one: run-scan-background.mts's openai/Perplexity
// lane has a hard concurrency limit of 1 and three documented production
// rate-limit incidents, so nothing should let one account monopolize it.
export const MAX_CREDIT_PACKS_PER_MONTH = 3;

// One-time single-scan purchase, added 2026-08-24 (Milestone 2 of the
// monetization plan) — a full scan + deep advice for one company, no
// subscription required. Distinct SKU from SCAN_CREDIT_PACK_* above (that
// one is Pro-only, bulk, extends the monthly cap); this one is for
// anonymous lead-gen visitors and logged-in free-tier users who don't want
// to subscribe.
export const SINGLE_SCAN_PRICE_USD = 19;

export function isPro(planTier: string | null | undefined): boolean {
  return planTier === 'pro';
}
