// Shared payload shape + validation for a completed scan result. Used by
// both result/App.vue (payload arrives via an untrusted, forgeable URL
// fragment — see that file's header comment) and history/App.vue (payload
// arrives from our own /history endpoint, which returns Blobs-stored
// records verbatim). Reusing the same fail-closed validator for both means
// a malformed record degrades the same way — a skipped/blank field, never a
// thrown error — regardless of which page renders it.

// 'beaten' is a legacy rank value from the pre-positional-ranking scoring
// model — no longer produced by aggregateProspect, but scans persisted
// before that change still have it in their stored perPromptRank, so it
// stays accepted here rather than making old scans fail validation.
export type Rank = 'ranked-1' | 'ranked-2' | 'ranked-3' | 'mentioned' | 'not-mentioned' | 'beaten';
export type AdviceId = 'no-data' | 'zero-citations' | 'consistently-beaten' | 'leading' | 'mixed' | 'top-rival';
export type AdviceTone = 'critical' | 'warning' | 'positive' | 'neutral';

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface PerPromptRank { promptIndex: number; rank: Rank; }
export interface CompetitorTally { name: string; mentionCount: number; beatBrandCount: number; ambiguous: boolean; }
export interface AdviceCard { id: AdviceId; tone: AdviceTone; params: Record<string, unknown>; }
export interface Citation { url: string; title: string; }
export interface RawResponse { promptIndex: number; model: string; text: string; citations: Citation[]; }
export interface OwnSiteCitation { promptIndex: number; model: string; url: string; title: string; }
export type SentimentClassification = 'recommended' | 'neutral' | 'negative' | 'comparison-only';
export interface SentimentJudgment { promptIndex: number; model: string; classification: SentimentClassification; reasoning: string; }
export interface FailureItem { model: string; promptIndex: number; error: string; }
export interface DeepAdviceStep { title: string; reasoning: string; difficulty: Difficulty; }
export interface DeepAdvice { steps: DeepAdviceStep[]; }

// Harmonia: a technical/on-page/content-structure/UX audit of the scanned
// business's own website — a SEPARATE, secondary score from the AI
// Visibility Score above, never blended into it. See shared/harmonia.mjs
// for how this is computed.
export interface HarmoniaCheck { id: string; label: string; passed: boolean; }
export interface HarmoniaPillar { score: number | null; checks: HarmoniaCheck[]; }
export interface HarmoniaSchemaNode { valid: boolean; type: string | null; issues: string[]; }
export interface HarmoniaSchemaOpportunity { type: string; reason: string; example: string; }
// One of the 5 extra PSI Lighthouse audits requested alongside performance
// (same call, same latency/cost budget — see shared/harmonia.mjs's
// PSI_AUDIT_IDS). `passed` is null when PSI didn't return a score for this
// audit id at all (rare, but the source `extractPsiSignals` allows it),
// distinct from a real pass/fail.
export interface HarmoniaAdditionalAudit { id: string; label: string; passed: boolean | null; }
export interface HarmoniaCoreWebVitals {
  strategy: string;
  performanceScore: number | null;
  seoScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  lcpMs: number | null;
  clsScore: number | null;
  inpMs: number | null;
  additionalAudits: HarmoniaAdditionalAudit[];
}
// Visible-but-unscored signals harmonia.mjs collects alongside the four
// weighted pillars above — not folded into any pillar score (see that
// file's own comment on additionalSeoSignals for why), just extra detail
// worth showing rather than discarding.
export interface HarmoniaHreflangTag { hreflang: string | null; href: string | null; }
export interface HarmoniaTwitterTag { name: string | null; content: string; }
export interface HarmoniaAdditionalSeoSignals {
  htmlLang: string | null;
  faviconPresent: boolean;
  manifestPresent: boolean;
  hreflangTags: HarmoniaHreflangTag[];
  twitterCard: HarmoniaTwitterTag[];
  sitemapUrlCount: number | null;
  sitemapIsIndex: boolean;
}
export interface HarmoniaSecurityHeader { header: string; present: boolean; }
// Per-bot robots.txt access for the AI crawlers a GEO tool cares about
// (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, etc.) — distinct from
// the generic `robots` check in technicalSeo.checks, which only covers a
// blanket `User-agent: *` disallow.
export interface HarmoniaAiCrawlerBot { bot: string; provider: string; matched: boolean; blocked: boolean; }
export interface HarmoniaAiCrawlerAccess { bots: HarmoniaAiCrawlerBot[]; blockedCount: number; checkedCount: number; }
export interface HarmoniaResult {
  fetchedUrl: string;
  statusCode: number | null;
  checkedAtDate: Date;
  harmoniaScore: number | null;
  pillars: {
    technicalSeo: HarmoniaPillar;
    onPageSeo: HarmoniaPillar;
    contentStructure: HarmoniaPillar;
    uxSignals: HarmoniaPillar;
  };
  schema: { detected: HarmoniaSchemaNode[]; opportunities: HarmoniaSchemaOpportunity[] };
  coreWebVitals: HarmoniaCoreWebVitals | null;
  securityHeaders: HarmoniaSecurityHeader[];
  aiCrawlerAccess: HarmoniaAiCrawlerAccess;
  additionalSeoSignals: HarmoniaAdditionalSeoSignals | null;
  errors: string[];
}

