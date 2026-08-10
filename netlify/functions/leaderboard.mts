// AIVis public leaderboard — the one function in this app with no auth
// check. Only returns companies that opted in via `is_public` (see
// companies.mts POST / company.mts PATCH) — every other company (including
// the founder's own is_legacy_import prospect-research entries) is invisible
// here by default. Response payload is deliberately minimal: never leaks
// owner_user_id, is_legacy_import, competitors, or any scan jsonb.
import type { Config } from '@netlify/functions';
import { sql } from './_shared/db.mts';
import { scoreBand } from '../../shared/aivis-core.mjs';

export default async (req: Request) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = sql();
  const url = new URL(req.url);
  const category = (url.searchParams.get('category') || '').trim();
  const region = (url.searchParams.get('region') || '').trim();

  if (!category || !region) {
    // Browse mode: distinct category/region combos among opted-in companies,
    // so the frontend can offer a picker instead of requiring free-text guesses.
    const combos = await db`
      SELECT category, region, count(*)::int AS count
      FROM public.companies
      WHERE is_public = true
      GROUP BY category, region
      ORDER BY count DESC, category ASC
    `;
    return new Response(JSON.stringify({ ok: true, combos }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Ranked mode: case/whitespace-insensitive match on category + region —
  // known limitation, doesn't merge near-duplicates like "Austin" vs
  // "Austin, TX" (see plan doc) — not solved in this pass.
  const rows = await db`
    SELECT
      c.id, c.brand, c.website, c.category, c.region,
      (
        SELECT s.score FROM public.scans s
        WHERE s.company_id = c.id
        ORDER BY s.generated_at DESC NULLS LAST
        LIMIT 1
      ) AS score
    FROM public.companies c
    WHERE c.is_public = true
      AND lower(trim(c.category)) = lower(trim(${category}))
      AND lower(trim(c.region)) = lower(trim(${region}))
  `;

  const ranked = rows
    .filter((r) => typeof r.score === 'number')
    .sort((a, b) => b.score - a.score)
    .map((r, i) => ({
      rank: i + 1,
      id: r.id,
      brand: r.brand,
      website: r.website,
      category: r.category,
      region: r.region,
      score: r.score,
      band: scoreBand(r.score),
    }));

  return new Response(JSON.stringify({ ok: true, category, region, leaderboard: ranked }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config: Config = {
  path: '/leaderboard',
};
