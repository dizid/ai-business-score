<script setup lang="ts">
// GEO section of the dashboard report (2026-09-11 redesign): scoreboard +
// category-breakdown overview charts, then a master-detail drill-down —
// master = one row per prompt (deriveCheckBreakdown already groups
// rawResponses/perPromptRank this way), detail = every model's response to
// the selected prompt. This is the same content the legacy theme's
// "Check-by-check" accordion shows, restructured as a real detail pane
// instead of nested <details>. Dashboard-theme only.
import { computed, ref, watch } from 'vue';
import { type ValidatedPayload, type Rank } from '../scanPayload';
import { SENTIMENT_LABEL, CHECK_BADGE_LABEL, CATEGORY_EXPLAIN } from '../scanLabels';
import {
  sentimentKey, deriveSentimentByKey, deriveScoreboardRows, scoreboardRowPct, shareOfVoicePct,
  deriveCompetitorAppearances, deriveCategoryBreakdown, deriveCheckBreakdown, deriveProviderBreakdown,
  type ScoreboardRow, type CheckGroup,
} from '../scanDerived';

const props = withDefaults(
  defineProps<{
    payload: ValidatedPayload;
    allowSentimentJudge?: boolean;
    sentimentJudgeLoadingKey?: string | null;
  }>(),
  { allowSentimentJudge: false, sentimentJudgeLoadingKey: null }
);
defineEmits<{ 'judge-sentiment': [promptIndex: number, model: string] }>();

const sentimentByKey = computed(() => deriveSentimentByKey(props.payload));

const scoreboardRows = computed(() => deriveScoreboardRows(props.payload));
function rowPct(row: ScoreboardRow) { return scoreboardRowPct(props.payload, row); }
function rowSharePct(row: ScoreboardRow) { return shareOfVoicePct(scoreboardRows.value, row); }
const expandedCompetitors = ref<Set<string>>(new Set());
function toggleCompetitorExpanded(name: string) {
  const next = new Set(expandedCompetitors.value);
  if (next.has(name)) next.delete(name); else next.add(name);
  expandedCompetitors.value = next;
}
function competitorAppearances(name: string) { return deriveCompetitorAppearances(props.payload, name); }

const categoryBreakdown = computed(() => deriveCategoryBreakdown(props.payload));
const providerBreakdown = computed(() => deriveProviderBreakdown(props.payload));