// Entity presence: a lightweight off-site authority signal, distinct from
// Harmonia (which only ever audits the scanned business's own site). See
// shared/entityPresence.mjs for how this is computed.
export interface EntityPresenceResult {
  wikipediaFound: boolean;
  wikipediaUrl: string | null;
  linksToOwnSite: boolean | null;
  checkedAtDate: Date;
  errors: string[];
}

// Clarity check: does the business's own homepage state something specific
// and quotable, versus only generic marketing filler? See
// shared/aivis-core.mjs's buildClarityCheckPrompt for the full reasoning —
// added 2026-09-04 in place of guessing at vertical-specific prompt wording.
export interface ClarityCheckResult {
  hasSpecificClaim: boolean;
  quote: string | null;
  reasoning: string;
}

export interface ValidatedPayload {
  id: string;
  brand: string;
  website: string;
  safeWebsiteHref: string | null;
  category: string;
  citedCount: number;
  completedCalls: number;
  failedCalls: number;
  ambiguousBrandFlag: boolean;
  perPromptRank: PerPromptRank[];
  competitorTallies: CompetitorTally[];
  score: number | null;
  advice: AdviceCard[];
  rawResponses: RawResponse[];
  ownSiteCitations: OwnSiteCitation[];
  sentimentJudgments: SentimentJudgment[];
  failures: FailureItem[];
  generatedAtDate: Date;
  startedAtDate: Date | null;
  deepAdvice: DeepAdvice | null;
  deepAdviceGeneratedAtDate: Date | null;
  harmonia: HarmoniaResult | null;
  entityPresence: EntityPresenceResult | null;
  clarityCheck: ClarityCheckResult | null;
}

