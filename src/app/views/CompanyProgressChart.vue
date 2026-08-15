<script setup lang="ts">
import { computed, ref } from 'vue';

// Single-series line chart (score over time) — no legend needed per the
// dataviz skill's rule ("a single series needs no legend box, the title
// names it"). Hand-rolled SVG, no chart library, matching ScanDetail.vue's
// score ring/scoreboard approach; reuses the same theme.css tokens (already
// validated dataviz-skill palette) rather than introducing new colors.
const props = defineProps<{
  scans: { id: string; generatedAt: string; score: number | null }[];
}>();

// Clicking a marker re-selects that scan in CompanyDetailView's list —
// turns the trend line into a second way to reach a specific scan, not
// just a hover-only summary.
const emit = defineEmits<{ (e: 'select-point', id: string): void }>();

// API returns newest-first; chart reads chronologically left-to-right.
const points = computed(() =>
  [...props.scans]
    .filter((s) => s.generatedAt)
    .sort((a, b) => a.generatedAt.localeCompare(b.generatedAt))
);

const WIDTH = 600;
const HEIGHT = 220;
const PAD_LEFT = 34;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 28;
const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

function xFor(index: number) {
  if (points.value.length <= 1) return PAD_LEFT + plotWidth / 2;
  return PAD_LEFT + (index / (points.value.length - 1)) * plotWidth;
}
function yFor(score: number) {
  return PAD_TOP + plotHeight * (1 - score / 100);
}

// Break the line across gaps where a scan has no score (completedCalls===0)
// rather than drawing through a fake 0 — "no data" is not "zero visibility."
const segments = computed(() => {
  const segs: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  points.value.forEach((p, i) => {
    if (p.score === null) {
      if (current.length) segs.push(current);
      current = [];
      return;
    }
    current.push({ x: xFor(i), y: yFor(p.score) });
  });
  if (current.length) segs.push(current);
  return segs;
});

// Smoothed via successive quadratic Béziers whose on-curve anchors are the
// midpoints between consecutive data points and whose control point is the
// data point itself — a standard lightweight "smooth freehand line"
// technique that needs no curve-fitting library. Degrades gracefully to a
// near-straight segment for 2-point segments.
const linePaths = computed(() =>
  segments.value.map((seg) => {
    if (seg.length < 2) return `M ${seg[0].x} ${seg[0].y}`;
    let d = `M ${seg[0].x} ${seg[0].y}`;
    for (let i = 0; i < seg.length - 1; i++) {
      const curr = seg[i];
      const next = seg[i + 1];
      const midX = (curr.x + next.x) / 2;
      const midY = (curr.y + next.y) / 2;
      d += ` Q ${curr.x} ${curr.y} ${midX} ${midY}`;
    }
    const last = seg[seg.length - 1];
    d += ` L ${last.x} ${last.y}`;
    return d;
  })
);

const gridlines = [0, 50, 100];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Anchor the first/last labels to the inside edge so they never clip past
// the SVG viewport — only interior labels center on their point.
function labelAnchor(index: number): 'start' | 'middle' | 'end' {
  if (points.value.length <= 1) return 'middle';
  if (index === 0) return 'start';
  if (index === points.value.length - 1) return 'end';
  return 'middle';
}

// Show every date label when few points, else just first/last to avoid
// overlap — consistent with the skill's "selective direct labels, never a
// number on every point" guidance.
const showAllLabels = computed(() => points.value.length <= 6);

const hoveredIndex = ref<number | null>(null);
const hovered = computed(() => (hoveredIndex.value === null ? null : points.value[hoveredIndex.value]));
</script>

<template>
  <div class="progress-chart" v-if="points.length">
    <h2>Score over time</h2>
    <div class="card">
      <svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" preserveAspectRatio="xMidYMid meet">
        <!-- gridlines + y-axis labels -->
        <g v-for="g in gridlines" :key="g">
          <line
            class="gridline"
            :x1="PAD_LEFT" :x2="WIDTH - PAD_RIGHT"
            :y1="yFor(g)" :y2="yFor(g)"
          />
          <text class="axis-label" :x="PAD_LEFT - 8" :y="yFor(g)" text-anchor="end" dominant-baseline="middle">{{ g }}</text>
        </g>

        <!-- x-axis date labels -->
        <template v-for="(p, i) in points" :key="'label-' + i">
          <text
            v-if="showAllLabels || i === 0 || i === points.length - 1"
            class="axis-label"
            :x="xFor(i)" :y="HEIGHT - 8"
            :text-anchor="labelAnchor(i)"
          >{{ formatDate(p.generatedAt) }}</text>
        </template>

        <!-- line segments (broken across no-data gaps) -->
        <path v-for="(d, i) in linePaths" :key="'line-' + i" class="score-line" :d="d" />

        <!-- markers -->
        <template v-for="(p, i) in points" :key="'marker-' + i">
          <circle
            v-if="p.score !== null"
            class="score-marker"
            :class="{ hovered: hoveredIndex === i }"
            :cx="xFor(i)" :cy="yFor(p.score)" r="5"
            @mouseenter="hoveredIndex = i"
            @mouseleave="hoveredIndex = null"
            @click="emit('select-point', p.id)"
          />
        </template>
      </svg>

      <div class="tooltip" v-if="hovered && hovered.score !== null">
        {{ formatDate(hovered.generatedAt) }}: <strong>{{ hovered.score }}</strong> / 100
        <span class="tooltip-hint">· click to view</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.progress-chart { margin-bottom: 8px; }
h2 { font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--muted); margin: 0 0 10px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; box-shadow: var(--shadow); }
svg { width: 100%; height: auto; display: block; }
.gridline { stroke: var(--gridline); stroke-width: 1; }
.axis-label { fill: var(--faint); font-size: 10px; font-weight: 500; }
.score-line { fill: none; stroke: var(--accent); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
.score-marker { fill: var(--accent); stroke: var(--card); stroke-width: 2; cursor: pointer; transition: r 0.15s ease; }
.score-marker.hovered { r: 7; }
@media (prefers-reduced-motion: reduce) { .score-marker { transition: none; } }
.tooltip { margin-top: 10px; font-size: 0.85rem; color: var(--muted); text-align: center; min-height: 1.2em; }
.tooltip strong { color: var(--fg); }
.tooltip-hint { color: var(--faint); }
</style>
