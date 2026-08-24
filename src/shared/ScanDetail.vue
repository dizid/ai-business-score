<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { scoreBand, PROMPT_LABELS } from '../../shared/aivis-core.mjs';
import { asNonNegativeInt, asShortString, type ValidatedPayload, type Rank } from './scanPayload';
import CollapsibleSection from './CollapsibleSection.vue';
import {
  SENTIMENT_LABEL, BAND_LABEL, BAND_EXPLAIN, ADVICE_HEADING, CHECK_BADGE_LABEL,
} from './scanLabels';
import Icon from './Icon.vue';
import {
  sentimentKey, deriveSentimentByKey, deriveSentimentSummaryRows, deriveCategoryBreakdown, deriveSentimentAdvice,
  deriveRank1Count, deriveBeatenCount, deriveHeadlineKind, deriveScoreboardRows, scoreboardRowPct,
  deriveCheckBreakdown, deriveFailureRows, deriveOwnSiteCitationRows, deriveVisibleAdvice,
  deriveHarmoniaPillars, deriveHarmoniaBand, cwvRating, formatSeconds, deriveScanDurationLabel,
  type ScoreboardRow,
} from './scanDerived';
import { buildScanReportMarkdown, downloadMarkdown } from './scanReport';

// Shared between result/App.vue (a shareable, standalone page) and
// CompanyDetailView.vue's detail pane (master-detail dashboard) — same
// rendering for the same validated payload shape, so the two views can
// never drift out of sync the way two hand-copied templates eventually
// would.
//
// allowDeepAdvice/deepAdviceLoading + the generate-deep-advice emit (and,
// same reasoning, allowSentimentJudge/sentimentJudgeLoadingKey + the
// judge-sentiment emit) are the deliberate exceptions to "purely
// presentational, no other props, no emits" (Milestone 6, extended for the
// Milestone F sentiment judge): result/App.vue has no auth system at all
// (old shareable links are static, decode-only), so it never sets either
// allow* prop — only CompanyDetailView.vue does, and it owns the actual
// authenticated fetch calls, keeping this component itself auth-agnostic.
//
// theme (2026-08-23 dashboard redesign): same shape of exception, one more
// time. Defaults to 'legacy' — the pre-redesign visual treatment — so
// result/App.vue (old shareable links, which brand/BRAND.md still promises
// stay "calm, muted, professional" unchanged) needs zero code changes and
// is provably unaffected by default. CompanyDetailView.vue passes
// theme="dashboard" explicitly to opt into the new palette/graphics, all
// gated behind a `.theme-dashboard` class on the component root below.
const props = withDefaults(
  defineProps<{
    payload: ValidatedPayload;
    allowDeepAdvice?: boolean;
    // True when the caller is signed in but not entitled (not Pro, no
    // one-time purchase) — renders an upgrade CTA in place of the button
    // instead of hiding the whole section. Distinct from allowDeepAdvice
    // being merely false, which is what result.html's unauthenticated
    // context looks like and should stay silent for.
    deepAdviceLocked?: boolean;
    deepAdviceLoading?: boolean;
    allowSentimentJudge?: boolean;
    // Key of the check currently being judged (`${promptIndex}:${model}`),
    // or null — a per-check loading state rather than one global boolean,
    // since a user could plausibly have two checks expanded at once.
    sentimentJudgeLoadingKey?: string | null;
    theme?: 'dashboard' | 'legacy';
  }>(),
  {
    allowDeepAdvice: false,
    deepAdviceLocked: false,
    deepAdviceLoading: false,
    allowSentimentJudge: false,
    sentimentJudgeLoadingKey: null,
    theme: 'legacy',
  }
);
defineEmits<{ 'generate-deep-advice': []; 'judge-sentiment': [promptIndex: number, model: string]; 'upgrade': [] }>();

// Sentiment/category/scoreboard/check-breakdown aggregation logic lives in
// scanDerived.ts (imported above) — shared verbatim with scanReport.ts so
// the downloadable report and this UI can never independently drift on the
// same numbers. Each computed() below is a thin wrapper around a derive*()
// function, unchanged in behavior from before this file was split.
const sentimentByKey = computed(() => deriveSentimentByKey(props.payload));
// Overview-tab summary (2026-08-20): sentiment is now auto-judged for most
// mentions during the scan itself (see run-scan-background.mts), so it's
// no longer worth burying entirely in the per-check Details accordion —
// this rollup gives an at-a-glance read without expanding anything.
const sentimentSummaryRows = computed(() => deriveSentimentSummaryRows(props.payload));

// "Performance by query type" (Overview tab): computeScore already weights
// each check by its prompt category (high-intent 3x, comparison 2x,
// informational 1x, see aivis-core.mjs's DEFAULT_QUERY_WEIGHTS) but that
// breakdown was never surfaced — the single 0-100 score and the competitor
// bar chart don't explain *why* it's what it is. Also folds in the
// sentiment mix per category rather than building a second breakdown.
const categoryBreakdown = computed(() => deriveCategoryBreakdown(props.payload));

// Sentiment-aware advice card (Overview tab): computed client-side, not
// added to the server-side selectAdvice() output, because sentiment
// judging finishes AFTER selectAdvice() runs in run-scan-background.mts,
// and a user can also judge more checks later via the manual "Judge
// sentiment" button in the Details tab — a client-side computed prop stays
// live and correct in both cases without touching the scan-completion
// backend code path at all.
const sentimentAdvice = computed(() => deriveSentimentAdvice(props.payload));

// Mention highlighting (Details tab, check-by-check raw text): segment-based
// rendering (not v-html) so there's no HTML-injection surface even though
// the underlying text is raw, untrusted model output — matches on the
// brand name plus every non-ambiguous competitor name (skipping
// `ambiguous: true` entries, consistent with the existing detection-
// ambiguity handling elsewhere in this file).
const highlightTerms = computed<string[]>(() => {
  const terms: string[] = [];
  if (!props.payload.ambiguousBrandFlag) terms.push(props.payload.brand);
  for (const c of props.payload.competitorTallies) {
    if (!c.ambiguous) terms.push(c.name);
  }
  return terms;
});
function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
interface TextSegment { text: string; isMatch: boolean; }
function highlightMentions(text: string, terms: string[]): TextSegment[] {
  const cleaned = [...new Set(terms.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (cleaned.length === 0) return [{ text, isMatch: false }];
  const pattern = new RegExp(`\\b(${cleaned.map(escapeRegExp).join('|')})\\b`, 'gi');
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) segments.push({ text: text.slice(lastIndex, match.index), isMatch: false });
    segments.push({ text: match[0], isMatch: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex), isMatch: false });
  return segments;
}

const band = computed(() => scoreBand(props.payload.score));

const RING_R = 54;
const RING_STROKE = 12;
const ringCircumference = 2 * Math.PI * RING_R;
const ringOffset = computed(() =>
  props.payload.score !== null ? ringCircumference * (1 - props.payload.score / 100) : 0
);