const RANKS = new Set(['ranked-1', 'ranked-2', 'ranked-3', 'mentioned', 'not-mentioned', 'beaten']);
const ADVICE_IDS = new Set(['no-data', 'zero-citations', 'consistently-beaten', 'leading', 'mixed', 'top-rival']);
const ADVICE_TONES = new Set(['critical', 'warning', 'positive', 'neutral']);
const DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard']);
const MAX_COMPETITORS = 12;
const MAX_ADVICE_CARDS = 3;
const MAX_DEEP_ADVICE_STEPS = 5;
const MAX_NAME_LEN = 120;
const MAX_TEXT_LEN = 600;
const MAX_FAILURES = 40;
const MAX_ERROR_LEN = 300;
const MAX_CITATIONS_PER_RESPONSE = 20;
const MAX_OWN_SITE_CITATIONS = 60;
const MAX_URL_LEN = 2000;
const SENTIMENT_CLASSIFICATIONS = new Set(['recommended', 'neutral', 'negative', 'comparison-only']);
const MAX_SENTIMENT_JUDGMENTS = 20;
const MAX_REASONING_LEN = 300;
const MAX_HARMONIA_CHECKS = 20;
const MAX_SCHEMA_NODES = 40;
const MAX_SCHEMA_OPPORTUNITIES = 10;
const MAX_SECURITY_HEADERS = 10;
const MAX_HARMONIA_ERRORS = 20;
const MAX_SCHEMA_EXAMPLE_LEN = 3000;
const MAX_ISSUE_LEN = 200;
const MAX_ISSUES_PER_NODE = 10;
const MAX_AI_CRAWLER_BOTS = 20;
const MAX_ADDITIONAL_AUDITS = 10;
const MAX_HREFLANG_TAGS = 30;
const MAX_TWITTER_TAGS = 10;
const MAX_LANG_LEN = 20;

// href-safety, same rule as the website link below: only http(s) survives,
// anything else (javascript:, data:, etc.) is dropped rather than escaped.
function asSafeUrl(v: unknown): string | null {
  return typeof v === 'string' && v.length <= MAX_URL_LEN && /^https?:\/\//i.test(v) ? v : null;
}

function asCitations(raw: unknown): Citation[] {
  if (!Array.isArray(raw)) return [];
  const citations: Citation[] = [];
  for (const c of raw.slice(0, MAX_CITATIONS_PER_RESPONSE)) {
    const url = asSafeUrl(c && c.url);
    if (!url) continue;
    const title = typeof (c && c.title) === 'string' ? c.title.slice(0, MAX_NAME_LEN * 2) : '';
    citations.push({ url, title });
  }
  return citations;
}

export function asNonNegativeInt(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) return null;
  return n;
}

export function asShortString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_NAME_LEN ? v : null;
}

// Real competitor-quote excerpt attached to an advice card's params
// (selectAdvice, aivis-core.mjs) — same shape used for deep advice's LLM
// prompt, structured instead of pre-formatted for rendering here. `params`
// itself isn't per-field validated (see the `advice` loop below), so this
// reads it defensively the same way asShortString/asNonNegativeInt do.
export interface AdviceExcerpt { promptLabel: string; snippet: string; }
export function asAdviceExcerpt(v: unknown): AdviceExcerpt | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const promptLabel = asShortString(o.promptLabel);
  const snippet = typeof o.snippet === 'string' && o.snippet.length > 0 && o.snippet.length <= MAX_TEXT_LEN ? o.snippet : null;
  if (!promptLabel || !snippet) return null;
  return { promptLabel, snippet };
}

export function b64urlDecode(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const withPad = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  return decodeURIComponent(
    atob(withPad)
      .split('')
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('')
  );
}

function asHarmoniaScore(v: unknown): number | null {
  if (v === null) return null;
  const n = asNonNegativeInt(v);
  return n === null || n > 100 ? null : n;
}

function asHarmoniaChecks(raw: unknown): HarmoniaCheck[] {
  if (!Array.isArray(raw)) return [];
  const checks: HarmoniaCheck[] = [];
  for (const c of raw.slice(0, MAX_HARMONIA_CHECKS)) {
    const id = asShortString(c && c.id);
    const label = typeof (c && c.label) === 'string' ? c.label.slice(0, MAX_TEXT_LEN) : null;
    if (id === null || label === null || typeof (c && c.passed) !== 'boolean') continue;
    checks.push({ id, label, passed: c.passed });
  }
  return checks;
}

function asAdditionalAudits(raw: unknown): HarmoniaAdditionalAudit[] {
  if (!Array.isArray(raw)) return [];
  const audits: HarmoniaAdditionalAudit[] = [];
  for (const a of raw.slice(0, MAX_ADDITIONAL_AUDITS)) {
    const id = asShortString(a && a.id);
    const label = typeof (a && a.label) === 'string' ? a.label.slice(0, MAX_TEXT_LEN) : null;
    if (id === null || label === null) continue;
    const passed = typeof (a && a.passed) === 'boolean' ? a.passed : null;
    audits.push({ id, label, passed });
  }
  return audits;
}