// Mention highlighting for the detail pane's raw response text — same
// segment-based (non-v-html) approach as the legacy theme's Details tab,
// duplicated here since it closes over this component's own props.
const highlightTerms = computed<string[]>(() => {
  const terms: string[] = [];
  if (!props.payload.ambiguousBrandFlag) terms.push(props.payload.brand);
  for (const c of props.payload.competitorTallies) {
    if (!c.ambiguous) terms.push(c.name);
  }
  return terms;
});
function escapeRegExp(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
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

// Master-detail: one master row per prompt — clicking a row shows every
// model's response to that prompt in the detail pane on the right.
const checkBreakdown = computed(() => deriveCheckBreakdown(props.payload));
const RANK_ORDER: Rank[] = ['ranked-1', 'ranked-2', 'ranked-3', 'mentioned', 'beaten', 'not-mentioned'];
function bestRank(group: CheckGroup): Rank {
  let best: Rank = 'not-mentioned';
  let bestIdx = RANK_ORDER.length;
  for (const c of group.checks) {
    const idx = RANK_ORDER.indexOf(c.rank);
    if (idx !== -1 && idx < bestIdx) { bestIdx = idx; best = c.rank; }
  }
  return best;
}
const selectedPromptIndex = ref<number | null>(null);
watch(checkBreakdown, (groups) => {
  if (!groups.some((g) => g.promptIndex === selectedPromptIndex.value)) {
    selectedPromptIndex.value = groups.length ? groups[0].promptIndex : null;
  }
}, { immediate: true });
const selectedGroup = computed(() => checkBreakdown.value.find((g) => g.promptIndex === selectedPromptIndex.value) ?? null);
function selectPrompt(promptIndex: number) { selectedPromptIndex.value = promptIndex; }
</script>

<template>
  <div class="report-geo">
    <template v-if="scoreboardRows.length">
      <h2>Scoreboard</h2>
      <div class="card">
        <div class="board-row" v-for="row in scoreboardRows" :key="row.name + row.isYou">
          <div class="board-label">
            <span class="board-name" :title="row.name">{{ row.name }}<span v-if="row.isYou" class="you-tag"> (you)</span></span>
            <span class="board-count">{{ row.mentionCount }}/{{ payload.completedCalls }} &middot; {{ rowSharePct(row) }}% share of voice</span>
          </div>
          <div class="board-track"><div class="board-fill" :class="row.isYou ? 'you' : 'rival'" :style="{ width: rowPct(row) + '%' }"></div></div>
          <button
            v-if="!row.isYou && row.beatBrandCount > 0"
            type="button"
            class="board-beat board-beat-toggle"
            :aria-expanded="expandedCompetitors.has(row.name)"
            @click="toggleCompetitorExpanded(row.name)"
          >beat you {{ row.beatBrandCount }}× <span class="board-beat-chevron">{{ expandedCompetitors.has(row.name) ? '▲' : '▼' }}</span></button>
          <ul class="competitor-appearances" v-if="!row.isYou && expandedCompetitors.has(row.name)">
            <li v-for="(a, i) in competitorAppearances(row.name)" :key="i">
              <span class="citation-meta">{{ a.model }} &middot; {{ a.promptLabel }}</span>
              <span class="competitor-snippet">&ldquo;&hellip;{{ a.snippet }}&hellip;&rdquo;</span>
            </li>
            <li v-if="competitorAppearances(row.name).length === 0" class="competitor-appearances-empty">No specific checks found for this name.</li>
          </ul>
          <div class="board-ambiguous" v-if="row.ambiguous">Name is a common word — automated detection was skipped for some checks. This tally may undercount.</div>
        </div>
      </div>
    </template>

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
          <p class="category-detail" v-if="CATEGORY_EXPLAIN[row.category]">{{ CATEGORY_EXPLAIN[row.category] }}</p>
          <div class="sentiment-summary-row" v-if="row.sentimentCounts.length">
            <span
              v-for="s in row.sentimentCounts" :key="s.classification"
              class="sentiment-badge" :class="`sentiment-${s.classification}`"
            >{{ s.count }} {{ s.label }}</span>
          </div>
        </div>
      </div>
    </template>

    <template v-if="providerBreakdown.length > 1">
      <h2>Which AI favors you</h2>
      <div class="card">
        <div class="category-row" v-for="row in providerBreakdown" :key="row.model">
          <div class="board-label">
            <span class="board-name check-model">{{ row.model }}</span>
            <span class="board-count">{{ row.ranked1 + row.beaten }}/{{ row.total }} mentioned</span>
          </div>
          <div class="board-track"><div class="board-fill you" :style="{ width: row.presencePct + '%' }"></div></div>
          <div class="category-detail">{{ row.ranked1 }} first, {{ row.beaten }} beaten to it, {{ row.notMentioned }} not mentioned</div>
        </div>
      </div>
    </template>

    <template v-if="checkBreakdown.length">
      <h2>Query-by-query breakdown</h2>
      <div class="geo-master-detail">
        <div class="geo-master">
          <button
            v-for="group in checkBreakdown" :key="group.promptIndex"
            type="button"
            class="geo-master-row"
            :class="{ active: group.promptIndex === selectedPromptIndex }"
            @click="selectPrompt(group.promptIndex)"
          >
            <span class="geo-master-label">{{ group.label }}</span>
            <span class="geo-master-meta">
              <span class="check-badge" :class="`badge-${bestRank(group)}`">{{ CHECK_BADGE_LABEL[bestRank(group)] }}</span>
              <span class="geo-master-count">{{ group.checks.length }} model{{ group.checks.length === 1 ? '' : 's' }}</span>
            </span>
          </button>
        </div>
        <div class="geo-detail card" v-if="selectedGroup">
          <div class="geo-detail-label">{{ selectedGroup.label }}</div>
          <div class="geo-detail-check" v-for="(c, i) in selectedGroup.checks" :key="i">
            <div class="geo-detail-head">
              <span class="check-model">{{ c.model }}</span>
              <span class="check-badges">
                <span class="check-badge" :class="`badge-${c.rank}`">{{ CHECK_BADGE_LABEL[c.rank] }}</span>
                <span
                  v-if="sentimentByKey.get(sentimentKey(selectedGroup.promptIndex, c.model))"
                  class="sentiment-badge"
                  :class="`sentiment-${sentimentByKey.get(sentimentKey(selectedGroup.promptIndex, c.model))!.classification}`"
                >{{ SENTIMENT_LABEL[sentimentByKey.get(sentimentKey(selectedGroup.promptIndex, c.model))!.classification] }}</span>
              </span>
            </div>
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
            <div class="check-sentiment" v-if="sentimentByKey.get(sentimentKey(selectedGroup.promptIndex, c.model))">
              {{ sentimentByKey.get(sentimentKey(selectedGroup.promptIndex, c.model))!.reasoning }}
            </div>
            <button
              v-else-if="allowSentimentJudge && c.rank !== 'not-mentioned'"
              type="button"
              class="judge-sentiment-button"
              :disabled="sentimentJudgeLoadingKey === sentimentKey(selectedGroup.promptIndex, c.model)"
              @click="$emit('judge-sentiment', selectedGroup.promptIndex, c.model)"
            >
              {{ sentimentJudgeLoadingKey === sentimentKey(selectedGroup.promptIndex, c.model) ? 'Judging…' : 'Judge sentiment' }}
            </button>
          </div>
        </div>
      </div>
    </template>
    <p class="geo-empty" v-else-if="!scoreboardRows.length && !categoryBreakdown.length">No GEO check details available for this scan.</p>
  </div>
</template>

<style scoped>
.card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow); }
h2 { font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--muted); margin: 28px 0 10px; }
h2:first-of-type { margin-top: 0; }