const rank1Count = computed(() => deriveRank1Count(props.payload));
const beatenCount = computed(() => deriveBeatenCount(props.payload));
const headlineKind = computed(() => deriveHeadlineKind(props.payload));

const scoreboardRows = computed(() => deriveScoreboardRows(props.payload));
function rowPct(row: ScoreboardRow) {
  return scoreboardRowPct(props.payload, row);
}

const checkBreakdown = computed(() => deriveCheckBreakdown(props.payload));

// Per-call failure detail (Milestone A3 — restores what commit 522eb63
// shipped and 74afa41 accidentally deleted the next day).
const failureRows = computed(() => deriveFailureRows(props.payload));

// Citation-URL attribution (Milestone F): which of the company's own pages
// an AI model actually cited, grouped by prompt so "which check drew from
// which page" reads directly instead of a flat unlabeled URL list.
const ownSiteCitationRows = computed(() => deriveOwnSiteCitationRows(props.payload));

const visibleAdvice = computed(() => deriveVisibleAdvice(props.payload));

// ---- Overview/Details tab split (REPORTPLAN.md) ----
const viewMode = ref<'overview' | 'details'>('overview');
const tablistRef = ref<HTMLElement | null>(null);
// Switching tabs re-renders a differently-sized panel below the tab bar —
// without this, the scroll position from one panel (e.g. deep in the
// check-by-check breakdown) carries over and lands mid-air in the other.
watch(viewMode, () => {
  tablistRef.value?.scrollIntoView({ block: 'start' });
});
const totalChecksCount = computed(() => checkBreakdown.value.reduce((sum, g) => sum + g.checks.length, 0));
const detailsEmpty = computed(
  () => !props.payload.harmonia && ownSiteCitationRows.value.length === 0 && checkBreakdown.value.length === 0
);

// Site Health (formerly "Harmonia" internally — renamed in the UI
// 2026-08-23): technical/on-page/content-structure/UX audit of the scanned
// site — a SEPARATE, secondary score from the AI Visibility Score above,
// never blended into it (see shared/harmonia.mjs). Pillar/overall scores
// reuse scoreBand()'s exact thresholds and good/warning/serious/critical
// status colors so this reads as the same system as the AI score ring.
const harmoniaPillars = computed(() => deriveHarmoniaPillars(props.payload));
const harmoniaBand = computed(() => deriveHarmoniaBand(props.payload));

const scanDurationLabel = computed(() => deriveScanDurationLabel(props.payload));

// Download report (Markdown) — pure client-side, no server call. Mirrors
// this component's own Overview/Details structure via the same
// scanLabels.ts/scanDerived.ts building blocks, so the report and the UI
// can't independently drift on wording or numbers.
function downloadReport() {
  downloadMarkdown(buildScanReportMarkdown(props.payload), props.payload);
}
</script>