function asHreflangTags(raw: unknown): HarmoniaHreflangTag[] {
  if (!Array.isArray(raw)) return [];
  const tags: HarmoniaHreflangTag[] = [];
  for (const t of raw.slice(0, MAX_HREFLANG_TAGS)) {
    if (!t || typeof t !== 'object') continue;
    const hreflang = typeof t.hreflang === 'string' ? t.hreflang.slice(0, MAX_LANG_LEN) : null;
    const href = typeof t.href === 'string' ? t.href.slice(0, MAX_URL_LEN) : null;
    tags.push({ hreflang, href });
  }
  return tags;
}

function asTwitterTags(raw: unknown): HarmoniaTwitterTag[] {
  if (!Array.isArray(raw)) return [];
  const tags: HarmoniaTwitterTag[] = [];
  for (const t of raw.slice(0, MAX_TWITTER_TAGS)) {
    if (!t || typeof t !== 'object') continue;
    const name = typeof t.name === 'string' ? t.name.slice(0, MAX_NAME_LEN) : null;
    const content = typeof t.content === 'string' ? t.content.slice(0, MAX_TEXT_LEN) : '';
    tags.push({ name, content });
  }
  return tags;
}

// additionalSeoSignals is visible-but-unscored (see harmonia.mjs) — same
// lenient degrade-to-null treatment as every other optional Harmonia
// sub-section, since it's bonus detail, not something a pillar score
// depends on.
function asAdditionalSeoSignals(raw: unknown): HarmoniaAdditionalSeoSignals | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  return {
    htmlLang: typeof r.htmlLang === 'string' ? r.htmlLang.slice(0, MAX_LANG_LEN) : null,
    faviconPresent: r.faviconPresent === true,
    manifestPresent: r.manifestPresent === true,
    hreflangTags: asHreflangTags(r.hreflangTags),
    twitterCard: asTwitterTags(r.twitterCard),
    sitemapUrlCount: r.sitemapUrlCount !== undefined && r.sitemapUrlCount !== null ? asNonNegativeInt(r.sitemapUrlCount) : null,
    sitemapIsIndex: r.sitemapIsIndex === true,
  };
}

function asHarmoniaPillar(raw: unknown): HarmoniaPillar {
  if (!raw || typeof raw !== 'object') return { score: null, checks: [] };
  const r = raw as Record<string, unknown>;
  return { score: asHarmoniaScore(r.score), checks: asHarmoniaChecks(r.checks) };
}

