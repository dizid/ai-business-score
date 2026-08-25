// Label maps shared between ScanDetail.vue (renders them in the UI) and
// scanReport.ts (renders the same wording into the downloadable Markdown
// report) — pulled out of ScanDetail.vue's <script setup> block because
// nothing declared there is importable by another module. Moving here
// keeps the UI and the report from independently drifting on wording.
import type { AdviceId, Rank } from './scanPayload';

export const SENTIMENT_LABEL: Record<string, string> = {
  recommended: 'Recommended',
  neutral: 'Neutral',
  negative: 'Negative',
  'comparison-only': 'Comparison only',
};

export const CATEGORY_LABEL: Record<string, string> = {
  'high-intent': 'High-intent',
  comparison: 'Comparison',
  informational: 'Informational',
};
export const CATEGORY_ORDER = ['high-intent', 'comparison', 'informational'] as const;
export const SENTIMENT_SUMMARY_ORDER = ['recommended', 'neutral', 'comparison-only', 'negative'] as const;

// Short "why this matters" copy per query category — static/templated, not
// an LLM call, shown under each row in "Performance by query type" so the
// percentages read as more than a bare number.
export const CATEGORY_EXPLAIN: Record<string, string> = {
  'high-intent': 'Buying-ready queries ("best X for Y") — AIs answer these from comparison/listicle-style content and "best for" pages, not general brand awareness.',
  comparison: 'Direct brand-vs-brand queries — won by clear entity differentiation, not by being "quality" in the same generic way every competitor claims.',
  informational: 'Category-overview queries ("leaders in X", "top companies in Y") — won by being named in existing roundups and definitional content, not by product pages.',
};

// Citation tier: how many total citations a response carried alongside the
// brand's own-site citation — 1 = the brand's page was the only source used,
// 2-3 = a primary source among a few, 4+ = one of many. Pure re-derivation
// of citations already collected (no new LLM call), the right-sized version
// of "citation quality" scoring.
export const CITATION_TIER_LABEL: Record<string, string> = {
  'sole-source': 'Sole source',
  'primary-source': 'Primary source',
  'one-of-several': 'One of several sources',
};

export const BAND_LABEL: Record<string, string> = {
  leading: 'Leading', visible: 'Visible, often beaten',
  weak: 'Weak presence', invisible: 'Invisible', unavailable: 'Score unavailable',
};
export const BAND_EXPLAIN: Record<string, string> = {
  leading: 'Consistently the first brand AI mentions.',
  visible: 'AI knows this brand, but doesn’t always lead with it.',
  weak: 'Rarely comes up — mostly beaten or skipped.',
  invisible: 'Never came up in any completed check.',
  unavailable: 'Not enough checks completed to give a reliable score. This is likely a temporary issue with the AI providers. Please try again.',
};

// Milestone A6: was keyed by `tone`, which collapsed multiple distinct
// insights onto one shared label — 'mixed' and 'top-rival' both use
// tone 'neutral', so a scan with both cards showed two identically-labeled
// "ALSO WORTH NOTING" cards (real, reported bug, read as a duplicate/
// glitch). Keying by `id` instead gives every distinct insight branch in
// selectAdvice() its own heading — id has always been part of the payload
// shape, so this is backward compatible with every already-persisted scan.
export const ADVICE_HEADING: Record<AdviceId, string> = {
  'no-data': 'No data',
  'zero-citations': 'Priority',
  'consistently-beaten': 'Watch this',
  leading: 'Working well',
  mixed: 'Mixed results',
  'top-rival': 'Top competitor',
};
export const CHECK_BADGE_LABEL: Record<Rank, string> = {
  'ranked-1': 'Mentioned first',
  'ranked-2': 'Mentioned 2nd',
  'ranked-3': 'Mentioned 3rd',
  mentioned: 'Mentioned, not top 3',
  'not-mentioned': 'Not mentioned',
  // legacy value, see the Rank type comment in scanPayload.ts
  beaten: 'Mentioned, but beaten',
};

// Site Health (formerly "Harmonia" — internal name, renamed in the UI
// 2026-08-23; shared/harmonia.mjs and the DB column keep the old name, see
// root CLAUDE.md's AIVis->Foreground rename for the precedent on why).
export const HARMONIA_PILLAR_LABELS = {
  technicalSeo: 'Technical SEO',
  onPageSeo: 'On-Page SEO',
  contentStructure: 'Content Structure',
  uxSignals: 'UX Signals',
} as const;