<template>
  <div class="scan-detail" :class="{ 'theme-dashboard': theme === 'dashboard' }">
    <h1>{{ payload.brand }}</h1>
    <div class="meta">
      <a v-if="payload.safeWebsiteHref" :href="payload.safeWebsiteHref" target="_blank" rel="noopener">{{ payload.website }}</a>
      <template v-else>{{ payload.website }}</template>
      &middot; checked {{ payload.generatedAtDate.toLocaleString() }}
      <template v-if="scanDurationLabel">&middot; completed in {{ scanDurationLabel }}</template>
    </div>

    <!-- Overview/Details tabs (REPORTPLAN.md) -->
    <div class="tabbar" role="tablist" ref="tablistRef">
      <button type="button" role="tab" :aria-selected="viewMode === 'overview'" :class="{ active: viewMode === 'overview' }" @click="viewMode = 'overview'">Overview</button>
      <button type="button" role="tab" :aria-selected="viewMode === 'details'" :class="{ active: viewMode === 'details' }" @click="viewMode = 'details'">
        Details<template v-if="totalChecksCount"> &middot; {{ totalChecksCount }} check{{ totalChecksCount === 1 ? '' : 's' }}</template>
      </button>
      <button type="button" class="download-report-button" @click="downloadReport">Download report</button>
    </div>

    <template v-if="viewMode === 'overview'">
      <!-- score meter -->
      <div v-if="payload.score === null" class="card score-card" :class="`band-${band}`">
        <div class="score-side">
          <div class="score-band-label">{{ BAND_LABEL[band] }}</div>
          <div class="score-explain">{{ BAND_EXPLAIN[band] }}</div>
        </div>
      </div>
      <div v-else class="card score-card" :class="`band-${band}`">
        <div class="score-ring-wrap">
          <svg viewBox="0 0 132 132">
            <circle class="score-ring-track" cx="66" cy="66" :r="RING_R" :stroke-width="RING_STROKE"></circle>
            <circle
              class="score-ring-fill" cx="66" cy="66" :r="RING_R" :stroke-width="RING_STROKE"
              :stroke-dasharray="ringCircumference" :stroke-dashoffset="ringOffset"
            ></circle>
          </svg>
          <div class="score-ring-number"><span class="value">{{ payload.score }}</span><span class="of100">/ 100</span></div>
        </div>
        <div class="score-side">
          <div class="score-band-label">{{ BAND_LABEL[band] }}</div>
          <div class="score-explain">{{ BAND_EXPLAIN[band] }} AI Visibility Score — weighted for being mentioned first, not just mentioned.</div>
          <div class="confidence-note">Based on {{ payload.completedCalls }} / {{ payload.completedCalls + payload.failedCalls }} successful checks.</div>
          <a class="methodology-link" href="/how-it-works#methodology" target="_blank" rel="noopener">How this is measured &rarr;</a>
        </div>
      </div>

      <div class="headline">
        <template v-if="headlineKind === 'none'">We couldn't complete any checks for <strong>{{ payload.brand }}</strong> this time — no data, not necessarily no visibility.</template>
        <template v-else-if="headlineKind === 'zero'"><span class="not-cited">{{ payload.brand }} did not show up</span> when we asked AI search about {{ payload.category }}.</template>
        <template v-else-if="headlineKind === 'beaten'">{{ payload.brand }} showed up, but <span class="not-cited">competitors were mentioned first</span> in {{ beatenCount }} of {{ payload.completedCalls }} checks.</template>
        <template v-else><span class="cited">{{ payload.brand }} showed up</span> in {{ payload.citedCount }} of {{ payload.completedCalls }} checks — no competitor beat it to the mention.</template>
      </div>

      <div class="warn" v-if="payload.ambiguousBrandFlag">
        Brand name is a common word — automated detection was skipped for some checks. Read the raw responses below before trusting the count.
      </div>
      <div class="warn" v-if="payload.failedCalls > 0">
        {{ payload.failedCalls }} of {{ payload.completedCalls + payload.failedCalls }} checks failed to complete and are not counted above.
      </div>

      <!-- sentiment summary: at-a-glance rollup of the per-check sentiment
           judge (see Details tab's check-by-check breakdown for the full
           per-check badges/reasoning) -->
      <div class="sentiment-summary-row" v-if="sentimentSummaryRows.length">
        <span
          v-for="row in sentimentSummaryRows" :key="row.classification"
          class="sentiment-badge" :class="`sentiment-${row.classification}`"
        >{{ row.count }} {{ row.label }}</span>
      </div>

      <!-- scoreboard: emphasis bar chart (brand = accent, rivals = de-emphasis gray) -->
      <template v-if="scoreboardRows.length">
        <h2>Scoreboard</h2>
        <div class="card">
          <div class="board-row" v-for="row in scoreboardRows" :key="row.name + row.isYou">
            <div class="board-label">
              <span class="board-name" :title="row.name">{{ row.name }}<span v-if="row.isYou" class="you-tag"> (you)</span></span>
              <span class="board-count">{{ row.mentionCount }}/{{ payload.completedCalls }}</span>
            </div>
            <div class="board-track"><div class="board-fill" :class="row.isYou ? 'you' : 'rival'" :style="{ width: rowPct(row) + '%' }"></div></div>
            <div class="board-beat" v-if="!row.isYou && row.beatBrandCount > 0">beat you {{ row.beatBrandCount }}×</div>
            <div class="board-ambiguous" v-if="row.ambiguous">Name is a common word — automated detection was skipped for some checks. This tally may undercount.</div>
          </div>
        </div>
      </template>

      <!-- performance by query type: the score model already weights each
           check by category (high-intent/comparison/informational) — this
           surfaces that breakdown plus each category's sentiment mix,
           instead of leaving the pattern buried in the Details tab. -->
      <template v-if="categoryBreakdown.length">
        <h2>Performance by query type</h2>
        <div class="card">
          <div class="category-row" v-for="row in categoryBreakdown" :key="row.category">
            <div class="board-label">
              <span class="board-name">{{ row.label }}</span>
              <span class="board-count">{{ row.ranked1 + row.beaten }}/{{ row.total }} mentioned</span>
            </div>
            <div class="board-track"><div class="board-fill you" :style="{ width: row.presencePct + '%' }"></div></div>
            <div class="category-detail">{{ row.ranked1 }} first, {{ row.beaten }} beaten to it, {{ row.notMentioned }} not mentioned</div>
            <div class="sentiment-summary-row" v-if="row.sentimentCounts.length">
              <span
                v-for="s in row.sentimentCounts" :key="s.classification"
                class="sentiment-badge" :class="`sentiment-${s.classification}`"
              >{{ s.count }} {{ s.label }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- advice cards -->
      <template v-if="visibleAdvice.length || sentimentAdvice">
        <h2>What to do next</h2>
        <div class="advice-card" :class="`tone-${card.tone}`" v-for="card in visibleAdvice" :key="card.id">
          <div class="advice-tag">{{ ADVICE_HEADING[card.id] || 'Note' }}</div>
          <div class="advice-body">
            <template v-if="card.id === 'no-data'">We couldn't complete any checks this time — likely a temporary API issue. Try running the scan again.</template>
            <template v-else-if="card.id === 'zero-citations'">You're invisible in AI search. Across {{ asNonNegativeInt(card.params.completedCalls) ?? '?' }} checks, this brand was never mentioned — not once. Getting cited even occasionally is the highest-leverage fix here: AI models lean on third-party mentions (reviews, directories, comparison content), not a brand's own site.</template>
            <template v-else-if="card.id === 'consistently-beaten'">
              <template v-if="asShortString(card.params.topCompetitorName)">AI knows this brand exists, but reaches for <strong>{{ asShortString(card.params.topCompetitorName) }}</strong> first — beaten to the mention in {{ asNonNegativeInt(card.params.beaten) ?? 0 }} of {{ asNonNegativeInt(card.params.completedCalls) ?? '?' }} checks. Closing this gap usually means more third-party content AI can point to as the definitive answer, not just a passing mention.</template>
              <template v-else>AI knows this brand exists, but a competitor is usually mentioned first — beaten in {{ asNonNegativeInt(card.params.beaten) ?? 0 }} of {{ asNonNegativeInt(card.params.completedCalls) ?? '?' }} checks.</template>
            </template>
            <template v-else-if="card.id === 'leading'">This is the AI's go-to answer. Every completed check ({{ asNonNegativeInt(card.params.completedCalls) ?? '?' }}/{{ asNonNegativeInt(card.params.completedCalls) ?? '?' }}) came up with this brand first — no competitor beat it to the mention. Worth re-checking periodically; this can shift as competitors publish new content.</template>
            <template v-else-if="card.id === 'mixed'">Mixed results across {{ asNonNegativeInt(card.params.completedCalls) ?? '?' }} checks: ranked first in {{ asNonNegativeInt(card.params.ranked1) ?? 0 }}, beaten by a competitor in {{ asNonNegativeInt(card.params.beaten) ?? 0 }}, not mentioned at all in {{ asNonNegativeInt(card.params.notMentioned) ?? 0 }}. The not-mentioned checks are the biggest opportunity — competitors aren't necessarily winning those either, nobody is.</template>
            <template v-else-if="card.id === 'top-rival'"><strong>{{ asShortString(card.params.name) }}</strong> is the competitor showing up most — mentioned in {{ asNonNegativeInt(card.params.mentionCount) ?? 0 }} of {{ asNonNegativeInt(card.params.completedCalls) ?? '?' }} checks. Worth understanding what makes them citable (content structure, third-party coverage, reviews).</template>
          </div>
        </div>
        <div class="advice-card tone-warning" v-if="sentimentAdvice">
          <div class="advice-tag">Sentiment</div>
          <div class="advice-body">
            AI mentioned {{ payload.brand }}, but framed it unfavorably in {{ sentimentAdvice.unfavorable }} of {{ sentimentAdvice.total }} judged
            check{{ sentimentAdvice.total === 1 ? '' : 's' }} ({{ sentimentAdvice.negative }} negative, {{ sentimentAdvice.comparisonOnly }} comparison-only) —
            a mention isn't the same as a good mention. Read the flagged responses in the Details tab below.
          </div>
        </div>
      </template>

      <!-- deep advice: on-demand LLM-generated steps, Milestone 6. Gated
           behind Pro (or a one-time purchase) since Milestone 1 of the
           monetization plan — deepAdviceLocked renders an upgrade CTA
           instead of hiding the section outright. -->
      <template v-if="allowDeepAdvice || payload.deepAdvice || deepAdviceLocked">
        <h2>Deeper advice</h2>
        <div class="card deep-advice-card" v-if="payload.deepAdvice">
          <ol class="deep-advice-steps">
            <li v-for="(step, i) in payload.deepAdvice.steps" :key="i">
              <div class="step-head">
                <strong>{{ step.title }}</strong>
                <span class="difficulty" :class="`difficulty-${step.difficulty.toLowerCase()}`">{{ step.difficulty }}</span>
              </div>
              <p v-if="step.reasoning">{{ step.reasoning }}</p>
            </li>
          </ol>
          <div class="deep-advice-meta" v-if="payload.deepAdviceGeneratedAtDate">
            Generated {{ payload.deepAdviceGeneratedAtDate.toLocaleString() }}
          </div>
        </div>
        <button
          v-else-if="allowDeepAdvice"
          type="button"
          class="deep-advice-button"
          :disabled="deepAdviceLoading"
          @click="$emit('generate-deep-advice')"
        >
          {{ deepAdviceLoading ? 'Generating…' : 'Generate deeper advice' }}
        </button>
        <div class="card deep-advice-locked" v-else-if="deepAdviceLocked">
          <p>Unlock AI-generated action steps — specific, ranked fixes based on this scan's actual results.</p>
          <button type="button" class="deep-advice-button" @click="$emit('upgrade')">
            Upgrade to Pro
          </button>
        </div>
      </template>

      <!-- Harmonia summary: a SEPARATE, secondary score from the AI
           Visibility Score above — never blended into it. Compact here;
           full pillar breakdown, schema opportunities, and Core Web
           Vitals detail live in the Details tab. -->
      <template v-if="payload.harmonia">
        <h2>Site Health score</h2>
        <div class="card harmonia-summary-card">
          <div class="harmonia-summary-head">
            <span class="harmonia-overall-score" :class="`band-text-${harmoniaBand}`">{{ payload.harmonia.harmoniaScore ?? '—' }}<span class="of100">/ 100</span></span>
            <span class="harmonia-summary-label">Technical, on-page, content-structure, and UX health of {{ payload.website }} — not part of the AI Visibility Score.</span>
          </div>
          <!-- Dashboard theme: donut gauges (a deliberately different chart
               form from the AI-score ring above and the scoreboard's bars
               below — bars compare an open-ended list of named entities,
               a gauge shows one closed value's completion toward 100, so
               the two data shapes get two different chart forms). Legacy
               theme (old shareable links) keeps the original flat bars,
               byte-for-byte unchanged. -->
          <div class="harmonia-gauge-grid" v-if="theme === 'dashboard'">
            <div class="harmonia-gauge" v-for="p in harmoniaPillars" :key="p.key">
              <div class="harmonia-gauge-ring" :class="`band-fill-${p.band}`" :style="{ '--pct': p.score ?? 0 }">
                <span class="harmonia-gauge-score">{{ p.score ?? '—' }}</span>
              </div>
              <span class="harmonia-gauge-label">{{ p.label }}</span>
            </div>
          </div>
          <template v-else>
            <div class="harmonia-bar-row" v-for="p in harmoniaPillars" :key="p.key">
              <div class="harmonia-bar-label">
                <span>{{ p.label }}</span>
                <span class="board-count">{{ p.score ?? '—' }}</span>
              </div>
              <div class="board-track"><div class="board-fill" :class="`band-fill-${p.band}`" :style="{ width: (p.score ?? 0) + '%' }"></div></div>
            </div>
          </template>
          <button type="button" class="harmonia-details-link" @click="viewMode = 'details'">See full breakdown &rarr;</button>
        </div>
      </template>
    </template>

    <template v-else>
      <!-- Harmonia breakdown: pillar checklists, schema opportunities with
           copy-paste JSON-LD snippets, Core Web Vitals detail. -->
      <CollapsibleSection
        v-if="payload.harmonia"
        title="Site Health: technical & SEO audit"
        :status-text="payload.harmonia.harmoniaScore !== null ? `${payload.harmonia.harmoniaScore}/100` : 'unavailable'"
        default-open
      >
        <div class="harmonia-pillar" v-for="p in harmoniaPillars" :key="p.key">
          <div class="harmonia-pillar-head">
            <span class="harmonia-pillar-label">{{ p.label }}</span>
            <span class="harmonia-pillar-score" :class="`band-text-${p.band}`">{{ p.score ?? 'n/a' }}</span>
          </div>
          <div class="board-track" v-if="p.score !== null"><div class="board-fill" :class="`band-fill-${p.band}`" :style="{ width: p.score + '%' }"></div></div>
          <ul class="harmonia-checklist" v-if="p.checks.length">
            <li v-for="c in p.checks" :key="c.id" :class="c.passed ? 'passed' : 'failed'">
              <span class="check-icon"><Icon v-if="theme === 'dashboard'" :name="c.passed ? 'check' : 'x'" /><template v-else>{{ c.passed ? '✓' : '✗' }}</template></span> {{ c.label }}
            </li>
          </ul>
          <p class="harmonia-pillar-empty" v-else>Not available for this scan.</p>
        </div>

        <!-- security-headers detail: checkSecurityHeaders() already computes
             this per-header list (it feeds the Technical SEO pillar's "≥3 of
             5 common security headers present" checklist line above) but the
             per-header detail itself was never rendered anywhere. -->
        <div class="harmonia-schema" v-if="payload.harmonia.securityHeaders.length">
          <h3>Security headers</h3>
          <ul class="harmonia-checklist">
            <li v-for="h in payload.harmonia.securityHeaders" :key="h.header" :class="h.present ? 'passed' : 'failed'">
              <span class="check-icon"><Icon v-if="theme === 'dashboard'" :name="h.present ? 'check' : 'x'" /><template v-else>{{ h.present ? '✓' : '✗' }}</template></span> {{ h.header }}
            </li>
          </ul>
        </div>

        <div class="harmonia-cwv" v-if="payload.harmonia.coreWebVitals">
          <h3>Core Web Vitals (mobile)</h3>
          <div class="cwv-row">
            <span class="cwv-metric" :class="`cwv-${cwvRating('lcpMs', payload.harmonia.coreWebVitals.lcpMs)}`">LCP {{ formatSeconds(payload.harmonia.coreWebVitals.lcpMs) }}</span>
            <span class="cwv-metric" :class="`cwv-${cwvRating('clsScore', payload.harmonia.coreWebVitals.clsScore)}`">CLS {{ payload.harmonia.coreWebVitals.clsScore ?? '—' }}</span>
            <span class="cwv-metric" :class="`cwv-${cwvRating('inpMs', payload.harmonia.coreWebVitals.inpMs)}`">INP {{ payload.harmonia.coreWebVitals.inpMs !== null ? formatSeconds(payload.harmonia.coreWebVitals.inpMs) : 'no field data' }}</span>
          </div>
        </div>

        <div class="harmonia-schema" v-if="payload.harmonia.schema.detected.length">
          <h3>Schema.org detected</h3>
          <ul class="schema-list">
            <li v-for="(n, i) in payload.harmonia.schema.detected" :key="i" :class="n.valid ? 'passed' : 'failed'">
              <span class="check-icon"><Icon v-if="theme === 'dashboard'" :name="n.valid ? 'check' : 'x'" /><template v-else>{{ n.valid ? '✓' : '✗' }}</template></span> {{ n.type || 'Unrecognized type' }}
              <span class="schema-issues" v-if="n.issues.length">— {{ n.issues.join('; ') }}</span>
            </li>
          </ul>
        </div>

        <div class="harmonia-schema" v-if="payload.harmonia.schema.opportunities.length">
          <h3>Schema opportunities</h3>
          <div class="schema-opportunity" v-for="(o, i) in payload.harmonia.schema.opportunities" :key="i">
            <div class="schema-opportunity-head">{{ o.type }}</div>
            <p class="schema-opportunity-reason">{{ o.reason }}</p>
            <pre class="schema-opportunity-example"><code>{{ o.example }}</code></pre>
          </div>
        </div>

        <p class="harmonia-errors" v-if="payload.harmonia.errors.length">
          Some checks couldn't complete: {{ payload.harmonia.errors.join('; ') }}
        </p>
      </CollapsibleSection>
      <p class="harmonia-unavailable" v-else-if="payload.completedCalls > 0 || payload.failedCalls > 0">
        Technical/SEO audit isn't available for this scan (ran before this feature shipped, or the site couldn't be reached).
      </p>

      <!-- citation-URL attribution (Milestone F): the exact pages on the
           company's own site an AI model actually drew its answer from,
           instead of only generic "improve your content" advice above. -->
      <CollapsibleSection v-if="ownSiteCitationRows.length" title="Your site, cited" :status-text="`${ownSiteCitationRows.length}`">
        <p class="citations-intro">AI models cited these pages from your own site while answering:</p>
        <ul class="citation-list">
          <li v-for="(c, i) in ownSiteCitationRows" :key="i">
            <a :href="c.url" target="_blank" rel="noopener">{{ c.title }}</a>
            <span class="citation-meta">{{ c.model }} &middot; {{ c.promptLabel }}</span>
          </li>
        </ul>
      </CollapsibleSection>

      <!-- check-by-check breakdown: every completed call, grouped by which
           prompt produced it, with each model's outcome shown next to
           its own raw response text (expand per-check rather than one long
           undifferentiated dump). -->
      <CollapsibleSection v-if="checkBreakdown.length" title="Check-by-check" :status-text="`${totalChecksCount} check${totalChecksCount === 1 ? '' : 's'}`">
        <div class="check-group" v-for="group in checkBreakdown" :key="group.promptIndex">
          <div class="check-prompt-label">{{ group.label }}</div>
          <details class="check-row" v-for="(c, i) in group.checks" :key="i">
            <summary>
              <span class="check-model">{{ c.model }}</span>
              <span class="check-badges">
                <span class="check-badge" :class="`badge-${c.rank}`">{{ CHECK_BADGE_LABEL[c.rank] }}</span>
                <span
                  v-if="sentimentByKey.get(sentimentKey(group.promptIndex, c.model))"
                  class="sentiment-badge"
                  :class="`sentiment-${sentimentByKey.get(sentimentKey(group.promptIndex, c.model))!.classification}`"
                >{{ SENTIMENT_LABEL[sentimentByKey.get(sentimentKey(group.promptIndex, c.model))!.classification] }}</span>
              </span>
            </summary>
            <div class="check-body">
              <div class="check-text">
                <template v-for="(seg, si) in highlightMentions(c.text, highlightTerms)" :key="si">
                  <mark v-if="seg.isMatch" class="mention-highlight">{{ seg.text }}</mark>
                  <template v-else>{{ seg.text }}</template>
                </template>
              </div>
              <div class="check-sources" v-if="c.citations.length">
                Sources:
                <a v-for="(cit, j) in c.citations" :key="j" :href="cit.url" target="_blank" rel="noopener">{{ cit.title || cit.url }}</a>
              </div>
              <div class="check-sentiment" v-if="sentimentByKey.get(sentimentKey(group.promptIndex, c.model))">
                {{ sentimentByKey.get(sentimentKey(group.promptIndex, c.model))!.reasoning }}
              </div>
              <button
                v-else-if="allowSentimentJudge && c.rank !== 'not-mentioned'"
                type="button"
                class="judge-sentiment-button"
                :disabled="sentimentJudgeLoadingKey === sentimentKey(group.promptIndex, c.model)"
                @click="$emit('judge-sentiment', group.promptIndex, c.model)"
              >
                {{ sentimentJudgeLoadingKey === sentimentKey(group.promptIndex, c.model) ? 'Judging…' : 'Judge sentiment' }}
              </button>
            </div>
          </details>
        </div>
        <!-- Milestone A3: rendered per-call failure detail when available. -->
        <div class="check-failed-note" v-if="failureRows.length">
          {{ payload.failedCalls }} additional {{ payload.failedCalls === 1 ? 'check' : 'checks' }} failed to complete and aren't shown above:
          <ul class="fail-reasons">
            <li v-for="(f, i) in failureRows" :key="i">
              <span class="check-model">{{ f.model }}</span> — {{ f.promptLabel }}: {{ f.error || 'no error message' }}
            </li>
          </ul>
        </div>
        <!-- Fallback for old, pre-migration scans where failures wasn't recorded yet. -->
        <div class="check-failed-note" v-else-if="payload.failedCalls > 0">
          {{ payload.failedCalls }} additional {{ payload.failedCalls === 1 ? 'check' : 'checks' }} failed to
          complete (API error or timeout) and aren't shown here — which specific prompt/model failed isn't
          currently recorded.
        </div>
      </CollapsibleSection>

      <p class="details-empty" v-if="detailsEmpty">No check details available for this scan.</p>
    </template>

    <footer>Detection is presence-only, not sentiment-aware — a negative or comparative mention still counts as "cited." The score above is a heuristic weighting of that same presence-only detection, not an independently verified rank. This is a single point-in-time check, not a monitored score. Results are fixed at generation time; this link will always show the same result.</footer>
  </div>
</template>

<style scoped>
h1 { font-size: 1.6rem; font-weight: 700; margin: 0 0 2px; }
.meta { color: var(--muted); font-size: 0.9rem; margin-bottom: 20px; }
.meta a {
  text-decoration: underline;
  text-underline-offset: 2px;
  padding: 4px 2px;
  margin: -4px -2px;
  display: inline-block;
}
.meta a:hover, .meta a:active { color: var(--fg); }

.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: var(--shadow);
}