.board-row { margin-bottom: 12px; }
.board-row:last-child { margin-bottom: 0; }
.board-label { display: flex; justify-content: space-between; gap: 8px; font-size: 0.88rem; margin-bottom: 4px; }
.board-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.board-name .you-tag { color: var(--accent); font-weight: 600; }
.board-count { color: var(--muted); flex: none; font-variant-numeric: proportional-nums; }
.board-track { height: 22px; border-radius: 6px; background: var(--gridline); overflow: hidden; }
.board-fill { height: 100%; border-radius: 6px; transition: width 0.6s ease; }
@media (prefers-reduced-motion: reduce) { .board-fill { transition: none; } }
.board-fill.you { background: var(--accent-3); }
.board-fill.rival { background: var(--debar); }
.board-beat { color: var(--serious); font-size: 0.8rem; margin-top: 2px; }
.board-beat-toggle { background: none; border: none; padding: 0; font: inherit; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
.board-beat-chevron { font-size: 0.7em; }
.competitor-appearances { list-style: none; margin: 6px 0 0; padding: 0; }
.competitor-appearances li { padding: 6px 0; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 2px; }
.competitor-appearances li:first-child { border-top: none; }
.competitor-snippet { font-size: 0.85rem; }
.competitor-appearances-empty { color: var(--muted); font-style: italic; }
.board-ambiguous { color: var(--muted); font-size: 0.78rem; margin-top: 2px; font-style: italic; }
.citation-meta { font-size: 0.78rem; color: var(--faint); }

.category-row { margin-bottom: 16px; }
.category-row:last-child { margin-bottom: 0; }
.category-detail { color: var(--muted); font-size: 0.8rem; margin-top: 4px; }
.category-row .sentiment-summary-row { margin: 8px 0 0; }
.category-row .board-fill.you { background: var(--accent-3); }

.sentiment-summary-row { display: flex; flex-wrap: wrap; gap: 6px; }
.sentiment-badge { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 2px 9px; border-radius: 999px; flex: none; white-space: nowrap; }
.sentiment-recommended { background: color-mix(in srgb, var(--good) 20%, transparent); color: var(--success-text); }
.sentiment-neutral { background: color-mix(in srgb, var(--faint) 20%, transparent); color: var(--muted); }
.sentiment-negative { background: color-mix(in srgb, var(--critical) 16%, transparent); color: var(--critical); }
.sentiment-comparison-only { background: color-mix(in srgb, var(--warning) 22%, transparent); color: color-mix(in srgb, var(--warning) 70%, var(--fg)); }

.check-badge { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 2px 9px; border-radius: 999px; flex: none; white-space: nowrap; }
.badge-ranked-1 { background: color-mix(in srgb, var(--good) 20%, transparent); color: var(--success-text); }
.badge-ranked-2, .badge-ranked-3, .badge-mentioned, .badge-beaten { background: color-mix(in srgb, var(--warning) 22%, transparent); color: color-mix(in srgb, var(--warning) 70%, var(--fg)); }
.badge-not-mentioned { background: color-mix(in srgb, var(--critical) 16%, transparent); color: var(--critical); }
.check-badges { display: flex; align-items: center; gap: 6px; flex: none; }
.check-model { font-size: 0.85rem; color: var(--muted); font-family: ui-monospace, monospace; }

.check-text { font-size: 0.85rem; color: var(--muted); white-space: pre-wrap; }
.mention-highlight { background: color-mix(in srgb, var(--accent) 30%, transparent); color: var(--fg); border-radius: 3px; padding: 0 2px; }
.check-sources { font-size: 0.78rem; color: var(--muted); margin-top: 8px; display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
.check-sources a { color: var(--accent); }
.check-sentiment { font-size: 0.82rem; color: var(--muted); font-style: italic; margin-top: 8px; }
.judge-sentiment-button {
  margin-top: 8px; padding: 5px 12px; font-size: 0.78rem; font-weight: 600;
  border: 1px solid var(--border); border-radius: 999px;
  background: transparent; color: var(--fg); cursor: pointer;
  transition: border-color 0.15s ease;
}
.judge-sentiment-button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.judge-sentiment-button:disabled { opacity: 0.6; cursor: wait; }

/* Master-detail: normal document flow only, no overflow/max-height on
   either pane — this report has exactly one scroll region (the page), see
   CompanyDetailView.vue's scroll-region fix for the outer-level version of
   the same rule. */
.geo-master-detail { display: block; }
.geo-master { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.geo-master-row {
  display: flex; flex-direction: column; align-items: flex-start; gap: 8px;
  width: 100%; text-align: left;
  background: var(--card); border: 1px solid var(--border); border-left: 3px solid transparent;
  border-radius: 8px; padding: 10px 12px;
  color: var(--fg); font: inherit; cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.geo-master-row:hover { border-color: var(--accent); }
.geo-master-row.active { border-color: var(--accent); border-left-color: var(--accent); background: color-mix(in srgb, var(--accent) 7%, var(--card)); }
.geo-master-label { font-size: 0.85rem; font-weight: 500; line-height: 1.3; }
.geo-master-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.geo-master-count { font-size: 0.78rem; color: var(--faint); }
.geo-detail { padding: 16px 20px; }
.geo-detail-label { font-size: 0.85rem; font-weight: 600; margin-bottom: 12px; }
.geo-detail-check { padding: 14px 0; border-top: 1px solid var(--border); }
.geo-detail-check:first-child { border-top: none; padding-top: 0; }
.geo-detail-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
.geo-empty { color: var(--muted); font-size: 0.88rem; padding: 8px 0; }

@media (min-width: 700px) {
  .geo-master-detail { display: grid; grid-template-columns: 300px 1fr; gap: 20px; align-items: start; }
  .geo-master { margin-bottom: 0; position: sticky; top: 24px; }
}
</style>
