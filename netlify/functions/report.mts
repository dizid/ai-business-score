// Public, unauthenticated report page for one company's most recent
// completed scan — /reports/:id. Opt-in only (companies.is_public must be
// true, toggled from CompanyDetailView.vue). This is the biggest AI-
// visibility/SEO lever for the product itself: a real, crawlable page per
// scanned business, rather than everything living behind a login wall.
//
// No auth by design — this is meant to be found by search/AI crawlers and
// shared publicly. Every DB-sourced string that reaches the HTML response
// MUST go through escapeHtml() first (see _shared/html.mts's header comment)
// since brand/category/competitor names are user-entered, not app-controlled
// text.
import type { Config, Context } from '@netlify/functions';
import { sql } from './_shared/db.mts';
import { scoreBand } from '../../shared/aivis-core.mjs';
import { escapeHtml } from './_shared/html.mts';

const SITE_URL = 'https://aivis-scan.netlify.app';

const BAND_LABELS: Record<string, string> = {
  leading: 'Leading',
  visible: 'Visible, often beaten',
  weak: 'Weak presence',
  invisible: 'Invisible',
  unavailable: 'Score unavailable',
};

interface CompetitorTally {
  name: string;
  mentionCount: number;
  beatBrandCount: number;
  ambiguous: boolean;
}
interface PerPromptRank {
  promptIndex: number;
  rank: string;
}