/* ---- score meter ---- */
.score-card { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; padding: 24px; }
.score-ring-wrap { position: relative; width: 132px; height: 132px; flex: none; }
.score-ring-wrap svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.score-ring-track { fill: none; stroke: var(--gridline); }
.score-ring-fill { fill: none; stroke-linecap: round; transition: stroke-dashoffset 0.6s ease; }
@media (prefers-reduced-motion: reduce) { .score-ring-fill { transition: none; } }
.score-ring-number {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
}
.score-ring-number .value { font-size: 2.3rem; font-weight: 700; font-variant-numeric: proportional-nums; line-height: 1; }
.score-ring-number .of100 { font-size: 0.75rem; color: var(--faint); margin-top: 3px; }
.score-side { flex: 1; min-width: 180px; }
.score-band-label { font-size: 1.15rem; font-weight: 700; margin-bottom: 4px; }
.score-explain { color: var(--muted); font-size: 0.88rem; }
.confidence-note {
  font-size: 0.8rem;
  color: var(--faint);
  margin-top: 8px;
}
.methodology-link {
  display: inline-block;
  font-size: 0.8rem;
  color: var(--accent);
  margin-top: 4px;
  text-decoration: none;
}
.methodology-link:hover { text-decoration: underline; }
.band-leading.score-card { background: color-mix(in srgb, var(--good) 6%, var(--card)); border-color: color-mix(in srgb, var(--good) 28%, var(--border)); }
.band-leading .score-ring-fill { stroke: var(--good); }
.band-leading .score-band-label { color: var(--success-text); }
.band-visible.score-card { background: color-mix(in srgb, var(--warning) 6%, var(--card)); border-color: color-mix(in srgb, var(--warning) 28%, var(--border)); }
.band-visible .score-ring-fill { stroke: var(--warning); }
.band-weak.score-card { background: color-mix(in srgb, var(--serious) 6%, var(--card)); border-color: color-mix(in srgb, var(--serious) 28%, var(--border)); }
.band-weak .score-ring-fill { stroke: var(--serious); }
.band-invisible.score-card { background: color-mix(in srgb, var(--critical) 6%, var(--card)); border-color: color-mix(in srgb, var(--critical) 28%, var(--border)); }
.band-invisible .score-ring-fill { stroke: var(--critical); }