// harmonia is a whole secondary report section — same lenient
// degrade-on-malformed treatment as deepAdvice above (missing, null, or
// any structural issue degrades to null rather than rejecting the whole
// payload), since it's additive on top of the always-present AI score.
function asHarmonia(raw: unknown): HarmoniaResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  if (typeof r.fetchedUrl !== 'string') return null;
  const checkedAtDate = new Date(r.checkedAtDate);
  if (Number.isNaN(checkedAtDate.getTime())) return null;

  const statusCode = typeof r.statusCode === 'number' ? r.statusCode : null;
  const harmoniaScore = asHarmoniaScore(r.harmoniaScore);

  const pillars = {
    technicalSeo: asHarmoniaPillar(r.pillars?.technicalSeo),
    onPageSeo: asHarmoniaPillar(r.pillars?.onPageSeo),
    contentStructure: asHarmoniaPillar(r.pillars?.contentStructure),
    uxSignals: asHarmoniaPillar(r.pillars?.uxSignals),
  };

  const detected: HarmoniaSchemaNode[] = [];
  if (Array.isArray(r.schema?.detected)) {
    for (const n of r.schema.detected.slice(0, MAX_SCHEMA_NODES)) {
      if (!n || typeof n.valid !== 'boolean') continue;
      const type = typeof n.type === 'string' ? n.type.slice(0, MAX_NAME_LEN) : null;
      const issues = Array.isArray(n.issues)
        ? n.issues.filter((i: unknown) => typeof i === 'string').slice(0, MAX_ISSUES_PER_NODE).map((i: string) => i.slice(0, MAX_ISSUE_LEN))
        : [];
      detected.push({ valid: n.valid, type, issues });
    }
  }

  const opportunities: HarmoniaSchemaOpportunity[] = [];
  if (Array.isArray(r.schema?.opportunities)) {
    for (const o of r.schema.opportunities.slice(0, MAX_SCHEMA_OPPORTUNITIES)) {
      const type = asShortString(o && o.type);
      const reason = typeof (o && o.reason) === 'string' ? o.reason.slice(0, MAX_TEXT_LEN) : null;
      const example = typeof (o && o.example) === 'string' ? o.example.slice(0, MAX_SCHEMA_EXAMPLE_LEN) : null;
      if (type === null || reason === null || example === null) continue;
      opportunities.push({ type, reason, example });
    }
  }

  let coreWebVitals: HarmoniaCoreWebVitals | null = null;
  if (r.coreWebVitals && typeof r.coreWebVitals === 'object') {
    const cwv = r.coreWebVitals;
    coreWebVitals = {
      strategy: typeof cwv.strategy === 'string' ? cwv.strategy.slice(0, 20) : 'mobile',
      performanceScore: asHarmoniaScore(cwv.performanceScore),
      seoScore: asHarmoniaScore(cwv.seoScore),
      accessibilityScore: asHarmoniaScore(cwv.accessibilityScore),
      bestPracticesScore: asHarmoniaScore(cwv.bestPracticesScore),
      lcpMs: typeof cwv.lcpMs === 'number' ? cwv.lcpMs : null,
      clsScore: typeof cwv.clsScore === 'number' ? cwv.clsScore : null,
      inpMs: typeof cwv.inpMs === 'number' ? cwv.inpMs : null,
      additionalAudits: asAdditionalAudits(cwv.additionalAudits),
    };
  }

  const securityHeaders: HarmoniaSecurityHeader[] = [];
  if (Array.isArray(r.securityHeaders)) {
    for (const h of r.securityHeaders.slice(0, MAX_SECURITY_HEADERS)) {
      const header = asShortString(h && h.header);
      if (header === null || typeof (h && h.present) !== 'boolean') continue;
      securityHeaders.push({ header, present: h.present });
    }
  }

  const errors = Array.isArray(r.errors)
    ? r.errors.filter((e: unknown) => typeof e === 'string').slice(0, MAX_HARMONIA_ERRORS).map((e: string) => e.slice(0, MAX_ERROR_LEN))
    : [];

  // Older stored scans predate this field — degrade to an empty/zeroed
  // result rather than dropping the whole harmonia payload, same lenient
  // pattern as every other optional sub-field above.
  const aiCrawlerAccess: HarmoniaAiCrawlerAccess = { bots: [], blockedCount: 0, checkedCount: 0 };
  if (r.aiCrawlerAccess && typeof r.aiCrawlerAccess === 'object') {
    const aca = r.aiCrawlerAccess;
    if (Array.isArray(aca.bots)) {
      for (const b of aca.bots.slice(0, MAX_AI_CRAWLER_BOTS)) {
        const bot = asShortString(b && b.bot);
        const provider = asShortString(b && b.provider);
        if (bot === null || provider === null || typeof (b && b.matched) !== 'boolean' || typeof (b && b.blocked) !== 'boolean') continue;
        aiCrawlerAccess.bots.push({ bot, provider, matched: b.matched, blocked: b.blocked });
      }
    }
    aiCrawlerAccess.blockedCount = aiCrawlerAccess.bots.filter((b) => b.blocked).length;
    aiCrawlerAccess.checkedCount = aiCrawlerAccess.bots.length;
  }

  return {
    fetchedUrl: r.fetchedUrl.slice(0, MAX_URL_LEN),
    statusCode,
    checkedAtDate,
    harmoniaScore,
    pillars,
    schema: { detected, opportunities },
    coreWebVitals,
    securityHeaders,
    aiCrawlerAccess,
    additionalSeoSignals: asAdditionalSeoSignals(r.additionalSeoSignals),
    errors,
  };
}

