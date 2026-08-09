// AIVis scan trigger — Milestone 5 of the SaaS-pivot plan (see
// /home/marc/.claude/plans/cheerful-leaping-dragon.md). Creates a pending
// scan row and fires a Background Function to do the actual 20-30s of
// work, returning almost immediately — confirmed via the Milestone 0
// spike that a background-function trigger returns in well under 1s on
// this site's plan. Auth + company-ownership scoped; replaces the old
// passphrase-gated, synchronous, Blobs-backed /scan entirely.
import type { Config } from '@netlify/functions';
import { requireAuth, authErrorResponse, AuthError } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let userId: string;
  try {
    userId = await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }

  let body: { company_id?: string; url_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const companyId = body.company_id;
  if (!companyId) {
    return new Response(JSON.stringify({ error: 'company_id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = sql();
  const companies = await db`
    SELECT * FROM public.companies WHERE id = ${companyId} AND owner_user_id = ${userId}
  `;
  if (companies.length === 0) {
    return new Response(JSON.stringify({ error: 'Company not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const company = companies[0];

  // Multi-URL support: url_id picks which of the company's tracked URLs
  // this scan targets. Omitted (old callers, or a company with only its
  // original URL) falls back to the primary company_urls row — every
  // company has one since the 2026-08-09 backfill migration, with
  // company.website itself as the ultimate fallback for safety.
  let targetUrl: string = company.website;
  if (body.url_id) {
    const urls = await db`
      SELECT url FROM public.company_urls WHERE id = ${body.url_id} AND company_id = ${companyId}
    `;
    if (urls.length === 0) {
      return new Response(JSON.stringify({ error: 'url_id does not belong to this company' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    targetUrl = urls[0].url;
  } else {
    const primary = await db`
      SELECT url FROM public.company_urls WHERE company_id = ${companyId} AND is_primary = true LIMIT 1
    `;
    if (primary.length > 0) targetUrl = primary[0].url;
  }

  const inserted = await db`
    INSERT INTO public.scans (id, company_id, status, brand, website, category)
    VALUES (gen_random_uuid(), ${companyId}, 'pending', ${company.brand}, ${targetUrl}, ${company.category})
    RETURNING id
  `;
  const scanId = inserted[0].id as string;

  const origin = new URL(req.url).origin;
  try {
    await fetch(`${origin}/run-scan-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scanId }),
    });
  } catch (err) {
    console.error(`Failed to trigger background scan for ${scanId}:`, err);
    await db`
      UPDATE public.scans SET status = 'failed', error_message = 'Failed to start scan'
      WHERE id = ${scanId}
    `;
    return new Response(JSON.stringify({ error: 'Failed to start scan' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, scanId }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config: Config = {
  path: '/scan',
};
