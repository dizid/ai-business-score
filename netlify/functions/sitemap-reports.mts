// Sitemap for public per-company report pages (/reports/:id) — separate from
// the static public/sitemap.xml (marketing pages) since this one is DB-
// generated and changes as users opt companies in/out. One row per company,
// its single latest completed public scan only.
import type { Config } from '@netlify/functions';
import { sql } from './_shared/db.mts';
import { escapeHtml } from './_shared/html.mts';

const SITE_URL = 'https://aivis-scan.netlify.app';

export default async (req: Request) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: { 'Content-Type': 'text/plain' } });
  }

  const db = sql();
  const rows = await db`
    SELECT DISTINCT ON (c.id) c.id, s.generated_at
    FROM public.companies c
    JOIN public.scans s ON s.company_id = c.id
    WHERE c.is_public = true AND s.status = 'completed'
    ORDER BY c.id, s.generated_at DESC
  `;

  const urlEntries = rows
    .map((row) => {
      const generatedAt = new Date(row.generated_at);
      const lastmod = Number.isNaN(generatedAt.getTime()) ? '' : generatedAt.toISOString();
      // row.id is a DB uuid, not free-typed user text, but escape it anyway —
      // defense in depth costs nothing here and keeps the "every DB-sourced
      // string goes through escapeHtml before reaching a response body" rule
      // exceptionless across this workstream.
      const loc = `${SITE_URL}/reports/${escapeHtml(String(row.id))}`;
      return `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
    },
  });
};

export const config: Config = {
  path: '/sitemap-reports.xml',
};