// entityPresence is a whole secondary report section — same lenient
// degrade-on-malformed treatment as asHarmonia above (missing, null, or any
// structural issue degrades to null rather than rejecting the whole
// payload), since it's additive on top of the always-present AI score.
function asEntityPresence(raw: unknown): EntityPresenceResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  if (typeof r.wikipediaFound !== 'boolean') return null;
  const checkedAtDate = new Date(r.checkedAtDate);
  if (Number.isNaN(checkedAtDate.getTime())) return null;
  const wikipediaUrl = typeof r.wikipediaUrl === 'string' ? asSafeUrl(r.wikipediaUrl) : null;
  const linksToOwnSite = typeof r.linksToOwnSite === 'boolean' ? r.linksToOwnSite : null;
  const errors = Array.isArray(r.errors)
    ? r.errors.filter((e: unknown) => typeof e === 'string').slice(0, MAX_HARMONIA_ERRORS).map((e: string) => e.slice(0, MAX_ERROR_LEN))
    : [];
  return { wikipediaFound: r.wikipediaFound, wikipediaUrl, linksToOwnSite, checkedAtDate, errors };
}

// clarityCheck is new (2026-09-04) — same lenient degrade-to-null treatment
// as asEntityPresence/asHarmonia above: missing, null, or malformed all
// degrade to null rather than rejecting the whole payload, since it's a
// secondary signal, not something the primary AI score depends on.
function asClarityCheck(raw: unknown): ClarityCheckResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  if (typeof r.hasSpecificClaim !== 'boolean') return null;
  const quote = r.hasSpecificClaim && typeof r.quote === 'string' && r.quote.length <= MAX_TEXT_LEN ? r.quote : null;
  const reasoning = typeof r.reasoning === 'string' ? r.reasoning.slice(0, MAX_REASONING_LEN) : '';
  return { hasSpecificClaim: r.hasSpecificClaim, quote, reasoning };
}