.headline { font-size: 1.1rem; font-weight: 500; margin-bottom: 8px; }
.cited { color: var(--success-text); }
.not-cited { color: var(--critical); }

.warn {
  background: color-mix(in srgb, var(--warning) 16%, var(--card));
  border: 1px solid color-mix(in srgb, var(--warning) 45%, var(--border));
  color: var(--fg);
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 0.88rem;
  margin-bottom: 12px;
}

/* ---- scoreboard (emphasis bar chart: brand = accent, rivals = de-emphasis gray) ---- */
.board-row { margin-bottom: 12px; }
.board-row:last-child { margin-bottom: 0; }
.board-label {
  display: flex; justify-content: space-between; gap: 8px;
  font-size: 0.88rem; margin-bottom: 4px;
}
.board-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.board-name .you-tag { color: var(--accent); font-weight: 600; }
.board-count { color: var(--muted); flex: none; font-variant-numeric: proportional-nums; }
.board-track { height: 22px; border-radius: 6px; background: var(--gridline); overflow: hidden; }
.board-fill { height: 100%; border-radius: 6px; transition: width 0.6s ease; }
@media (prefers-reduced-motion: reduce) { .board-fill { transition: none; } }
.board-fill.you { background: var(--accent); }
.board-fill.rival { background: var(--debar); }
.board-beat { color: var(--serious); font-size: 0.8rem; margin-top: 2px; }
.board-ambiguous { color: var(--muted); font-size: 0.78rem; margin-top: 2px; font-style: italic; }

