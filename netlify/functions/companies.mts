// AIVis companies — list/create, auth-scoped. Part of Milestone 4 of the
// SaaS-pivot plan (see /home/marc/.claude/plans/cheerful-leaping-dragon.md):
// the authenticated app shell's first real data endpoint.
import type { Config } from '@netlify/functions';
import { authenticate } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';
import { normalizeUrl, SUPPORTED_LANGUAGES } from '../../shared/aivis-core.mjs';
import { isValidWebsiteUrl } from '../../shared/aivis/brand.mjs';
import { FREE_PLAN_COMPANY_LIMIT, isPro } from './_shared/plan.mts';
import { corsHeaders, handleOptions } from './_shared/cors.mts';
import { jsonResponse, errorResponse } from './_shared/http.mts';
import { getPreviousCompletedScore } from './_shared/scoreHistory.mts';

export default async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const cors = corsHeaders(req);

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const userId = auth;

  const db = sql();

  if (req.method === 'GET') {
    // Portfolio-dashboard fields (prev_score/delta/latest_scan_status/
    // last_scanned_at), added for CompaniesListView.vue's cockpit rework.
    // `latest` uses the same "most recently completed scan" ordering the
    // original latest_score subquery already relied on (generated_at is
    // only ever set on completion, never on failure — so filtering
    // status='completed' here is equivalent to the old NULLS LAST ordering,
    // just explicit).
    //
    // 2026-09-12 (architecture refactor): `prev_score`/`delta` used to be
    // computed here via a second LATERAL OFFSET 1 subquery — a second,
    // independent expression of "previous completed score" alongside
    // _shared/scoreHistory.mts's getPreviousCompletedScore(), which
    // run-scan-background.mts already used for its regression-email check.
    // Two definitions of the same fact risked drifting apart (this file's
    // own comment used to flag exactly that risk). Now this query only
    // fetches `latest_scan_id` alongside `latest_score`, and prev/delta are
    // computed below by calling getPreviousCompletedScore() per company —
    // trading one SQL round trip for up to N (bounded by realistic
    // portfolio sizes for a "track a handful of companies" dashboard) in
    // exchange for exactly one place "previous completed score" is defined
    // anywhere in the codebase.
    const companies = await db`
      SELECT
        c.*,
        COALESCE(cnt.scan_count, 0) AS scan_count,
        latest.id AS latest_scan_id,
        latest.score AS latest_score,
        recent.status AS latest_scan_status,
        recent.created_at AS last_scanned_at
      FROM public.companies c
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS scan_count FROM public.scans s WHERE s.company_id = c.id
      ) cnt ON true
      LEFT JOIN LATERAL (
        SELECT s.id, s.score FROM public.scans s
        WHERE s.company_id = c.id AND s.status = 'completed'
        ORDER BY s.generated_at DESC
        LIMIT 1
      ) latest ON true
      LEFT JOIN LATERAL (
        SELECT s.status, s.created_at FROM public.scans s
        WHERE s.company_id = c.id
        ORDER BY s.created_at DESC
        LIMIT 1
      ) recent ON true
      WHERE c.owner_user_id = ${userId}
      ORDER BY c.created_at DESC
    `;
    const companiesWithPrevScore = await Promise.all(
      companies.map(async (c) => {
        const prevScore = c.latest_scan_id ? await getPreviousCompletedScore(db, c.id, c.latest_scan_id) : null;
        const delta = c.latest_score !== null && prevScore !== null ? c.latest_score - prevScore : null;
        return { ...c, prev_score: prevScore, delta };
      })
    );
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
    // still no read/dismissed state, but `a.scan_id = latest_scan.id` keeps
    // an alert from outliving its own relevance: score_alerts is an
    // append-only log written once when a regression is detected, so
    // without this filter an old regression keeps showing even after a
    // company's score has since recovered on a later scan (found 2026-09-07
    // dogfooding — the list card's live latest/prev delta and this alert
    // disagreed because the alert was stale, not because the two used
    // different scan-ordering logic).
    const alerts = await db`
      SELECT a.id, a.company_id, c.brand, a.prior_score, a.new_score, a.delta, a.created_at
      FROM public.score_alerts a
      JOIN public.companies c ON c.id = a.company_id
      JOIN LATERAL (
        SELECT s.id FROM public.scans s
        WHERE s.company_id = a.company_id AND s.status = 'completed'
        ORDER BY s.generated_at DESC
        LIMIT 1
      ) latest_scan ON true
      WHERE c.owner_user_id = ${userId}
        AND a.created_at >= now() - interval '30 days'
        AND a.scan_id = latest_scan.id
      ORDER BY a.created_at DESC
      LIMIT 10
    `;

    return jsonResponse({ ok: true, companies: companiesWithPrevScore, profile, alerts }, { cors });
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
        return errorResponse(
          `Free plan is limited to ${FREE_PLAN_COMPANY_LIMIT} company. Upgrade to Pro to track more.`,
          402,
          { upgradeRequired: true, limit: FREE_PLAN_COMPANY_LIMIT },
          cors
        );
      }
    }

    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch {
      return errorResponse('Invalid JSON body', 400, {}, cors);
    }

    const brand = (body.brand || '').trim();
    const website = (body.website || '').trim();
    if (!brand || !website) {
      return errorResponse('brand and website are required', 400, {}, cors);
    }
    // Recovered from an orphaned agent worktree (2026-09-02): a typo like
    // "reuters com" (space instead of dot) previously sailed through
    // normalizeUrl()'s deliberately-lenient https:// prefixing and got
    // persisted verbatim — a URL the WHATWG parser itself considers
    // invalid, which then made harmonia.mjs's `new URL(website)` throw at
    // scan time. This insert is the actual data-writing boundary
    // regardless of how the request got here, so it's the right place to
    // fail closed rather than insert.
    if (!isValidWebsiteUrl(website)) {
      return errorResponse('Please enter a valid website URL (e.g. acme.com or https://acme.com).', 400, {}, cors);
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

    return jsonResponse({ ok: true, company }, { status: 201, cors });
  }

  return errorResponse('Method not allowed', 405, {}, cors);
};

export const config: Config = {
  path: '/companies',
};
