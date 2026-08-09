// AIVis companies — list/create, auth-scoped. Part of Milestone 4 of the
// SaaS-pivot plan (see /home/marc/.claude/plans/cheerful-leaping-dragon.md):
// the authenticated app shell's first real data endpoint.
import type { Config } from '@netlify/functions';
import { requireAuth, authErrorResponse, AuthError } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';
import { normalizeUrl } from '../../shared/aivis-core.mjs';

export default async (req: Request) => {
  let userId: string;
  try {
    userId = await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }

  const db = sql();

  if (req.method === 'GET') {
    const companies = await db`
      SELECT
        c.*,
        (SELECT count(*)::int FROM public.scans s WHERE s.company_id = c.id) AS scan_count,
        (
          SELECT s.score FROM public.scans s
          WHERE s.company_id = c.id
          ORDER BY s.generated_at DESC NULLS LAST
          LIMIT 1
        ) AS latest_score
      FROM public.companies c
      WHERE c.owner_user_id = ${userId}
      ORDER BY c.created_at DESC
    `;
    return new Response(JSON.stringify({ ok: true, companies }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (req.method === 'POST') {
    // FK target for companies.owner_user_id — first write for a given user
    // creates their profile row on demand rather than requiring a separate
    // provisioning step.
    await db`INSERT INTO public.user_profiles (user_id) VALUES (${userId}) ON CONFLICT (user_id) DO NOTHING`;

    let body: Record<string, string>;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const brand = (body.brand || '').trim();
    const website = (body.website || '').trim();
    if (!brand || !website) {
      return new Response(JSON.stringify({ error: 'brand and website are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const category = (body.category || '').trim();
    const useCase = (body.use_case || '').trim();
    const region = (body.region || '').trim();
    const customerSegment = (body.customer_segment || '').trim();
    const competitors = (body.competitors || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const inserted = await db`
      INSERT INTO public.companies (
        owner_user_id, brand, website, category, use_case, region, customer_segment, competitors
      ) VALUES (
        ${userId}, ${brand}, ${normalizeUrl(website)}, ${category}, ${useCase}, ${region}, ${customerSegment}, ${competitors}
      )
      RETURNING *
    `;
    const company = inserted[0];

    // Multi-URL support: every company always has a primary company_urls
    // row equal to its website — CompanyDetailView's URL selector and
    // scan.mts's url_id resolution both rely on at least one row existing.
    // Existing companies got this via the 2026-08-09 backfill migration;
    // new ones get it here.
    await db`
      INSERT INTO public.company_urls (company_id, url, is_primary)
      VALUES (${company.id}, ${company.website}, true)
    `;

    return new Response(JSON.stringify({ ok: true, company }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config: Config = {
  path: '/companies',
};
