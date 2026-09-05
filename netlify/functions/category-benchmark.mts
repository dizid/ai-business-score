// Category benchmark: "you vs. businesses like yours" — a pure server-side
// aggregate over scans/companies already in Postgres. Zero new data
// collection, zero new LLM cost — this is the one genuinely new metric from
// the 2026-09 scan-results improvement pass that isn't just a re-presentation
// of data already fetched per-scan.
//
// GET /category-benchmark?company_id=<uuid>, auth + ownership-scoped like
// company.mts (the caller must own the company being benchmarked), even
// though the aggregate query below reads other tenants' companies in the
// same category to build the comparison.
//
// Privacy: only ever returns a count + avg/median — never another
// company's name, score, or any per-row detail. Cross-tenant data has been
// treated as sensitive here before (see netlify/functions/CLAUDE.md's
// companies.is_public entry — a public-report-link feature was rejected
// twice); this endpoint deliberately stays aggregate-only rather than
// re-opening that.
//
// Gated on a minimum sample size before returning real numbers. A live
// check against production data (2026-09-05, via Neon MCP) found real
// `companies.category` strings are still highly fragmented free text
// (e.g. "semiconductor lithography equipment manufacturer" vs. "...
// supplier" never match each other as the same category) — the largest
// real category had only 2-3 distinct companies. So this returns
// "not enough data yet" for nearly every category today. That's expected,
// not a bug — it gets more useful automatically as real usage grows, no
// rework needed later.
import type { Config } from '@netlify/functions';
import { requireAuth, authErrorResponse, AuthError } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';
import { corsHeaders, handleOptions } from './_shared/cors.mts';

const MIN_CATEGORY_SAMPLE_SIZE = 5;

export default async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  let userId: string;
  try {
    userId = await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }

  const url = new URL(req.url);
  const companyId = url.searchParams.get('company_id');
  if (!companyId) {
    return new Response(JSON.stringify({ error: 'company_id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  const db = sql();

  // Same ownership check as company.mts — the caller must own the company
  // being benchmarked, even though the aggregate below reads other tenants'
  // rows (read-only, anonymized) to build the comparison.
  const companies = await db`
    SELECT category FROM public.companies WHERE id = ${companyId} AND owner_user_id = ${userId}
  `;
  if (companies.length === 0) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  const category = (companies[0].category || '').trim();
  if (!category) {
    return new Response(
      JSON.stringify({ ok: true, category: '', companyCount: 0, avgScore: null, medianScore: null, sufficientData: false, minSampleSize: MIN_CATEGORY_SAMPLE_SIZE }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } },
    );
  }

  // One row per OTHER company in the same category (case/whitespace
  // normalized), its most recent completed score in the last 90 days — not
  // every historical scan, so a frequently-rescanned company doesn't
  // dominate the average the way a raw per-scan GROUP BY would. Same
  // "don't average in a stale score" reasoning as companies.mts's own
  // portfolio-dashboard query.
  const rows = await db`
    WITH latest_per_company AS (
      SELECT DISTINCT ON (c.id) s.score
      FROM public.scans s
      JOIN public.companies c ON c.id = s.company_id
      WHERE lower(trim(c.category)) = lower(${category})
        AND s.status = 'completed'
        AND s.score IS NOT NULL
        AND s.generated_at >= now() - interval '90 days'
        AND c.id != ${companyId}
      ORDER BY c.id, s.generated_at DESC
    )
    SELECT
      count(*)::int AS company_count,
      avg(score)::float AS avg_score,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY score) AS median_score
    FROM latest_per_company
  `;

  const row = rows[0] || { company_count: 0, avg_score: null, median_score: null };
  const companyCount = row.company_count ?? 0;
  const sufficientData = companyCount >= MIN_CATEGORY_SAMPLE_SIZE;

  return new Response(
    JSON.stringify({
      ok: true,
      category,
      companyCount,
      avgScore: sufficientData && row.avg_score !== null ? Math.round(row.avg_score) : null,
      medianScore: sufficientData && row.median_score !== null ? Math.round(row.median_score) : null,
      sufficientData,
      minSampleSize: MIN_CATEGORY_SAMPLE_SIZE,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } },
  );
};

export const config: Config = {
  path: '/category-benchmark',
};