/* ---- performance by query type ---- */
.category-row { margin-bottom: 16px; }
.category-row:last-child { margin-bottom: 0; }
.category-detail { color: var(--muted); font-size: 0.8rem; margin-top: 4px; }
.category-row .sentiment-summary-row { margin: 8px 0 0; }

/* ---- advice cards ---- */
.advice-card {
  border-left: 4px solid var(--border);
  background: var(--card);
  border-radius: 10px;
  padding: 14px 18px;
  margin-bottom: 10px;
  box-shadow: var(--shadow);
}
.advice-card:last-child { margin-bottom: 0; }
.advice-tag {
  display: inline-block; font-size: 0.72rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.04em;
  margin-bottom: 4px;
}
.advice-card.tone-critical { border-left-color: var(--critical); }
.advice-card.tone-critical .advice-tag { color: var(--critical); }
.advice-card.tone-warning { border-left-color: var(--warning); }
.advice-card.tone-warning .advice-tag { color: color-mix(in srgb, var(--warning) 70%, var(--fg)); }
.advice-card.tone-positive { border-left-color: var(--good); }
.advice-card.tone-positive .advice-tag { color: var(--success-text); }
.advice-card.tone-neutral { border-left-color: var(--faint); }
.advice-card.tone-neutral .advice-tag { color: var(--muted); }
.advice-body { font-size: 0.92rem; }

/* ---- deep advice ---- */
.deep-advice-steps { margin: 0; padding: 0; list-style: none; counter-reset: step-counter; }
.deep-advice-steps li {
  counter-increment: step-counter;
  position: relative;
  padding-left: 34px;
  margin-bottom: 16px;
  min-height: 24px;
}
.deep-advice-steps li:last-child { margin-bottom: 0; }
.deep-advice-steps li::before {
  content: counter(step-counter);
  position: absolute; left: 0; top: 0;
  width: 24px; height: 24px; border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 15%, var(--card));
  color: var(--accent);
  font-size: 0.78rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.step-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.step-head strong { font-size: 0.95rem; }
.deep-advice-steps p { margin: 4px 0 0; font-size: 0.88rem; color: var(--muted); }
.difficulty {
  font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em;
  padding: 1px 8px; border-radius: 999px; border: 1px solid var(--border); color: var(--muted);
}
.difficulty-easy { border-color: color-mix(in srgb, var(--good) 45%, var(--border)); color: var(--success-text); }
.difficulty-hard { border-color: color-mix(in srgb, var(--critical) 45%, var(--border)); color: var(--critical); }
.deep-advice-meta { margin-top: 14px; font-size: 0.78rem; color: var(--faint); }
.deep-advice-button {
  padding: 10px 16px; font-size: 0.9rem; font-weight: 600;
  border: none; border-radius: 8px; background: var(--accent); color: var(--accent-ink); cursor: pointer;
  box-shadow: var(--shadow); transition: transform 0.15s ease;
}
.deep-advice-button:hover:not(:disabled) { transform: translateY(-1px); }
.deep-advice-button:disabled { opacity: 0.6; cursor: wait; }
.deep-advice-locked { padding: 16px 20px; }
.deep-advice-locked p { margin: 0 0 12px; color: var(--muted); font-size: 0.9rem; }

h2 { font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--muted); margin: 28px 0 10px; }
h2:first-of-type { margin-top: 0; }

/* ---- citation-URL attribution ---- */
.citations-card { padding: 16px 20px; }
.citations-intro { margin: 0 0 10px; font-size: 0.85rem; color: var(--muted); }
.citation-list { list-style: none; margin: 0; padding: 0; }
.citation-list li {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px;
  padding: 8px 0; border-top: 1px solid var(--border);
}
.citation-list li:first-child { border-top: none; padding-top: 0; }
.citation-list a { color: var(--accent); font-size: 0.9rem; }
.citation-meta { font-size: 0.78rem; color: var(--faint); }

