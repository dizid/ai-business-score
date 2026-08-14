<script setup lang="ts">
import { computed } from 'vue';
import { scoreBand, PROMPT_LABELS } from '../../shared/aivis-core.mjs';
import { asNonNegativeInt, asShortString, type ValidatedPayload, type AdviceId, type Rank } from './scanPayload';

// Shared between result/App.vue (a shareable, standalone page) and
// CompanyDetailView.vue's detail pane (master-detail dashboard) — same
// rendering for the same validated payload shape, so the two views can
// never drift out of sync the way two hand-copied templates eventually
// would.
//
// allowDeepAdvice/deepAdviceLoading + the generate-deep-advice emit are the
// one deliberate exception to "purely presentational, no other props, no
// emits" (Milestone 6): result/App.vue has no auth system at all (old
// shareable links are static, decode-only), so it never sets
// allowDeepAdvice — only CompanyDetailView.vue does, and it owns the actual
// authenticated fetch call, keeping this component itself auth-agnostic.
const props = withDefaults(
  defineProps<{ payload: ValidatedPayload; allowDeepAdvice?: boolean; deepAdviceLoading?: boolean }>(),
  { allowDeepAdvice: false, deepAdviceLoading: false }
);
defineEmits<{ 'generate-deep-advice': [] }>();

