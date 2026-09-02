// AIVis companies — list/create, auth-scoped. Part of Milestone 4 of the
// SaaS-pivot plan (see /home/marc/.claude/plans/cheerful-leaping-dragon.md):
// the authenticated app shell's first real data endpoint.
import type { Config } from '@netlify/functions';
import { requireAuth, authErrorResponse, AuthError } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';
import { isValidWebsiteUrl, normalizeUrl, SUPPORTED_LANGUAGES } from '../../shared/aivis-core.mjs';
import { FREE_PLAN_COMPANY_LIMIT, isPro } from './_shared/plan.mts';
import { corsHeaders, handleOptions } from './_shared/cors.mts';

export default async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  let userId: string;
  try {
    userId = await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }

  const db = sql();

  if (req.method === 'GET') {
    // Portfolio-dashboard fields (prev_score/delta/latest_scan_status/
    // last_scanned_at), added for CompaniesListView.vue's cockpit rework.
    // `latest`/`prev` use the same "most recently completed scan" ordering
    // the original latest_score subquery already relied on (generated_at is
    // only ever set on completion, never on failure — so filtering
    // status='completed' here is equivalent to the old NULLS LAST ordering,
    // just explicit) — same underlying definition of "previous score" as
    // getPreviousCompletedScore() in _shared/scoreHistory.mts, expressed as
    // an OFFSET 1 set query here since this is a bulk list, not a lookup for
    // one specific scan.
    const companies = await db`
      SELECT
        c.*,
        COALESCE(cnt.scan_count, 0) AS scan_count,
        latest.score AS latest_score,
        prev.score AS prev_score,
        CASE WHEN latest.score IS NOT NULL AND prev.score IS NOT NULL THEN latest.score - prev.score ELSE NULL END AS delta,
        recent.status AS latest_scan_status,
        recent.created_at AS last_scanned_at
      FROM public.companies c
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS scan_count FROM public.scans s WHERE s.company_id = c.id
      ) cnt ON true
      LEFT JOIN LATERAL (
        SELECT s.score FROM public.scans s
        WHERE s.company_id = c.id AND s.status = 'completed'
        ORDER BY s.generated_at DESC
        LIMIT 1
      ) latest ON true
      LEFT JOIN LATERAL (
        SELECT s.score FROM public.scans s
        WHERE s.company_id = c.id AND s.status = 'completed'
        ORDER BY s.generated_at DESC
        OFFSET 1 LIMIT 1
      ) prev ON true
      LEFT JOIN LATERAL (
        SELECT s.status, s.created_at FROM public.scans s
        WHERE s.company_id = c.id
        ORDER BY s.created_at DESC
        LIMIT 1
      ) recent ON true
      WHERE c.owner_user_id = ${userId}
      ORDER BY c.created_at DESC
    `;
    // Lazily created if this is the caller's first request of any kind —
    // matches the POST handler's on-demand provisioning below.
    const profiles = await db`
      SELECT plan_tier, subscription_status FROM public.user_profiles WHERE user_id = ${userId}
    `;
    const profile = profiles[0] || { plan_tier: 'free', subscription_status: null };

    // Recent regression events across the whole portfolio, for the
    // dashboard's "Alerts" section — surfaces what sendScoreRegressionEmail
    // already computes, since the email alone is invisible until someone
    // checks their inbox. Last 30 days, most recent first, capped at 10 —
    // no read/dismissed state (out of scope for this pass).
    const alerts = await db`
      SELECT a.id, a.company_id, c.brand, a.prior_score, a.new_score, a.delta, a.created_at
      FROM public.score_alerts a
      JOIN public.companies c ON c.id = a.company_id
      WHERE c.owner_user_id = ${userId} AND a.created_at >= now() - interval '30 days'
      ORDER BY a.created_at DESC
      LIMIT 10
    `;

    return new Response(JSON.stringify({ ok: true, companies, profile, alerts }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  if (req.method === 'POST') {
    // FK target for companies.owner_user_id — first write for a given user
    // creates their profile row on demand rather than requiring a separate
    // provisioning step.
    await db`INSERT INTO public.user_profiles (user_id) VALUES (${userId}) ON CONFLICT (user_id) DO NOTHING`;

    const profiles = await db`SELECT plan_tier FROM public.user_profiles WHERE user_id = ${userId}`;
    if (!isPro(profiles[0]?.plan_tier)) {
      const [{ count }] = await db`
        SELECT count(*)::int AS count FROM public.companies WHERE owner_user_id = ${userId}
      `;
      if (count >= FREE_PLAN_COMPANY_LIMIT) {
        return new Response(
          JSON.stringify({
            error: `Free plan is limited to ${FREE_PLAN_COMPANY_LIMIT} company. Upgrade to Pro for unlimited companies.`,
            upgradeRequired: true,
            limit: FREE_PLAN_COMPANY_LIMIT,
          }),
          { status: 402, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } },
        );
      }
    }

    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
      });
    }

    const brand = (body.brand || '').trim();
    const website = (body.website || '').trim();
    if (!brand || !website) {
      return new Response(JSON.stringify({ error: 'brand and website are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
      });
    }
    // Real bug found in production (Issue #8): nothing downstream of this
    // insert re-validates website's shape, so a typo like "reuters com"
    // (space instead of dot) previously sailed through normalizeUrl()'s
    // deliberately-lenient https:// prefixing and got persisted verbatim —
    // a URL the WHATWG parser itself considers invalid, which then made
    // harmonia.mjs's `new URL(website)` throw at scan time. This is the
    // actual data-writing boundary regardless of how the request got here
    // (the enrich-first flow, a skipped-enrich manual fill, or a direct API
    // call), so it's the right place to fail closed rather than insert.
    if (!isValidWebsiteUrl(website)) {
      return new Response(
        JSON.stringify({ error: 'Please enter a valid website URL (e.g. acme.com or https://acme.com).' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } },
      );
    }
    const category = (body.category || '').trim();
    const useCase = (body.use_case || '').trim();
    const region = (body.region || '').trim();
    const customerSegment = (body.customer_segment || '').trim();
    const competitors = (body.competitors || '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);
    // Bounds-checked against SUPPORTED_LANGUAGES rather than trusted
    // verbatim, same discipline as parseEnrichmentResponse's own language
    // field — an unrecognized value stores as NULL (treated as English by
    // promptTemplatesForLanguage's own fallback) rather than persisting an
    // unsupported language string a scan could never actually use.
    const language = SUPPORTED_LANGUAGES.includes(body.language) ? body.language : null;

    const inserted = await db`
      INSERT INTO public.companies (
        owner_user_id, brand, website, category, use_case, region, customer_segment, competitors, language
      ) VALUES (
        ${userId}, ${brand}, ${normalizeUrl(website)}, ${category}, ${useCase}, ${region}, ${customerSegment}, ${competitors}, ${language}
      )
      RETURNING *
    `;
    const company = inserted[0];

    return new Response(JSON.stringify({ ok: true, company }), {
      status: 201,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });
};

export const config: Config = {
  path: '/companies',
};
