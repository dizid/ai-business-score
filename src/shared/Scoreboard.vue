<script setup lang="ts">
// Scoreboard section — split out of ScanDetail.vue and
// CompetitorBenchmarkView.vue (2026-09-12 architecture refactor), which had
// carried byte-for-byte identical markup/script logic for this one section
// (CompetitorBenchmarkView.vue's own comment used to call the duplication
// out explicitly: "deliberately duplicates ... rather than extracting a
// shared component"). Purely presentational, `payload`-in only — same
// contract as the rest of ScanDetail.vue, so this is provably safe to use
// from result.html's unauthenticated context too (no new auth/router/fetch
// dependency introduced into the shared render path).
//
// Deliberately does NOT extract a generic `.board-*` primitive —
// ScanDetail.vue reuses those same CSS class names for unrelated sections
// (entity presence, Harmonia pillars) that this component doesn't touch;
// only the Scoreboard's own markup moved. Those classes are duplicated here
// rather than shared, since Vue's scoped styles don't cross component
// boundaries and this codebase's own established convention (see
// scanReport.ts's adviceCardMarkdown comment) is copy-pasted per-surface
// styling over a shared abstraction for small, rarely-changing presentation.
//
// Callers keep their own <h2>Scoreboard</h2> (and any sub-heading, e.g.
// CompetitorBenchmarkView.vue's "From the scan on {date}" line) in their
// own template rather than inside this component — ScanDetail.vue has a
// `.theme-dashboard h2` scoped-CSS rule that only applies to h2 elements
// declared directly in ScanDetail.vue's own template; a child component's
// h2 wouldn't carry ScanDetail.vue's scoped data-v- attribute and that rule
// would silently stop applying.
import { computed, ref } from 'vue';
import type { ValidatedPayload } from './scanPayload';
import { deriveScoreboardRows, scoreboardRowPct, shareOfVoicePct, deriveCompetitorAppearances, type ScoreboardRow } from './scanDerived';

const props = defineProps<{ payload: ValidatedPayload }>();

const scoreboardRows = computed(() => deriveScoreboardRows(props.payload));
function rowPct(row: ScoreboardRow) {
  return scoreboardRowPct(props.payload, row);
}
function rowSharePct(row: ScoreboardRow) {
  return shareOfVoicePct(scoreboardRows.value, row);
}

const expandedCompetitors = ref<Set<string>>(new Set());
function toggleCompetitorExpanded(name: string) {
  const next = new Set(expandedCompetitors.value);
  if (next.has(name)) next.delete(name); else next.add(name);
  expandedCompetitors.value = next;
}
function competitorAppearances(name: string) {
  return deriveCompetitorAppearances(props.payload, name);
}
</script>

<template>
  <div class="card" v-if="scoreboardRows.length">
    <div class="board-row" v-for="row in scoreboardRows" :key="row.name + row.isYou">
      <div class="board-label">
        <span class="board-name" :title="row.name">{{ row.name }}<span v-if="row.isYou" class="you-tag"> (you)</span></span>
        <span class="board-count">{{ row.mentionCount }}/{{ payload.completedCalls }} · {{ rowSharePct(row) }}% share of voice</span>
      </div>
      <div class="board-track"><div class="board-fill" :class="row.isYou ? 'you' : 'rival'" :style="{ width: rowPct(row) + '%' }"></div></div>
      <button
        v-if="!row.isYou && row.beatBrandCount > 0"
        type="button"
        class="board-beat board-beat-toggle"
        :aria-expanded="expandedCompetitors.has(row.name)"
        @click="toggleCompetitorExpanded(row.name)"
      >beat you {{ row.beatBrandCount }}&times; <span class="board-beat-chevron">{{ expandedCompetitors.has(row.name) ? '▲' : '▼' }}</span></button>
      <ul class="competitor-appearances" v-if="!row.isYou && expandedCompetitors.has(row.name)">
        <li v-for="(a, i) in competitorAppearances(row.name)" :key="i">
          <span class="citation-meta">{{ a.model }} &middot; {{ a.promptLabel }}</span>
          <span class="competitor-snippet">&ldquo;&hellip;{{ a.snippet }}&hellip;&rdquo;</span>
        </li>
        <li v-if="competitorAppearances(row.name).length === 0" class="competitor-appearances-empty">No specific checks found for this name.</li>
      </ul>
      <div class="board-ambiguous" v-if="row.ambiguous">Name is a common word — automated detection was skipped for some checks. This tally may undercount.</div>
    </div>
    <!-- Optional extra content inside the card, below the rows — e.g.
         CompetitorBenchmarkView.vue's "no named competitors showed up"
         note when only the brand's own row is present. ScanDetail.vue has
         no equivalent message and simply doesn't use this slot. -->
    <slot />
  </div>
</template>

<style scoped>
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: var(--shadow);
}

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
.board-beat-toggle {
  background: none; border: none; padding: 0; font: inherit; cursor: pointer;
  display: inline-flex; align-items: center; gap: 4px;
}
.board-beat-chevron { font-size: 0.7em; }
.competitor-appearances { list-style: none; margin: 6px 0 0; padding: 0; }
.competitor-appearances li {
  padding: 6px 0; border-top: 1px solid var(--border);
  display: flex; flex-direction: column; gap: 2px;
}
.competitor-appearances li:first-child { border-top: none; }
.citation-meta { font-size: 0.78rem; color: var(--faint); }
.competitor-snippet { font-size: 0.85rem; color: var(--text); }
.competitor-appearances-empty { color: var(--muted); font-style: italic; }
.board-ambiguous { color: var(--muted); font-size: 0.78rem; margin-top: 2px; font-style: italic; }
</style>