const BAND_LABEL: Record<string, string> = {
  leading: 'Leading', visible: 'Visible, often beaten',
  weak: 'Weak presence', invisible: 'Invisible', unavailable: 'Score unavailable',
};
const BAND_EXPLAIN: Record<string, string> = {
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
const ADVICE_HEADING: Record<AdviceId, string> = {
  'no-data': 'No data',
  'zero-citations': 'Priority',
  'consistently-beaten': 'Watch this',
  leading: 'Working well',
  mixed: 'Mixed results',
  'top-rival': 'Top competitor',
};
const CHECK_BADGE_LABEL: Record<Rank, string> = {
  'ranked-1': 'Mentioned first',
  'ranked-2': 'Mentioned 2nd',
  'ranked-3': 'Mentioned 3rd',
  mentioned: 'Mentioned, not top 3',
  'not-mentioned': 'Not mentioned',
  // legacy value, see the Rank type comment in scanPayload.ts
  beaten: 'Mentioned, but beaten',
};

const band = computed(() => scoreBand(props.payload.score));

const RING_R = 54;
const RING_STROKE = 12;
const ringCircumference = 2 * Math.PI * RING_R;
const ringOffset = computed(() =>
  props.payload.score !== null ? ringCircumference * (1 - props.payload.score / 100) : 0
);

const rank1Count = computed(() => props.payload.perPromptRank.filter((r) => r.rank === 'ranked-1').length);
const beatenCount = computed(() =>
  props.payload.perPromptRank.filter((r) => ['ranked-2', 'ranked-3', 'mentioned', 'beaten'].includes(r.rank)).length
);

const headlineKind = computed<'none' | 'zero' | 'beaten' | 'good'>(() => {
  if (props.payload.completedCalls === 0) return 'none';
  if (props.payload.citedCount === 0) return 'zero';
  if (beatenCount.value > 0) return 'beaten';
  return 'good';
});

interface ScoreboardRow { name: string; isYou: boolean; mentionCount: number; beatBrandCount: number; ambiguous: boolean; }
const scoreboardRows = computed<ScoreboardRow[]>(() => {
  if (props.payload.completedCalls === 0) return [];
  const rivals = [...props.payload.competitorTallies].sort((a, b) => b.mentionCount - a.mentionCount);
  return [
    // The brand's own row already gets the top-level "common word" warning
    // banner above (payload.ambiguousBrandFlag) — never flag it again here.
    { name: props.payload.brand, isYou: true, mentionCount: props.payload.citedCount, beatBrandCount: 0, ambiguous: false },
    ...rivals.map((r) => ({ ...r, isYou: false })),
  ];
});

function rowPct(row: ScoreboardRow) {
  if (props.payload.completedCalls === 0) return 0;
  return Math.min(100, Math.round((row.mentionCount / props.payload.completedCalls) * 100));
}

// rawResponses[i] and perPromptRank[i] describe the same completed call —
// both are built by mapping over aggregateProspect()'s `completed` array in
// the same order, with no filtering/reordering in between — so zipping by
// index is safe. Grouped by promptIndex so each prompt template
// shows its 2 model outcomes together, answering "which prompt, which
// model, did it show up" directly instead of leaving it to a flat raw-text
// dump the reader has to cross-reference by hand.
interface CheckRow { model: string; rank: Rank; text: string; }
interface CheckGroup { promptIndex: number; label: string; checks: CheckRow[]; }
const checkBreakdown = computed<CheckGroup[]>(() => {
  const byPrompt = new Map<number, CheckRow[]>();
  props.payload.rawResponses.forEach((r, i) => {
    const rank = props.payload.perPromptRank[i]?.rank ?? 'not-mentioned';
    if (!byPrompt.has(r.promptIndex)) byPrompt.set(r.promptIndex, []);
    byPrompt.get(r.promptIndex)!.push({ model: r.model, rank, text: r.text });
  });
  return [...byPrompt.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([promptIndex, checks]) => ({
      promptIndex,
      label: PROMPT_LABELS[promptIndex] || `Prompt ${promptIndex + 1}`,
      checks,
    }));
});

// Per-call failure detail (Milestone A3 — restores what commit 522eb63
// shipped and 74afa41 accidentally deleted the next day). Joins each
// failure's promptIndex against PROMPT_LABELS for a human-readable
// description, same pattern checkBreakdown above already uses.
interface FailureRow { model: string; promptLabel: string; error: string; }
const failureRows = computed<FailureRow[]>(() =>
  props.payload.failures.map((f) => ({
    model: f.model,
    promptLabel: PROMPT_LABELS[f.promptIndex] || `Prompt ${f.promptIndex + 1}`,
    error: f.error,
  }))
);

// Only 'top-rival' can produce an empty body (when no valid competitor
// name survives re-validation) — the other advice ids always render
// something, mirroring the original ADVICE_COPY behavior where an empty
// body caused the whole card to be skipped.
const visibleAdvice = computed(() =>
  props.payload.advice.filter((c) => c.id !== 'top-rival' || asShortString(c.params.name))
);
</script>

<template>
  <div class="scan-detail">
    <h1>{{ payload.brand }}</h1>
    <div class="meta">
      <a v-if="payload.safeWebsiteHref" :href="payload.safeWebsiteHref" target="_blank" rel="noopener">{{ payload.website }}</a>
      <template v-else>{{ payload.website }}</template>
      &middot; checked {{ payload.generatedAtDate.toLocaleString() }}
    </div>

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

    <!-- advice cards -->
    <template v-if="visibleAdvice.length">
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
    </template>

    <!-- deep advice: on-demand LLM-generated steps, Milestone 6 -->
    <template v-if="allowDeepAdvice || payload.deepAdvice">
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
    </template>

    <!-- check-by-check breakdown: every completed call, grouped by which
         prompt produced it, with each model's outcome shown next to
         its own raw response text (expand per-check rather than one long
         undifferentiated dump). -->
    <template v-if="checkBreakdown.length">
      <h2>Check-by-check</h2>
      <div class="card checks-card">
        <div class="check-group" v-for="group in checkBreakdown" :key="group.promptIndex">
          <div class="check-prompt-label">{{ group.label }}</div>
          <details class="check-row" v-for="(c, i) in group.checks" :key="i">
            <summary>
              <span class="check-model">{{ c.model }}</span>
              <span class="check-badge" :class="`badge-${c.rank}`">{{ CHECK_BADGE_LABEL[c.rank] }}</span>
            </summary>
            <div class="check-text">{{ c.text }}</div>
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
      </div>
    </template>

    <footer>Detection is presence-only, not sentiment-aware — a negative or comparative mention still counts as "cited." The score above is a heuristic weighting of that same presence-only detection, not an independently verified rank. This is a single point-in-time check, not a monitored score. Results are fixed at generation time; this link will always show the same result.</footer>
  </div>
</template>

<style scoped>
h1 { font-size: 1.5rem; margin: 0 0 2px; }
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
  border-radius: 14px;
  padding: 20px;
  margin-bottom: 16px;
}