// Shared page chrome (styles + basic head tags) so the 404 and the
// successful-hit response don't duplicate the <style> block.
const PAGE_STYLE = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #f7f7f8;
    color: #1a1a1e;
    line-height: 1.5;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #16161a; color: #e8e8ec; }
  }
  main {
    max-width: 640px;
    margin: 0 auto;
    padding: 48px 20px 64px;
  }
  h1 { font-size: 1.6rem; margin: 0 0 4px; }
  .meta { color: #6b6b76; font-size: 0.92rem; margin-bottom: 24px; }
  @media (prefers-color-scheme: dark) { .meta { color: #a3a3ad; } }
  .meta a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
  .card {
    background: #ffffff;
    border: 1px solid #e2e2e6;
    border-radius: 14px;
    padding: 20px;
    margin-bottom: 18px;
  }
  @media (prefers-color-scheme: dark) {
    .card { background: #1f1f24; border-color: #34343c; }
  }
  .score-row { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  .score-num { font-size: 2.4rem; font-weight: 700; line-height: 1; }
  .score-of { color: #6b6b76; font-size: 1rem; }
  @media (prefers-color-scheme: dark) { .score-of { color: #a3a3ad; } }
  .band-label { font-size: 1.05rem; font-weight: 600; margin-top: 6px; }
  .band-leading .score-num, .band-leading .band-label { color: #1a8a4a; }
  .band-visible .score-num, .band-visible .band-label { color: #b8860b; }
  .band-weak .score-num, .band-weak .band-label { color: #c25b1e; }
  .band-invisible .score-num, .band-invisible .band-label { color: #c8323a; }
  .headline { font-size: 1.05rem; font-weight: 500; margin-bottom: 4px; }
  .warn {
    background: #fff6da;
    border: 1px solid #e8d38a;
    color: #6b5300;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 0.88rem;
    margin-bottom: 16px;
  }
  @media (prefers-color-scheme: dark) {
    .warn { background: #3a3210; border-color: #6b5300; color: #f0d878; }
  }
  h2 { font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.03em; color: #6b6b76; margin: 28px 0 10px; }
  @media (prefers-color-scheme: dark) { h2 { color: #a3a3ad; } }
  .board-row { margin-bottom: 12px; }
  .board-row:last-child { margin-bottom: 0; }
  .board-label { display: flex; justify-content: space-between; gap: 8px; font-size: 0.88rem; margin-bottom: 4px; }
  .board-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .board-name .you-tag { color: #3b6fd8; font-weight: 600; }
  .board-count { color: #6b6b76; flex: none; }
  @media (prefers-color-scheme: dark) { .board-count { color: #a3a3ad; } }
  .board-track { height: 18px; border-radius: 5px; background: #e9e9ee; overflow: hidden; }
  @media (prefers-color-scheme: dark) { .board-track { background: #2c2c33; } }
  .board-fill { height: 100%; border-radius: 5px; }
  .board-fill.you { background: #3b6fd8; }
  .board-fill.rival { background: #9a9aa4; }
  .board-ambiguous { color: #6b6b76; font-size: 0.78rem; margin-top: 2px; font-style: italic; }
  .summary-line { font-size: 0.9rem; color: #6b6b76; }
  @media (prefers-color-scheme: dark) { .summary-line { color: #a3a3ad; } }
  footer { margin-top: 32px; color: #8a8a94; font-size: 0.8rem; }
  footer a { color: inherit; }
  .cta {
    display: inline-block;
    margin-top: 20px;
    padding: 10px 18px;
    border-radius: 8px;
    background: #3b6fd8;
    color: #fff !important;
    text-decoration: none;
    font-weight: 600;
    font-size: 0.9rem;
  }
`;

function notFoundResponse(): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Report not found — AIVis</title>
<meta name="robots" content="noindex">
<style>${PAGE_STYLE}</style>
</head>
<body>
<main>
<h1>Report not found</h1>
<p class="summary-line">This report doesn't exist, or its owner hasn't made it public.</p>
<a class="cta" href="${SITE_URL}/">Check your own AI visibility →</a>
</main>
</body>
</html>`;
  return new Response(html, {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex',
    },
  });
}

export default async (req: Request, context: Context) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: { 'Content-Type': 'text/plain' } });
  }

  const companyId = context.params.id;
  const db = sql();

  let row: Record<string, any> | undefined;
  try {
    const rows = await db`
      SELECT
        c.id, c.brand, c.website, c.category, c.region, c.customer_segment,
        s.cited_count, s.completed_calls, s.failed_calls, s.ambiguous_brand_flag,
        s.per_prompt_rank, s.competitor_tallies, s.score, s.generated_at
      FROM public.companies c
      JOIN public.scans s ON s.company_id = c.id
      WHERE c.id = ${companyId} AND c.is_public = true AND s.status = 'completed'
      ORDER BY s.generated_at DESC NULLS LAST
      LIMIT 1
    `;
    row = rows[0];
  } catch {
    // A non-UUID :id throws a Postgres cast error rather than returning zero
    // rows — fall through to the exact same 404 as "not found" so a private
    // or nonexistent company can't be distinguished from a malformed id.
    row = undefined;
  }

  // is_public=false, no completed scan, AND a malformed id all produce the
  // identical 404 — never leak whether a private company exists.
  if (!row) {
    return notFoundResponse();
  }

  const brand = String(row.brand ?? '');
  const website = String(row.website ?? '');
  const category = String(row.category ?? '');
  const region = String(row.region ?? '');
  const score: number | null = row.score === null || row.score === undefined ? null : Number(row.score);
  const completedCalls: number = row.completed_calls ?? 0;
  const failedCalls: number = row.failed_calls ?? 0;
  const citedCount: number = row.cited_count ?? 0;
  const ambiguousBrandFlag: boolean = row.ambiguous_brand_flag === true;
  const perPromptRank: PerPromptRank[] = Array.isArray(row.per_prompt_rank) ? row.per_prompt_rank : [];
  const competitorTallies: CompetitorTally[] = Array.isArray(row.competitor_tallies) ? row.competitor_tallies : [];
  const generatedAt = new Date(row.generated_at);
  const generatedAtIso = Number.isNaN(generatedAt.getTime()) ? new Date().toISOString() : generatedAt.toISOString();
  const generatedAtDisplay = Number.isNaN(generatedAt.getTime())
    ? ''
    : generatedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const band = scoreBand(score);
  const bandLabel = BAND_LABELS[band] ?? band;

  const safeWebsiteHref = /^https?:\/\//i.test(website) ? website : null;

  // ---- headline sentence (duplicated from ScanDetail.vue's headlineKind
  // branch — small enough not to be worth importing Vue for a plain-HTML
  // page). beatenCount mirrors ScanDetail.vue's beatenCount computed. ----
  const beatenCount = perPromptRank.filter((r) =>
    ['ranked-2', 'ranked-3', 'mentioned', 'beaten'].includes(r.rank)
  ).length;
  let headlineHtml: string;
  if (completedCalls === 0) {
    headlineHtml = `We couldn't complete any checks for <strong>${escapeHtml(brand)}</strong> this time — no data, not necessarily no visibility.`;
  } else if (citedCount === 0) {
    headlineHtml = `<strong>${escapeHtml(brand)} did not show up</strong> when we asked AI search about ${escapeHtml(category)}.`;
  } else if (beatenCount > 0) {
    headlineHtml = `${escapeHtml(brand)} showed up, but <strong>competitors were mentioned first</strong> in ${beatenCount} of ${completedCalls} checks.`;
  } else {
    headlineHtml = `<strong>${escapeHtml(brand)} showed up</strong> in ${citedCount} of ${completedCalls} checks — no competitor beat it to the mention.`;
  }

  // ---- scoreboard: brand row always first, competitors sorted by mention
  // count descending — same ordering ScanDetail.vue's scoreboardRows uses. ----
  const rivalRows = [...competitorTallies].sort((a, b) => b.mentionCount - a.mentionCount);
  function pct(mentionCount: number): number {
    if (completedCalls === 0) return 0;
    return Math.min(100, Math.round((mentionCount / completedCalls) * 100));
  }
  const brandRowHtml = `
    <div class="board-row">
      <div class="board-label">
        <span class="board-name">${escapeHtml(brand)}<span class="you-tag"> (this business)</span></span>
        <span class="board-count">${citedCount}/${completedCalls}</span>
      </div>
      <div class="board-track"><div class="board-fill you" style="width:${pct(citedCount)}%"></div></div>
    </div>`;
  const rivalRowsHtml = rivalRows
    .map((r) => {
      const name = String(r.name ?? '');
      const mentionCount = Number(r.mentionCount) || 0;
      return `
    <div class="board-row">
      <div class="board-label">
        <span class="board-name">${escapeHtml(name)}</span>
        <span class="board-count">${mentionCount}/${completedCalls}</span>
      </div>
      <div class="board-track"><div class="board-fill rival" style="width:${pct(mentionCount)}%"></div></div>
      ${r.ambiguous ? `<div class="board-ambiguous">Name is a common word — automated detection was skipped for some checks. This tally may undercount.</div>` : ''}
    </div>`;
    })
    .join('');

  // ---- check-count summary ----
  const rankedFirstCount = perPromptRank.filter((r) => r.rank === 'ranked-1').length;
  const checkSummary = `Mentioned first in ${rankedFirstCount} of ${completedCalls} checks.`;

  const canonical = `${SITE_URL}/reports/${escapeHtml(row.id)}`;
  const title = `Does ${escapeHtml(brand)} show up in AI search? — AIVis`;
  const scoreForDescription = score === null ? 'unavailable' : `${score}/100`;
  const description = `AIVis checked whether ${escapeHtml(brand)} shows up when AI search is asked about ${escapeHtml(category)}. Score: ${scoreForDescription} (${escapeHtml(bandLabel)}).`;

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': canonical,
    url: canonical,
    name: title,
    description,
    isPartOf: { '@id': `${SITE_URL}/#website` },
    publisher: { '@id': `${SITE_URL}/#organization` },
    about: {
      '@type': 'Organization',
      name: brand,
      url: website,
      // additionalProperty (a plain named quantitative value), not
      // Review/AggregateRating — this isn't a consumer review, and that
      // schema type would be misleading per Google's structured-data
      // guidelines for self-serving/non-consumer ratings.
      ...(score !== null
        ? {
            additionalProperty: {
              '@type': 'PropertyValue',
              propertyID: 'aivis-visibility-score',
              name: 'AI Visibility Score',
              value: score,
              minValue: 0,
              maxValue: 100,
            },
          }
        : {}),
    },
    datePublished: generatedAtIso,
    dateModified: generatedAtIso,
  };
  // Escape `</` inside the JSON so a malicious brand/category value can't
  // break out of the <script> tag early — JSON.stringify itself does not
  // guard against this.
  const jsonLdString = JSON.stringify(jsonLd).replace(/<\//g, '<\\/');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<script type="application/ld+json">${jsonLdString}</script>
<style>${PAGE_STYLE}</style>
</head>
<body>
<main>
<h1>${escapeHtml(brand)}</h1>
<p class="meta">
  ${safeWebsiteHref ? `<a href="${escapeHtml(safeWebsiteHref)}" target="_blank" rel="noopener">${escapeHtml(website)}</a>` : escapeHtml(website)}
  ${category ? ` &middot; ${escapeHtml(category)}` : ''}
  ${region ? ` &middot; ${escapeHtml(region)}` : ''}
  &middot; checked ${escapeHtml(generatedAtDisplay)}
</p>

<div class="card band-${band}">
  <div class="score-row">
    ${score !== null ? `<span class="score-num">${score}</span><span class="score-of">/ 100</span>` : ''}
  </div>
  <div class="band-label">${escapeHtml(bandLabel)}</div>
</div>

<p class="headline">${headlineHtml}</p>

${ambiguousBrandFlag ? `<div class="warn">Brand name is a common word — automated detection was skipped for some checks. Treat this score as a rough estimate.</div>` : ''}
${failedCalls > 0 ? `<div class="warn">${failedCalls} of ${completedCalls + failedCalls} checks failed to complete and are not counted above.</div>` : ''}

<h2>Scoreboard</h2>
<div class="card">
  ${brandRowHtml}
  ${rivalRowsHtml}
</div>

<p class="summary-line">${escapeHtml(checkSummary)}</p>

<footer>
  <p>AI Visibility Score is a heuristic, presence-only measure of whether AI search engines (ChatGPT, Gemini, and others via Perplexity's Agent API) mention this brand when asked relevant category questions — not sentiment, not a verified ranking, and not an ongoing monitor. This is a single point-in-time check.</p>
  <a class="cta" href="${SITE_URL}/">Check your own brand's AI visibility →</a>
</footer>
</main>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};

export const config: Config = {
  path: '/reports/:id',
};
