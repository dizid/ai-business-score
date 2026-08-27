// Shared "previous completed score" lookup — factored out of
// run-scan-background.mts (which used this inline for its regression-email
// check) so companies.mts's portfolio-dashboard query and any future caller
// reuse the exact same definition of "previous score" instead of each
// hand-rolling a slightly different one.
import type { NeonQueryFunction } from '@neondatabase/serverless';

// Most recent completed scan's score for a company, excluding one specific
// scan (pass the scan just written, so a company's own new row never counts
// as its own "previous" score). Returns null if there's no earlier
// completed scan (a company's very first scan, or every scan since is
// pending/failed).
export async function getPreviousCompletedScore(
  db: NeonQueryFunction<false, false>,
  companyId: string,
  excludeScanId: string
): Promise<number | null> {
  const rows = await db`
    SELECT score FROM public.scans
    WHERE company_id = ${companyId} AND id != ${excludeScanId} AND status = 'completed'
    ORDER BY generated_at DESC
    LIMIT 1
  `;
  return rows.length > 0 ? rows[0].score : null;
}
