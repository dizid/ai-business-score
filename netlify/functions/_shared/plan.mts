// Free-tier limits, centralized so they're tunable in one place instead of
// scattered magic numbers across scan.mts/companies.mts. Pro is unlimited.
export const FREE_PLAN_COMPANY_LIMIT = 1;
export const FREE_PLAN_SCAN_LIMIT = 3;

export function isPro(planTier: string | null | undefined): boolean {
  return planTier === 'pro';
}