/* ---- check-by-check breakdown ---- */
.checks-card { padding: 8px 20px; }
.check-group { padding: 12px 0; border-top: 1px solid var(--border); }
.check-group:first-child { border-top: none; }
.check-prompt-label { font-size: 0.85rem; font-weight: 600; margin-bottom: 8px; }
.check-row { margin-bottom: 6px; }
.check-row:last-child { margin-bottom: 0; }
.check-row summary {
  cursor: pointer;
  list-style: none;
  position: relative;
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 8px 30px 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--fg) 3%, transparent);
  transition: background 0.15s ease;
}
.check-row summary:hover { background: color-mix(in srgb, var(--fg) 6%, transparent); }
.check-row summary::-webkit-details-marker { display: none; }
.check-row summary::after {
  content: "";
  position: absolute; right: 12px; top: 50%;
  width: 7px; height: 7px;
  border-right: 2px solid var(--faint); border-bottom: 2px solid var(--faint);
  transform: translateY(-65%) rotate(45deg);
  transition: transform 0.2s ease;
}
.check-row[open] summary::after { transform: translateY(-35%) rotate(-135deg); }
.check-row[open] summary { border-radius: 8px 8px 0 0; }
.check-model { font-size: 0.85rem; color: var(--muted); font-family: ui-monospace, monospace; }
.check-badge {
  font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em;
  padding: 2px 9px; border-radius: 999px; flex: none; white-space: nowrap;
}
.badge-ranked-1 { background: color-mix(in srgb, var(--good) 20%, transparent); color: var(--success-text); }
.badge-ranked-2, .badge-ranked-3, .badge-mentioned, .badge-beaten { background: color-mix(in srgb, var(--warning) 22%, transparent); color: color-mix(in srgb, var(--warning) 70%, var(--fg)); }
.badge-not-mentioned { background: color-mix(in srgb, var(--critical) 16%, transparent); color: var(--critical); }
.check-badges { display: flex; align-items: center; gap: 6px; flex: none; }
.sentiment-badge {
  font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em;
  padding: 2px 9px; border-radius: 999px; flex: none; white-space: nowrap;
}
.sentiment-recommended { background: color-mix(in srgb, var(--good) 20%, transparent); color: var(--success-text); }
.sentiment-neutral { background: color-mix(in srgb, var(--faint) 20%, transparent); color: var(--muted); }
.sentiment-negative { background: color-mix(in srgb, var(--critical) 16%, transparent); color: var(--critical); }
.sentiment-comparison-only { background: color-mix(in srgb, var(--warning) 22%, transparent); color: color-mix(in srgb, var(--warning) 70%, var(--fg)); }
.sentiment-summary-row { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 16px; }
.check-sentiment {
  font-size: 0.82rem; color: var(--muted); font-style: italic;
  padding: 0 10px 10px;
}
.judge-sentiment-button {
  margin: 0 10px 10px; padding: 5px 12px; font-size: 0.78rem; font-weight: 600;
  border: 1px solid var(--border); border-radius: 999px;
  background: transparent; color: var(--fg); cursor: pointer;
  transition: border-color 0.15s ease;
}
.judge-sentiment-button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.judge-sentiment-button:disabled { opacity: 0.6; cursor: wait; }
.check-body {
  border: 1px solid var(--border); border-top: none;
  border-radius: 0 0 8px 8px;
  overflow: hidden;
}
.check-text {
  font-size: 0.85rem; color: var(--muted);
  padding: 10px 10px 4px;
  white-space: pre-wrap;
}
.mention-highlight {
  background: color-mix(in srgb, var(--accent) 30%, transparent);
  color: var(--fg);
  border-radius: 3px;
  padding: 0 2px;
}
.check-sources {
  font-size: 0.78rem; color: var(--muted);
  padding: 6px 10px 10px;
  display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline;
}
.check-sources a { color: var(--accent); }
.check-failed-note {
  margin-top: 4px; padding: 10px 0;
  font-size: 0.82rem; color: var(--muted);
  border-top: 1px solid var(--border);
}
.check-failed-note .fail-reasons { margin: 8px 0 0; padding-left: 18px; line-height: 1.6; }
.check-failed-note .fail-reasons li { margin-bottom: 4px; }
.check-failed-note .fail-reasons .check-model { color: var(--fg); }

/* ---- Overview/Details tabs ---- */
.tabbar { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid var(--border); scroll-margin-top: 16px; }
.tabbar button {
  appearance: none; border: none; background: none; cursor: pointer;
  padding: 10px 4px; margin-right: 20px;
  font-size: 0.92rem; font-weight: 600; color: var(--muted);
  border-bottom: 2px solid transparent; transition: color 0.15s ease, border-color 0.15s ease;
}
.tabbar button:hover { color: var(--fg); }
.tabbar button.active { color: var(--fg); border-bottom-color: var(--accent); }
.download-report-button {
  margin-left: auto; margin-right: 0 !important;
  align-self: center;
  padding: 6px 14px !important;
  font-size: 0.8rem !important; font-weight: 600;
  border: 1px solid var(--border) !important; border-radius: 999px;
  color: var(--muted) !important;
  transition: border-color 0.15s ease, color 0.15s ease !important;
}
.download-report-button:hover { border-color: var(--accent) !important; color: var(--accent) !important; }

/* ---- status-band text/fill helpers (shared by score ring bands and
   Harmonia's pillar bars, so both read as the same color language) ---- */
.band-text-leading { color: var(--success-text); }
.band-text-visible { color: color-mix(in srgb, var(--warning) 70%, var(--fg)); }
.band-text-weak { color: var(--serious); }
.band-text-invisible { color: var(--critical); }
.band-text-unavailable { color: var(--muted); }
.board-fill.band-fill-leading { background: var(--good); }
.board-fill.band-fill-visible { background: var(--warning); }
.board-fill.band-fill-weak { background: var(--serious); }
.board-fill.band-fill-invisible { background: var(--critical); }
.board-fill.band-fill-unavailable { background: var(--faint); }

/* ---- Harmonia summary (Overview tab) ---- */
.harmonia-summary-card { padding: 20px; }
.harmonia-summary-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.harmonia-overall-score { font-size: 1.6rem; font-weight: 700; font-variant-numeric: proportional-nums; }
.harmonia-overall-score .of100 { font-size: 0.85rem; color: var(--faint); font-weight: 500; }
.harmonia-summary-label { font-size: 0.82rem; color: var(--muted); flex: 1; min-width: 200px; }
.harmonia-bar-row { margin-bottom: 10px; }
.harmonia-bar-row:last-of-type { margin-bottom: 14px; }
.harmonia-bar-label { display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 4px; }
.harmonia-details-link {
  appearance: none; border: none; background: none; cursor: pointer;
  color: var(--accent); font-size: 0.85rem; font-weight: 600; padding: 0;
}
.harmonia-details-link:hover { text-decoration: underline; }