/* ---- score meter ---- */
.score-card { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
.score-ring-wrap { position: relative; width: 132px; height: 132px; flex: none; }
.score-ring-wrap svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.score-ring-track { fill: none; stroke: var(--gridline); }
.score-ring-fill { fill: none; stroke-linecap: round; transition: stroke-dashoffset 0.6s ease; }
@media (prefers-reduced-motion: reduce) { .score-ring-fill { transition: none; } }
.score-ring-number {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
}
.score-ring-number .value { font-size: 2rem; font-weight: 600; font-variant-numeric: proportional-nums; line-height: 1; }
.score-ring-number .of100 { font-size: 0.75rem; color: var(--faint); margin-top: 2px; }
.score-side { flex: 1; min-width: 180px; }
.score-band-label { font-size: 1.05rem; font-weight: 600; margin-bottom: 4px; }
.score-explain { color: var(--muted); font-size: 0.88rem; }
.confidence-note {
  font-size: 0.8rem;
  color: var(--faint);
  margin-top: 8px;
}
.band-leading .score-ring-fill { stroke: var(--good); }
.band-leading .score-band-label { color: var(--success-text); }
.band-visible .score-ring-fill { stroke: var(--warning); }
.band-weak .score-ring-fill { stroke: var(--serious); }
.band-invisible .score-ring-fill { stroke: var(--critical); }

.headline { font-size: 1.05rem; font-weight: 500; margin-bottom: 4px; }
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
.board-track { height: 20px; border-radius: 5px; background: var(--gridline); overflow: hidden; }
.board-fill { height: 100%; border-radius: 5px; }
.board-fill.you { background: var(--accent); }
.board-fill.rival { background: var(--debar); }
.board-beat { color: var(--serious); font-size: 0.8rem; margin-top: 2px; }
.board-ambiguous { color: var(--muted); font-size: 0.78rem; margin-top: 2px; font-style: italic; }

/* ---- advice cards ---- */
.advice-card {
  border-left: 4px solid var(--border);
  background: var(--card);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 10px;
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
.deep-advice-steps { margin: 0; padding-left: 20px; }
.deep-advice-steps li { margin-bottom: 14px; }
.deep-advice-steps li:last-child { margin-bottom: 0; }
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
  border: none; border-radius: 8px; background: var(--accent); color: #fff; cursor: pointer;
}
.deep-advice-button:disabled { opacity: 0.6; cursor: wait; }

h2 { font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--muted); margin: 28px 0 10px; }
h2:first-of-type { margin-top: 0; }

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
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--fg) 3%, transparent);
}
.check-row summary::-webkit-details-marker { display: none; }
.check-row[open] summary { border-radius: 8px 8px 0 0; }
.check-model { font-size: 0.85rem; color: var(--muted); font-family: ui-monospace, monospace; }
.check-badge {
  font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em;
  padding: 2px 9px; border-radius: 999px; flex: none; white-space: nowrap;
}
.badge-ranked-1 { background: color-mix(in srgb, var(--good) 20%, transparent); color: var(--success-text); }
.badge-ranked-2, .badge-ranked-3, .badge-mentioned, .badge-beaten { background: color-mix(in srgb, var(--warning) 22%, transparent); color: color-mix(in srgb, var(--warning) 70%, var(--fg)); }
.badge-not-mentioned { background: color-mix(in srgb, var(--critical) 16%, transparent); color: var(--critical); }
.check-text {
  font-size: 0.85rem; color: var(--muted);
  padding: 10px 10px 4px;
  border: 1px solid var(--border); border-top: none;
  border-radius: 0 0 8px 8px;
  white-space: pre-wrap;
}
.check-failed-note {
  margin-top: 4px; padding: 10px 0;
  font-size: 0.82rem; color: var(--muted);
  border-top: 1px solid var(--border);
}
.check-failed-note .fail-reasons { margin: 8px 0 0; padding-left: 18px; line-height: 1.6; }
.check-failed-note .fail-reasons li { margin-bottom: 4px; }
.check-failed-note .fail-reasons .check-model { color: var(--fg); }

footer { margin-top: 28px; color: var(--faint); font-size: 0.78rem; }
</style>