// This validator is the only thing standing between a hostile/forged
// payload and whatever renders it — fail closed: reject anything that
// doesn't match the exact shape scan.mts produces, rather than coercing.
export function validatePayload(raw: any): ValidatedPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  if (typeof raw.brand !== 'string' || typeof raw.website !== 'string' || typeof raw.category !== 'string') return null;

  const citedCount = asNonNegativeInt(raw.citedCount);
  const completedCalls = asNonNegativeInt(raw.completedCalls);
  const failedCalls = asNonNegativeInt(raw.failedCalls);
  if (citedCount === null || completedCalls === null || failedCalls === null) return null;

  if (!Array.isArray(raw.perPromptRank)) return null;
  const perPromptRank: PerPromptRank[] = [];
  for (const r of raw.perPromptRank) {
    const promptIndex = asNonNegativeInt(r && r.promptIndex);
    if (promptIndex === null || !RANKS.has(r.rank)) return null;
    perPromptRank.push({ promptIndex, rank: r.rank });
  }

  // score: null (unavailable) or a 0-100 integer. Never trust a forged
  // score blindly — recomputing it from perPromptRank/completedCalls would
  // be the fully-defensive option, but the formula is deliberately
  // duplicated nowhere else client-side; bounds-check instead.
  let score: number | null = null;
  if (raw.score !== null) {
    const n = asNonNegativeInt(raw.score);
    if (n === null || n > 100) return null;
    score = n;
  }

  const competitorTallies: CompetitorTally[] = [];
  if (raw.competitorTallies !== undefined) {
    if (!Array.isArray(raw.competitorTallies) || raw.competitorTallies.length > MAX_COMPETITORS) return null;
    for (const c of raw.competitorTallies) {
      const name = asShortString(c && c.name);
      const mentionCount = asNonNegativeInt(c && c.mentionCount);
      const beatBrandCount = asNonNegativeInt(c && c.beatBrandCount);
      if (name === null || mentionCount === null || beatBrandCount === null) return null;
      if (mentionCount > completedCalls || beatBrandCount > mentionCount) return null;
      // ambiguous is new (Milestone A2) — missing/old data (pre-migration
      // scans, or a forged payload that omits it) defaults to false rather
      // than rejecting the whole payload.
      const ambiguous = c && c.ambiguous === true;
      competitorTallies.push({ name, mentionCount, beatBrandCount, ambiguous });
    }
  }

  const advice: AdviceCard[] = [];
  if (raw.advice !== undefined) {
    if (!Array.isArray(raw.advice) || raw.advice.length > MAX_ADVICE_CARDS) return null;
    for (const a of raw.advice) {
      if (!a || typeof a !== 'object') return null;
      if (!ADVICE_IDS.has(a.id) || !ADVICE_TONES.has(a.tone)) return null;
      const params = a.params && typeof a.params === 'object' ? a.params : {};
      advice.push({ id: a.id, tone: a.tone, params });
    }
  }

  if (!Array.isArray(raw.rawResponses)) return null;
  const rawResponses: RawResponse[] = [];
  for (const r of raw.rawResponses) {
    const promptIndex = asNonNegativeInt(r && r.promptIndex);
    if (promptIndex === null || typeof r.model !== 'string' || typeof r.text !== 'string') return null;
    rawResponses.push({ promptIndex, model: r.model, text: r.text, citations: asCitations(r.citations) });
  }

  // ownSiteCitations is new (Milestone F) — missing/malformed degrades to
  // [] rather than rejecting the whole payload, same lenient treatment as
  // failures/competitorTallies' ambiguous flag above (diagnostic/bonus
  // detail, not something the rest of the UI depends on for correctness).
  const ownSiteCitations: OwnSiteCitation[] = [];
  if (Array.isArray(raw.ownSiteCitations)) {
    for (const c of raw.ownSiteCitations.slice(0, MAX_OWN_SITE_CITATIONS)) {
      const promptIndex = asNonNegativeInt(c && c.promptIndex);
      const url = asSafeUrl(c && c.url);
      if (promptIndex === null || url === null || typeof (c && c.model) !== 'string') continue;
      const title = typeof c.title === 'string' ? c.title.slice(0, MAX_NAME_LEN * 2) : '';
      ownSiteCitations.push({ promptIndex, model: c.model.slice(0, MAX_NAME_LEN), url, title });
    }
  }

  // failures: optional diagnostic list (why calls failed) — new in
  // Milestone A3. Missing/malformed degrades to [] rather than rejecting
  // the whole payload (old rows predate the column; a forged payload might
  // omit it entirely) — same lenient discipline as competitorTallies'
  // ambiguous flag above, since this is diagnostic detail, not something
  // the rest of the UI depends on for correctness.
  const failures: FailureItem[] = [];
  if (Array.isArray(raw.failures)) {
    for (const f of raw.failures.slice(0, MAX_FAILURES)) {
      const promptIndex = asNonNegativeInt(f && f.promptIndex);
      if (promptIndex === null || typeof (f && f.model) !== 'string') continue;
      const error = typeof f.error === 'string' ? f.error.slice(0, MAX_ERROR_LEN) : '';
      failures.push({ model: f.model.slice(0, MAX_NAME_LEN), promptIndex, error });
    }
  }

  // sentimentJudgments is new (Milestone F) — same lenient degrade-to-[]
  // treatment as ownSiteCitations/failures above; empty until a user has
  // judged at least one check.
  const sentimentJudgments: SentimentJudgment[] = [];
  if (Array.isArray(raw.sentimentJudgments)) {
    for (const j of raw.sentimentJudgments.slice(0, MAX_SENTIMENT_JUDGMENTS)) {
      const promptIndex = asNonNegativeInt(j && j.promptIndex);
      if (promptIndex === null || typeof (j && j.model) !== 'string' || !SENTIMENT_CLASSIFICATIONS.has(j.classification)) continue;
      const reasoning = typeof j.reasoning === 'string' ? j.reasoning.slice(0, MAX_REASONING_LEN) : '';
      sentimentJudgments.push({
        promptIndex,
        model: j.model.slice(0, MAX_NAME_LEN),
        classification: j.classification,
        reasoning,
      });
    }
  }

  const generatedAtDate = new Date(raw.generatedAt);
  if (Number.isNaN(generatedAtDate.getTime())) return null;

  // deepAdvice is genuinely optional (may not have been generated yet) —
  // missing/null/malformed all degrade to null rather than rejecting the
  // whole payload, since it's a bonus on top of the always-present
  // rule-based advice above.
  let deepAdvice: DeepAdvice | null = null;
  if (raw.deepAdvice && typeof raw.deepAdvice === 'object' && Array.isArray(raw.deepAdvice.steps)) {
    const steps: DeepAdviceStep[] = [];
    for (const s of raw.deepAdvice.steps.slice(0, MAX_DEEP_ADVICE_STEPS)) {
      if (!s || typeof s.title !== 'string' || !s.title) continue;
      steps.push({
        title: s.title.slice(0, MAX_NAME_LEN * 2),
        reasoning: typeof s.reasoning === 'string' ? s.reasoning.slice(0, MAX_TEXT_LEN) : '',
        difficulty: DIFFICULTIES.has(s.difficulty) ? s.difficulty : 'Medium',
      });
    }
    if (steps.length) deepAdvice = { steps };
  }
  let deepAdviceGeneratedAtDate: Date | null = null;
  if (typeof raw.deepAdviceGeneratedAt === 'string') {
    const d = new Date(raw.deepAdviceGeneratedAt);
    if (!Number.isNaN(d.getTime())) deepAdviceGeneratedAtDate = d;
  }

  // startedAt is new (scan timing) — same lenient degrade-to-null treatment
  // as deepAdviceGeneratedAt above: missing (pre-migration scans) or
  // malformed never rejects the whole payload, it just means no duration
  // can be shown for this scan.
  let startedAtDate: Date | null = null;
  if (typeof raw.startedAt === 'string') {
    const d = new Date(raw.startedAt);
    if (!Number.isNaN(d.getTime())) startedAtDate = d;
  }

  // href-safety: only http(s) links get rendered as clickable — anything
  // else (javascript:, data:, etc.) is dropped rather than escaped, since
  // HTML-escaping a URL does not neutralize a javascript: scheme.
  const safeWebsiteHref = /^https?:\/\//i.test(raw.website) ? raw.website : null;

  return {
    id: raw.id,
    brand: raw.brand,
    website: raw.website,
    safeWebsiteHref,
    category: raw.category,
    citedCount,
    completedCalls,
    failedCalls,
    ambiguousBrandFlag: raw.ambiguousBrandFlag === true,
    perPromptRank,
    competitorTallies,
    score,
    advice,
    rawResponses,
    ownSiteCitations,
    sentimentJudgments,
    failures,
    generatedAtDate,
    startedAtDate,
    deepAdvice,
    deepAdviceGeneratedAtDate,
    harmonia: raw.harmonia !== undefined ? asHarmonia(raw.harmonia) : null,
    entityPresence: raw.entityPresence !== undefined ? asEntityPresence(raw.entityPresence) : null,
    clarityCheck: raw.clarityCheck !== undefined ? asClarityCheck(raw.clarityCheck) : null,
  };
}