/* ---- Harmonia breakdown (Details tab) ---- */
.harmonia-pillar { padding: 12px 0; border-top: 1px solid var(--border); }
.harmonia-pillar:first-child { border-top: none; padding-top: 0; }
.harmonia-pillar-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
.harmonia-pillar-label { font-weight: 600; font-size: 0.9rem; }
.harmonia-pillar-score { font-weight: 700; font-variant-numeric: proportional-nums; }
.harmonia-pillar-empty { font-size: 0.82rem; color: var(--faint); font-style: italic; margin: 0; }
.harmonia-checklist { list-style: none; margin: 10px 0 0; padding: 0; font-size: 0.85rem; }
.harmonia-checklist li { display: flex; align-items: baseline; gap: 6px; padding: 3px 0; color: var(--muted); }
.harmonia-checklist li.passed .check-icon { color: var(--success-text); }
.harmonia-checklist li.failed .check-icon { color: var(--critical); }
.check-icon { flex: none; font-weight: 700; }

.harmonia-cwv, .harmonia-schema { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }
.harmonia-cwv h3, .harmonia-schema h3 {
  font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--muted); margin: 0 0 10px;
}
.cwv-row { display: flex; flex-wrap: wrap; gap: 8px; }
.cwv-metric {
  font-size: 0.82rem; font-weight: 600; padding: 4px 10px; border-radius: 999px;
  background: color-mix(in srgb, var(--faint) 16%, transparent); color: var(--muted);
}
.cwv-metric.cwv-good { background: color-mix(in srgb, var(--good) 18%, transparent); color: var(--success-text); }
.cwv-metric.cwv-needs-improvement { background: color-mix(in srgb, var(--warning) 20%, transparent); color: color-mix(in srgb, var(--warning) 70%, var(--fg)); }
.cwv-metric.cwv-poor { background: color-mix(in srgb, var(--critical) 16%, transparent); color: var(--critical); }

.schema-list { list-style: none; margin: 0; padding: 0; font-size: 0.85rem; }
.schema-list li { display: flex; align-items: baseline; gap: 6px; padding: 4px 0; color: var(--muted); }
.schema-issues { color: var(--faint); font-size: 0.8rem; }

.schema-opportunity { margin-bottom: 16px; }
.schema-opportunity:last-child { margin-bottom: 0; }
.schema-opportunity-head { font-weight: 600; font-size: 0.88rem; margin-bottom: 2px; }
.schema-opportunity-reason { font-size: 0.82rem; color: var(--muted); margin: 0 0 8px; }
.schema-opportunity-example {
  font-size: 0.78rem; font-family: ui-monospace, monospace; color: var(--muted);
  background: color-mix(in srgb, var(--fg) 4%, transparent);
  border: 1px solid var(--border); border-radius: 8px;
  padding: 10px 12px; overflow-x: auto; white-space: pre; margin: 0;
}
.harmonia-errors { font-size: 0.8rem; color: var(--faint); font-style: italic; margin: 16px 0 0; }
.harmonia-unavailable, .details-empty { color: var(--muted); font-size: 0.88rem; padding: 8px 0; }

footer { margin-top: 28px; color: var(--faint); font-size: 0.78rem; }

/* ==== Dashboard redesign (2026-08-23) ====
   Everything below only ever applies inside .theme-dashboard — the legacy
   (default) rendering above is completely untouched, so old shareable
   links (result.html, theme="legacy") render byte-for-byte as before. See
   ScanDetail.vue's `theme` prop comment for why. */
.theme-dashboard h1,
.theme-dashboard h2,
.theme-dashboard .score-ring-number .value,
.theme-dashboard .harmonia-overall-score {
  font-family: var(--font-display);
}

/* Score ring: a restrained, band-colored glow — the one place this
   redesign spends its "signature element" budget, per the frontend-design
   skill's "spend your boldness in one place" guidance. Not a page-wide
   glow (that's the marketing site's motif, deliberately kept off the
   dashboard) — scoped tightly to the ring itself. */
.theme-dashboard .band-leading .score-ring-fill { filter: drop-shadow(0 0 8px color-mix(in srgb, var(--good) 55%, transparent)); }
.theme-dashboard .band-visible .score-ring-fill { filter: drop-shadow(0 0 8px color-mix(in srgb, var(--warning) 55%, transparent)); }
.theme-dashboard .band-weak .score-ring-fill { filter: drop-shadow(0 0 8px color-mix(in srgb, var(--serious) 55%, transparent)); }
.theme-dashboard .band-invisible .score-ring-fill { filter: drop-shadow(0 0 8px color-mix(in srgb, var(--critical) 55%, transparent)); }

/* Performance-by-query-type: --accent-3 (teal) instead of the same blue
   used everywhere else — gives this section its own identity instead of
   visually duplicating the scoreboard immediately above it. */
.theme-dashboard .category-row .board-fill.you { background: var(--accent-3); }

/* Site Health gauges: --accent-2 (violet) is this section's identity
   color — see theme.css's token comment for the "status color vs.
   identity color" split this relies on. */
.harmonia-gauge-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 18px;
}
@media (min-width: 480px) {
  .harmonia-gauge-grid { grid-template-columns: repeat(4, 1fr); }
}
.harmonia-gauge { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; }
.harmonia-gauge-ring {
  --pct: 0;
  --gauge-color: var(--accent-2);
  position: relative;
  width: 64px; height: 64px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: conic-gradient(var(--gauge-color) calc(var(--pct) * 1%), var(--gridline) 0);
}
.harmonia-gauge-ring::before {
  content: '';
  position: absolute; inset: 6px;
  border-radius: 50%;
  background: var(--card);
}
.harmonia-gauge-score {
  position: relative; z-index: 1;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.95rem;
  font-variant-numeric: proportional-nums;
}
.harmonia-gauge-label { font-size: 0.72rem; color: var(--muted); line-height: 1.2; }
.harmonia-gauge-ring.band-fill-leading { --gauge-color: var(--good); }
.harmonia-gauge-ring.band-fill-visible { --gauge-color: var(--warning); }
.harmonia-gauge-ring.band-fill-weak { --gauge-color: var(--serious); }
.harmonia-gauge-ring.band-fill-invisible { --gauge-color: var(--critical); }
.harmonia-gauge-ring.band-fill-unavailable { --gauge-color: var(--faint); }

/* Site Health's own overall-score numeral picks up --accent-2 too — ties
   the summary number back to the gauges below it instead of reusing the
   AI score's status-band coloring for both scores at once. */
.theme-dashboard .harmonia-summary-card .harmonia-overall-score { color: var(--accent-2); }

.theme-dashboard .check-icon { display: inline-flex; align-items: center; }
</style>
