<script setup lang="ts">
// "Compare to previous scan" — what changed between two scans, computed
// entirely client-side (see scanDiff.ts's header comment for why). Reuses
// the .check-badge/.board-track/.board-fill visual language every other
// scan-rendering surface already established, duplicated into this
// component's own <style scoped> per this codebase's established
// per-surface-copy convention (see Scoreboard.vue's own header comment).
import { computed } from 'vue';
import { type ValidatedPayload } from './scanPayload';
import { CHECK_BADGE_LABEL } from './scanLabels';
import { computeScanDiff } from './scanDiff';

const props = defineProps<{
  prior: ValidatedPayload;
  current: ValidatedPayload;
}>();

const diff = computed(() => computeScanDiff(props.prior, props.current));
const changedRanks = computed(() => diff.value.rankChanges.filter((r) => r.improved || r.worsened));
const movedCompetitors = computed(() => diff.value.competitorDiffs.filter((c) => c.delta !== 0));
</script>

<template>
  <div class="scan-diff">
    <div class="card score-diff-card">
      <div class="score-diff-label">Score</div>
      <div class="score-diff-values">
        <span class="score-diff-num">{{ diff.scoreDiff.prior ?? '—' }}</span>
        <span class="score-diff-arrow">→</span>
        <span class="score-diff-num">{{ diff.scoreDiff.current ?? '—' }}</span>
        <span
          v-if="diff.scoreDiff.delta !== null"
          class="score-diff-delta"
          :class="diff.scoreDiff.delta > 0 ? 'up' : diff.scoreDiff.delta < 0 ? 'down' : 'flat'"
        >{{ diff.scoreDiff.delta > 0 ? '+' : '' }}{{ diff.scoreDiff.delta }}</span>
      </div>
    </div>

    <template v-if="changedRanks.length">
      <h2>What changed, query by query</h2>
      <div class="card">
        <div class="rank-change-row" v-for="r in changedRanks" :key="r.promptIndex">
          <span class="rank-change-label">{{ r.promptLabel }}</span>
          <span class="rank-change-badges">
            <span class="check-badge" :class="r.priorRank ? `badge-${r.priorRank}` : 'badge-none'">{{ r.priorRank ? CHECK_BADGE_LABEL[r.priorRank] : 'No data' }}</span>
            <span class="rank-change-arrow" :class="r.improved ? 'up' : 'down'">→</span>
            <span class="check-badge" :class="r.currentRank ? `badge-${r.currentRank}` : 'badge-none'">{{ r.currentRank ? CHECK_BADGE_LABEL[r.currentRank] : 'No data' }}</span>
          </span>
        </div>
      </div>
    </template>
    <p class="diff-empty" v-else>No change in query-by-query results between these two scans.</p>

    <template v-if="movedCompetitors.length">
      <h2>Competitor mention changes</h2>
      <div class="card">
        <div class="competitor-diff-row" v-for="c in movedCompetitors" :key="c.name">
          <span class="competitor-diff-name">{{ c.name }}</span>
          <span class="competitor-diff-values">
            {{ c.priorMentionCount }} → {{ c.currentMentionCount }}
            <!-- More competitor mentions is bad for the user, fewer is
                 good — the opposite sense of "up"/"down" from the rank-
                 change arrows above, so this uses worse/better instead to
                 avoid the two looking like the same color rule. -->
            <span class="competitor-diff-delta" :class="c.delta > 0 ? 'worse' : 'better'">{{ c.delta > 0 ? '+' : '' }}{{ c.delta }}</span>
          </span>
        </div>
      </div>
    </template>

    <template v-if="diff.newCitations.length || diff.lostCitations.length">
      <h2>Your site, cited — what changed</h2>
      <div class="card">
        <p class="citation-diff-intro" v-if="diff.newCitations.length">New citations this scan:</p>
        <ul class="citation-diff-list" v-if="diff.newCitations.length">
          <li v-for="(c, i) in diff.newCitations" :key="'new-' + i" class="new">
            <a :href="c.url" target="_blank" rel="noopener">{{ c.title || c.url }}</a>
          </li>
        </ul>
        <p class="citation-diff-intro" v-if="diff.lostCitations.length">No longer cited:</p>
        <ul class="citation-diff-list" v-if="diff.lostCitations.length">
          <li v-for="(c, i) in diff.lostCitations" :key="'lost-' + i" class="lost">
            <a :href="c.url" target="_blank" rel="noopener">{{ c.title || c.url }}</a>
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>

<style scoped>
.scan-diff { margin-bottom: 8px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; margin-bottom: 16px; box-shadow: var(--shadow); }
h2 { font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--muted); margin: 0 0 10px; }
.diff-empty { color: var(--muted); font-size: 0.88rem; padding: 4px 0 16px; }

.score-diff-card { display: flex; flex-direction: column; gap: 4px; }
.score-diff-label { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
.score-diff-values { display: flex; align-items: baseline; gap: 10px; }
.score-diff-num { font-size: 1.6rem; font-weight: 700; font-variant-numeric: proportional-nums; }
.score-diff-arrow { color: var(--faint); font-size: 1.2rem; }
.score-diff-delta { font-size: 0.95rem; font-weight: 700; font-variant-numeric: proportional-nums; }
.score-diff-delta.up { color: var(--success-text); }
.score-diff-delta.down { color: var(--critical); }
.score-diff-delta.flat { color: var(--muted); }

.rank-change-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px solid var(--border); flex-wrap: wrap; }
.rank-change-row:first-child { border-top: none; padding-top: 0; }
.rank-change-label { font-size: 0.85rem; flex: 1 1 auto; min-width: 0; }
.rank-change-badges { display: flex; align-items: center; gap: 8px; flex: none; }
.rank-change-arrow { font-size: 0.9rem; }
.rank-change-arrow.up { color: var(--success-text); }
.rank-change-arrow.down { color: var(--critical); }

.check-badge { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 2px 9px; border-radius: 999px; flex: none; white-space: nowrap; }
.badge-ranked-1 { background: color-mix(in srgb, var(--good) 20%, transparent); color: var(--success-text); }
.badge-ranked-2, .badge-ranked-3, .badge-mentioned, .badge-beaten { background: color-mix(in srgb, var(--warning) 22%, transparent); color: color-mix(in srgb, var(--warning) 70%, var(--fg)); }
.badge-not-mentioned { background: color-mix(in srgb, var(--critical) 16%, transparent); color: var(--critical); }
.badge-none { background: var(--gridline); color: var(--faint); }

.competitor-diff-row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 7px 0; border-top: 1px solid var(--border); }
.competitor-diff-row:first-child { border-top: none; padding-top: 0; }
.competitor-diff-name { font-size: 0.88rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.competitor-diff-values { font-size: 0.85rem; color: var(--muted); flex: none; font-variant-numeric: proportional-nums; display: flex; align-items: center; gap: 6px; }
.competitor-diff-delta { font-weight: 700; }
.competitor-diff-delta.worse { color: var(--critical); }
.competitor-diff-delta.better { color: var(--success-text); }

.citation-diff-intro { font-size: 0.85rem; color: var(--muted); margin: 0 0 6px; }
.citation-diff-intro:not(:first-child) { margin-top: 14px; }
.citation-diff-list { list-style: none; margin: 0 0 4px; padding: 0; }
.citation-diff-list li { padding: 4px 0; font-size: 0.88rem; }
.citation-diff-list a { color: var(--accent); }
</style>
