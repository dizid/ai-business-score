// AIVis company URLs — POST to add another tracked URL for a company,
// DELETE to remove one. Auth + company-ownership scoped, same pattern as
// company.mts/companies.mts. Added 2026-08-09 for multi-URL support: a
// company can track several URLs, each with its own independent scan
// history (no cross-URL aggregation) — this endpoint manages that list;
// scan.mts resolves which URL a given scan targets via url_id.
import type { Config, Context } from '@netlify/functions';
import { requireAuth, authErrorResponse, AuthError } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';
import { normalizeUrl } from '../../shared/aivis-core.mjs';

export default async (req: Request, context: Context) => {
  let userId: string;
  try {
    userId = await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }

  const companyId = context.params.id;
  const db = sql();

  const companies = await db`
    SELECT id FROM public.companies WHERE id = ${companyId} AND owner_user_id = ${userId}
  `;
  if (companies.length === 0) {
    return new Response(JSON.stringify({ error: 'Company not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (req.method === 'POST') {
    let body: { url?: string; label?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const url = (body.url || '').trim();
    if (!url) {
      return new Response(JSON.stringify({ error: 'url is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const label = (body.label || '').trim() || null;

    const inserted = await db`
      INSERT INTO public.company_urls (company_id, url, label, is_primary)
      VALUES (${companyId}, ${normalizeUrl(url)}, ${label}, false)
      RETURNING *
    `;
    return new Response(JSON.stringify({ ok: true, url: inserted[0] }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (req.method === 'DELETE') {
    const urlId = context.params.urlId;
    if (!urlId) {
      return new Response(JSON.stringify({ error: 'urlId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // The primary URL can't be removed — every company must always have at
    // least one trackable URL (it's what /scan falls back to when no
    // url_id is given, and what the frontend always shows as a default).
    const deleted = await db`
      DELETE FROM public.company_urls
      WHERE id = ${urlId} AND company_id = ${companyId} AND is_primary = false
      RETURNING id
    `;
    if (deleted.length === 0) {
      return new Response(
        JSON.stringify({ error: 'URL not found, or the primary URL cannot be removed' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config: Config = {
  path: ['/companies/:id/urls', '/companies/:id/urls/:urlId'],
};
