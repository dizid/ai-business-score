// Builds a single self-contained Markdown report from a scan's full
// payload — everything ScanDetail.vue renders (AI Visibility score, Site
// Health/SEO audit, full check-by-check breakdown), formatted for pasting
// into an external AI assistant to get improvement recommendations. Pure
// client-side: no server call, no new endpoint — every field it reads is
// already loaded into ValidatedPayload by the time ScanDetail.vue renders.
// Reuses the same label maps (scanLabels.ts) and aggregation logic
// (scanDerived.ts) the UI uses, so the report can't independently drift
// from what's on screen.
import { asNonNegativeInt, asShortString, asAdviceExcerpt, type ValidatedPayload, type AdviceCard } from './scanPayload';
import {
  BAND_LABEL, BAND_EXPLAIN, SENTIMENT_LABEL, CHECK_BADGE_LABEL, ADVICE_HEADING, HARMONIA_PILLAR_LABELS,
  CATEGORY_EXPLAIN, CITATION_TIER_LABEL,
} from './scanLabels';
import {
  deriveHeadlineKind, deriveBeatenCount, deriveScoreboardRows, scoreboardRowPct, shareOfVoicePct, deriveCategoryBreakdown,
  deriveExecutiveSummary, confidenceLabel, deriveKeyMetrics,
  deriveSentimentSummaryRows, deriveSentimentAdvice, deriveVisibleAdvice, deriveHarmoniaPillars, deriveHarmoniaBand,
  deriveCheckBreakdown, deriveFailureRows, deriveOwnSiteCitationRows, deriveScanDurationLabel, cwvRating,
  formatSeconds, sentimentKey, deriveSentimentByKey,
} from './scanDerived';
import { scoreBand } from '../../shared/aivis-core.mjs';

function mdEscapeCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function blockquote(text: string): string {
  return text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

function checklistLine(passed: boolean, label: string): string {
  return `- [${passed ? 'x' : ' '}] ${label}`;
}

// Mirrors the six `v-else-if` cases in ScanDetail.vue's advice-card
// template (Markdown bold instead of <strong>) — kept deliberately
// duplicated rather than shared, matching this codebase's own convention
// of copy-pasted per-surface copy over a shared abstraction for small,
// rarely-changing prose blocks. Update both if this wording changes.
// excerpt: a real quoted sentence citing the competitor, when found — same
// underlying evidence as the paid deep-advice prompt, appended as a
// blockquote so the exported report matches ScanDetail.vue's UI.
function excerptMarkdown(p: Record<string, unknown>): string {
  const excerpt = asAdviceExcerpt(p.excerpt);
  return excerpt ? `\n\n${blockquote(`"...${excerpt.snippet}..." — *${excerpt.promptLabel}*`)}` : '';
}

function adviceCardMarkdown(card: AdviceCard): string {
  const p = card.params;
  const n = (v: unknown) => asNonNegativeInt(v) ?? '?';
  switch (card.id) {
    case 'no-data':
      return "We couldn't complete any checks this time — likely a temporary API issue. Try running the scan again.";
    case 'zero-citations':
      return `You're invisible in AI search. Across ${n(p.completedCalls)} checks, this brand was never mentioned — not once. Getting cited even occasionally is the highest-leverage fix here: AI models lean on third-party mentions (reviews, directories, comparison content), not a brand's own site.`;
    case 'consistently-beaten': {
      const topName = asShortString(p.topCompetitorName);
      return (topName
        ? `AI knows this brand exists, but reaches for **${topName}** first — beaten to the mention in ${n(p.beaten)} of ${n(p.completedCalls)} checks. Closing this gap usually means more third-party content AI can point to as the definitive answer, not just a passing mention.`
        : `AI knows this brand exists, but a competitor is usually mentioned first — beaten in ${n(p.beaten)} of ${n(p.completedCalls)} checks.`) + excerptMarkdown(p);
    }
    case 'leading':
      return `This is the AI's go-to answer. Every completed check (${n(p.completedCalls)}/${n(p.completedCalls)}) came up with this brand first — no competitor beat it to the mention. Worth re-checking periodically; this can shift as competitors publish new content.`;
    case 'mixed':
      return `Mixed results across ${n(p.completedCalls)} checks: ranked first in ${n(p.ranked1)}, beaten by a competitor in ${n(p.beaten)}, not mentioned at all in ${n(p.notMentioned)}. The not-mentioned checks are the biggest opportunity — competitors aren't necessarily winning those either, nobody is.`;
    case 'top-rival': {
      const name = asShortString(p.name);
      return name
        ? `**${name}** is the competitor showing up most — mentioned in ${n(p.mentionCount)} of ${n(p.completedCalls)} checks. Worth understanding what makes them citable (content structure, third-party coverage, reviews).${excerptMarkdown(p)}`
        : '';
    }
    default:
      return '';
  }
}

function headlineMarkdown(payload: ValidatedPayload): string {
  const kind = deriveHeadlineKind(payload);
  switch (kind) {
    case 'none':
      return `We couldn't complete any checks for **${payload.brand}** this time — no data, not necessarily no visibility.`;
    case 'zero':
      return `**${payload.brand} did not show up** when we asked AI search about ${payload.category}.`;
    case 'beaten':
      return `${payload.brand} showed up, but **competitors were mentioned first** in ${deriveBeatenCount(payload)} of ${payload.completedCalls} checks.`;
    case 'good':
      return `**${payload.brand} showed up** in ${payload.citedCount} of ${payload.completedCalls} checks — no competitor beat it to the mention.`;
  }
}

export function buildScanReportMarkdown(payload: ValidatedPayload): string {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);

  // ---- Header / metadata ----
  push(`# ${payload.brand} — AI Visibility Report`);
  push();
  push(`- **Website:** ${payload.website}`);
  push(`- **Category:** ${payload.category}`);
  push(`- **Checked:** ${payload.generatedAtDate.toLocaleString()}`);
  const duration = deriveScanDurationLabel(payload);
  if (duration) push(`- **Scan duration:** ${duration}`);
  push();

  // ---- Executive summary ----
  if (payload.completedCalls > 0) {
    const exec = deriveExecutiveSummary(payload);
    push('## Executive summary');
    push();
    push(exec.verdict);
    push();
    if (exec.vulnerability) push(`- **Biggest vulnerability:** ${exec.vulnerability}`);
    if (exec.quickWin) push(`- **Quick win:** ${exec.quickWin}`);
    push();
  }

  // ---- AI Visibility Score ----
  push('## AI Visibility Score');
  push();
  const band = scoreBand(payload.score);
  push(`**${payload.score ?? '—'}/100** — ${BAND_LABEL[band]}`);
  push();
  push(BAND_EXPLAIN[band]);
  push();
  push(`Confidence: ${confidenceLabel(payload.completedCalls)} — based on ${payload.completedCalls} / ${payload.completedCalls + payload.failedCalls} successful checks.`);
  push();
  push(headlineMarkdown(payload));
  push();
  if (payload.ambiguousBrandFlag) {
    push('> **Note:** Brand name is a common word — automated detection was skipped for some checks. Read the raw responses below before trusting the count.');
    push();
  }
  if (payload.failedCalls > 0) {
    push(`> **Note:** ${payload.failedCalls} of ${payload.completedCalls + payload.failedCalls} checks failed to complete and are not counted above.`);
    push();
  }

  // ---- Key metrics ----
  const keyMetrics = deriveKeyMetrics(payload);
  if (keyMetrics) {
    const parts = [
      `AI recommendation rate: ${keyMetrics.recommendationRatePct}%`,
      `AI first-choice rate: ${keyMetrics.firstChoiceRatePct}%`,
    ];
    if (keyMetrics.topCompetitorName) {
      parts.push(`Taken by ${keyMetrics.topCompetitorName}: ${keyMetrics.topCompetitorTakeoverRatePct}%`);
    }
    push(parts.join(' · '));
    push();
  }

  const sentimentSummaryRows = deriveSentimentSummaryRows(payload);
  if (sentimentSummaryRows.length) {
    push('**Sentiment summary:** ' + sentimentSummaryRows.map((r) => `${r.count} ${r.label}`).join(', '));
    push();
  }

  // ---- Scoreboard ----
  const scoreboardRows = deriveScoreboardRows(payload);
  if (scoreboardRows.length) {
    push('## Scoreboard');
    push();
    push('| Brand | Mentions | Share of voice | Beat you |');
    push('|---|---|---|---|');
    for (const row of scoreboardRows) {
      const name = mdEscapeCell(row.name) + (row.isYou ? ' (you)' : '');
      const mentions = `${row.mentionCount}/${payload.completedCalls} (${scoreboardRowPct(payload, row)}%)`;
      const share = `${shareOfVoicePct(scoreboardRows, row)}%`;
      const beat = !row.isYou && row.beatBrandCount > 0 ? `beat you ${row.beatBrandCount}×` : '—';
      push(`| ${name} | ${mentions} | ${share} | ${beat} |`);
      if (row.ambiguous) push(`| | | *Name is a common word — this tally may undercount.* | |`);
    }
    push();
  }

  // ---- Advice ----
  const visibleAdvice = deriveVisibleAdvice(payload);
  const sentimentAdvice = deriveSentimentAdvice(payload);
  if (visibleAdvice.length || sentimentAdvice) {
    push('## What to do next');
    push();
    for (const card of visibleAdvice) {
      push(`### ${ADVICE_HEADING[card.id] || 'Note'}`);
      push();
      push(adviceCardMarkdown(card));
      push();
    }
    if (sentimentAdvice) {
      push('### Sentiment');
      push();
      push(
        `AI mentioned ${payload.brand}, but framed it unfavorably in ${sentimentAdvice.unfavorable} of ${sentimentAdvice.total} judged ` +
        `check${sentimentAdvice.total === 1 ? '' : 's'} (${sentimentAdvice.negative} negative, ${sentimentAdvice.comparisonOnly} comparison-only) — ` +
        `a mention isn't the same as a good mention. See the flagged responses in the check-by-check breakdown below.`
      );
      push();
    }
  }

  // ---- Deep advice ----
  if (payload.deepAdvice) {
    push('## Deeper advice');
    push();
    payload.deepAdvice.steps.forEach((step, i) => {
      push(`${i + 1}. **${step.title}** (${step.difficulty})${step.reasoning ? ` — ${step.reasoning}` : ''}`);
    });
    push();
  }

  // ---- Performance by query type ----
  const categoryBreakdown = deriveCategoryBreakdown(payload);
  if (categoryBreakdown.length) {
    push('## Performance by query type');
    push();
    push('| Category | Mentioned | First | Beaten | Not mentioned | Sentiment |');
    push('|---|---|---|---|---|---|');
    for (const row of categoryBreakdown) {
      const sentiment = row.sentimentCounts.map((s) => `${s.count} ${s.label}`).join(', ') || '—';
      push(`| ${row.label} | ${row.ranked1 + row.beaten}/${row.total} | ${row.ranked1} | ${row.beaten} | ${row.notMentioned} | ${sentiment} |`);
    }
    push();
    for (const row of categoryBreakdown) {
      if (CATEGORY_EXPLAIN[row.category]) push(`*${row.label}: ${CATEGORY_EXPLAIN[row.category]}*`);
    }
    push();
  }

  // ---- Site Health score ----
  if (payload.harmonia) {
    const h = payload.harmonia;
    const hBand = deriveHarmoniaBand(payload);
    push('## Site Health score');
    push();
    push(`**${h.harmoniaScore ?? '—'}/100** — ${BAND_LABEL[hBand]}`);
    push();
    push(`Technical, on-page, content-structure, and UX health of ${payload.website} — not part of the AI Visibility Score.`);
    push();
    for (const pillar of deriveHarmoniaPillars(payload)) {
      push(`### ${pillar.label} — ${pillar.score ?? 'n/a'}/100 (${BAND_LABEL[pillar.band]})`);
      push();
      if (pillar.checks.length) {
        for (const c of pillar.checks) push(checklistLine(c.passed, c.label));
      } else {
        push('*Not available for this scan.*');
      }
      push();
    }
    if (h.securityHeaders.length) {
      push('### Security headers');
      push();
      for (const header of h.securityHeaders) push(checklistLine(header.present, header.header));
      push();
    }
    if (h.coreWebVitals) {
      push('### Core Web Vitals (mobile)');
      push();
      const cwv = h.coreWebVitals;
      const rate = (metric: 'lcpMs' | 'clsScore' | 'inpMs', value: number | null) => cwvRating(metric, value) ?? 'no data';
      push(`- LCP: ${formatSeconds(cwv.lcpMs)} (${rate('lcpMs', cwv.lcpMs)})`);
      push(`- CLS: ${cwv.clsScore ?? '—'} (${rate('clsScore', cwv.clsScore)})`);
      push(`- INP: ${cwv.inpMs !== null ? formatSeconds(cwv.inpMs) : 'no field data'} (${rate('inpMs', cwv.inpMs)})`);
      push();
    }
    if (h.schema.detected.length) {
      push('### Schema.org detected');
      push();
      for (const n of h.schema.detected) {
        const issues = n.issues.length ? ` — ${n.issues.join('; ')}` : '';
        push(checklistLine(n.valid, `${n.type || 'Unrecognized type'}${issues}`));
      }
      push();
    }
    if (h.schema.opportunities.length) {
      push('### Schema opportunities');
      push();
      for (const o of h.schema.opportunities) {
        push(`**${o.type}**`);
        push();
        push(o.reason);
        push();
        push('```json');
        push(o.example);
        push('```');
        push();
      }
    }
    if (h.errors.length) {
      push(`*Some checks couldn't complete: ${h.errors.join('; ')}*`);
      push();
    }
  }

  // ---- Your site, cited ----
  const ownSiteCitationRows = deriveOwnSiteCitationRows(payload);
  if (ownSiteCitationRows.length) {
    push('## Your site, cited');
    push();
    push('AI models cited these pages from your own site while answering:');
    push();
    for (const c of ownSiteCitationRows) {
      push(`- [${mdEscapeCell(c.title)}](${c.url}) — ${c.model}, ${c.promptLabel}, ${CITATION_TIER_LABEL[c.tier]}`);
    }
    push();
  }

  // ---- Check-by-check breakdown ----
  const checkBreakdown = deriveCheckBreakdown(payload);
  if (checkBreakdown.length) {
    push('## Check-by-check breakdown');
    push();
    const sentimentByKey = deriveSentimentByKey(payload);
    for (const group of checkBreakdown) {
      push(`### ${group.label}`);
      push();
      for (const c of group.checks) {
        const judgment = sentimentByKey.get(sentimentKey(group.promptIndex, c.model));
        const sentimentSuffix = judgment ? ` — ${SENTIMENT_LABEL[judgment.classification]}` : '';
        push(`#### ${c.model} — ${CHECK_BADGE_LABEL[c.rank]}${sentimentSuffix}`);
        push();
        push(blockquote(c.text));
        push();
        if (c.citations.length) {
          push('Sources: ' + c.citations.map((cit) => `[${mdEscapeCell(cit.title || cit.url)}](${cit.url})`).join(', '));
          push();
        }
        if (judgment) {
          push(`*${judgment.reasoning}*`);
          push();
        }
      }
    }
    const failureRows = deriveFailureRows(payload);
    if (failureRows.length) {
      push(`**${payload.failedCalls} additional ${payload.failedCalls === 1 ? 'check' : 'checks'} failed to complete:**`);
      push();
      for (const f of failureRows) push(`- ${f.model} — ${f.promptLabel}: ${f.error || 'no error message'}`);
      push();
    }
  }

  // ---- Footer ----
  push('---');
  push();
  push(
    'Detection is presence-only, not sentiment-aware — a negative or comparative mention still counts as "cited." ' +
    'The score above is a heuristic weighting of that same presence-only detection, not an independently verified rank. ' +
    'This is a single point-in-time check, not a monitored score.'
  );
  push();
  push(`*Generated by Foreground on ${new Date().toLocaleString()}.*`);

  return lines.join('\n');
}

function slugify(s: string): string {
  const slug = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'scan-report';
}

// Triggers a browser download of the report — safe here because this runs
// inside the real app UI (ScanDetail.vue), not a published Artifact's
// sandboxed viewer, where <a download> links are inert.
export function downloadMarkdown(markdown: string, payload: ValidatedPayload) {
  const isoDate = payload.generatedAtDate.toISOString().slice(0, 10);
  const filename = `${slugify(payload.brand)}-ai-visibility-report-${isoDate}.md`;
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
