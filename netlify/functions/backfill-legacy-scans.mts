// Milestone 3 (SaaS-pivot plan, /home/marc/.claude/plans/cheerful-leaping-dragon.md):
// one-off import of the pre-pivot `aivis-scans` Blobs store into Neon
// Postgres. The caller (an authenticated user) becomes the owner of every
// imported company, tagged is_legacy_import=true since this is the
// founder's own prospect-research history (scans of OTHER businesses for
// outbound), not "the user's own company." Idempotent — safe to re-run,
// skips blobs already imported (matched by legacy_blob_key).
//
// Throwaway — delete this file once the real backfill has been run against
// the account that will actually be used going forward.

import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { requireAuth, authErrorResponse, AuthError } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';
import { normalizeUrl } from '../../shared/aivis-core.mjs';

interface LegacyScan {
  id: string;
  brand?: string;
  website?: string;
  category?: string;
  citedCount?: number;
  completedCalls?: number;
  failedCalls?: number;
  ambiguousBrandFlag?: boolean;
  perPromptRank?: unknown[];
  competitorTallies?: unknown[];
  rawResponses?: unknown[];
  score?: number | null;
  advice?: unknown[];
  generatedAt?: string;
}

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

  const db = sql();
  await db`INSERT INTO public.user_profiles (user_id) VALUES (${userId}) ON CONFLICT (user_id) DO NOTHING`;

  const store = getStore('aivis-scans');
  const { blobs } = await store.list();
  const allScans = (await Promise.all(
    blobs.map(({ key }) => store.get(key, { type: 'json' }))
  )) as (LegacyScan | null)[];

  let imported = 0;
  let skipped = 0;
  const companyCache = new Map<string, string>();

  for (const scan of allScans) {
    if (!scan || !scan.id) continue;

    const alreadyImported = await db`
      SELECT id FROM public.scans WHERE legacy_blob_key = ${scan.id}
    `;
    if (alreadyImported.length > 0) {
      skipped++;
      continue;
    }

    const brand = scan.brand || '(unknown)';
    const website = normalizeUrl(scan.website || '');
    const groupKey = `${brand.toLowerCase()}|${website.toLowerCase()}`;

    let companyId = companyCache.get(groupKey);
    if (!companyId) {
      const existingCompany = await db`
        SELECT id FROM public.companies
        WHERE owner_user_id = ${userId}
          AND lower(brand) = ${brand.toLowerCase()}
          AND lower(website) = ${website.toLowerCase()}
      `;
      if (existingCompany.length > 0) {
        companyId = existingCompany[0].id as string;
      } else {
        const inserted = await db`
          INSERT INTO public.companies (
            owner_user_id, brand, website, category, use_case, region,
            customer_segment, competitors, is_legacy_import
          ) VALUES (
            ${userId}, ${brand}, ${website}, ${scan.category || ''}, '', '',
            '', '{}', true
          )
          RETURNING id
        `;
        companyId = inserted[0].id as string;
      }
      companyCache.set(groupKey, companyId);
    }

    await db`
      INSERT INTO public.scans (
        id, company_id, status, brand, website, category,
        cited_count, completed_calls, failed_calls, ambiguous_brand_flag,
        per_prompt_rank, competitor_tallies, raw_responses, score, advice,
        legacy_blob_key, generated_at
      ) VALUES (
        gen_random_uuid(), ${companyId}, 'completed', ${brand}, ${website}, ${scan.category || ''},
        ${scan.citedCount ?? null}, ${scan.completedCalls ?? null}, ${scan.failedCalls ?? null},
        ${scan.ambiguousBrandFlag ?? false},
        ${JSON.stringify(scan.perPromptRank ?? [])}, ${JSON.stringify(scan.competitorTallies ?? [])},
        ${JSON.stringify(scan.rawResponses ?? [])}, ${scan.score ?? null}, ${JSON.stringify(scan.advice ?? [])},
        ${scan.id}, ${scan.generatedAt ?? null}
      )
    `;
    imported++;
  }

  return new Response(
    JSON.stringify({ ok: true, totalBlobs: blobs.length, imported, skipped }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};

export const config: Config = {
  path: '/backfill-legacy-scans',
};
