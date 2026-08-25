<script setup lang="ts">
import { computed, ref } from 'vue';

// Multi-series sibling to CompanyProgressChart.vue (score-over-time, single
// series, deliberately no legend). This plots mention-count-over-time for
// the brand plus its top named competitors, so per the dataviz skill's rule
// ("a legend is always present for >=2 series") it carries one. Same
// hand-rolled SVG approach and viewBox dimensions as the sibling chart, no
// charting library, reusing the same theme.css tokens (plus the new
// --competitor-1..5 slots added alongside this component — see theme.css's
// own comment for the palette-validator results).
export interface CompetitorTallyPoint { name: string; mentionCount: number; ambiguous: boolean; }
const props = defineProps<{
  scans: {
    id: string;
    generatedAt: string;
    brandMentionCount: number;
    competitorTallies: CompetitorTallyPoint[];
  }[];
}>();

// Clicking a marker re-selects that scan, same as CompanyProgressChart.vue.
const emit = defineEmits<{ (e: 'select-point', id: string): void }>();

const points = computed(() =>
  [...props.scans]
    .filter((s) => s.generatedAt)
    .sort((a, b) => a.generatedAt.localeCompare(b.generatedAt))
);

// Capped at 5 named competitors (dataviz skill: a 6th+ series is never a
// generated hue — it's dropped, never cycled) — ranked by total mentions
// across the whole trend so the most relevant rivals win the limited slots.
// Ambiguous names (common words, unreliable detection) are excluded, same
// discipline ScanDetail.vue's own mention-highlighting already applies.
const COMPETITOR_COLORS = [
  'var(--competitor-1)', 'var(--competitor-2)', 'var(--competitor-3)', 'var(--competitor-4)', 'var(--competitor-5)',
];
const MAX_COMPETITOR_SERIES = 5;

interface Series { key: string; label: string; color: string; isYou: boolean; values: number[]; }
const series = computed<Series[]>(() => {
  const totals = new Map<string, number>();
  for (const s of points.value) {
    for (const c of s.competitorTallies) {
      if (c.ambiguous) continue;
      totals.set(c.name, (totals.get(c.name) ?? 0) + c.mentionCount);
    }
  }
  const topNames = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_COMPETITOR_SERIES)
    .map(([name]) => name);

  const brandSeries: Series = {
    key: '__you__',
    label: 'You',
    color: 'var(--accent)',
    isYou: true,
    values: points.value.map((s) => s.brandMentionCount),
  };
  const competitorSeries: Series[] = topNames.map((name, i) => ({
    key: name,
    label: name,
    color: COMPETITOR_COLORS[i],
    isYou: false,
    values: points.value.map((s) => s.competitorTallies.find((c) => c.name === name && !c.ambiguous)?.mentionCount ?? 0),
  }));
  return [brandSeries, ...competitorSeries];
});

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

// Unlike the score chart (fixed 0-100), mention counts have no natural
// ceiling — scale to the actual max across every series, rounded up to a
// friendly gridline step.
const maxValue = computed(() => {
  const all = series.value.flatMap((s) => s.values);
  const max = Math.max(1, ...all);
  return Math.ceil(max / 5) * 5;
});
function yFor(value: number) {
  return PAD_TOP + plotHeight * (1 - value / maxValue.value);
}

// Same successive-quadratic-Bézier smoothing as CompanyProgressChart.vue.
// Unlike that chart, a mention count of 0 is real data (the entity simply
// wasn't mentioned in that scan), not "no data" — so lines never break here.
function linePathFor(values: number[]) {
  if (values.length === 0) return '';
  const pts = values.map((v, i) => ({ x: xFor(i), y: yFor(v) }));
  if (pts.length < 2) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const curr = pts[i];
    const next = pts[i + 1];
    const midX = (curr.x + next.x) / 2;
    const midY = (curr.y + next.y) / 2;
    d += ` Q ${curr.x} ${curr.y} ${midX} ${midY}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

const gridlines = computed(() => {
  const max = maxValue.value;
  return [0, Math.round(max / 2), max];
});

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function labelAnchor(index: number): 'start' | 'middle' | 'end' {
  if (points.value.length <= 1) return 'middle';
  if (index === 0) return 'start';
  if (index === points.value.length - 1) return 'end';
  return 'middle';
}
const showAllLabels = computed(() => points.value.length <= 6);

const hoveredIndex = ref<number | null>(null);
const hoveredPoint = computed(() => (hoveredIndex.value === null ? null : points.value[hoveredIndex.value]));
const hoveredValues = computed(() => {
  if (hoveredIndex.value === null) return [];
  const i = hoveredIndex.value;
  return series.value.map((s) => ({ key: s.key, label: s.label, color: s.color, value: s.values[i] }));
});
</script>

<template>
  <div class="competitor-trend-chart" v-if="points.length && series.length > 1">
    <h2>Mentions over time</h2>
    <div class="card">
      <svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" preserveAspectRatio="xMidYMid meet">
        <!-- gridlines + y-axis labels -->
        <g v-for="g in gridlines" :key="g">
          <line class="gridline" :x1="PAD_LEFT" :x2="WIDTH - PAD_RIGHT" :y1="yFor(g)" :y2="yFor(g)" />
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

        <!-- one line per series (brand + top competitors) -->
        <path
          v-for="s in series" :key="s.key"
          class="trend-line"
          :style="{ stroke: s.color }"
          :d="linePathFor(s.values)"
        />

        <!-- markers -->
        <template v-for="(p, i) in points" :key="'markers-' + i">
          <circle
            v-for="s in series" :key="s.key + '-' + i"
            class="trend-marker"
            :class="{ hovered: hoveredIndex === i }"
            :style="{ fill: s.color }"
            :cx="xFor(i)" :cy="yFor(s.values[i])" r="4"
            @mouseenter="hoveredIndex = i"
            @mouseleave="hoveredIndex = null"
            @click="emit('select-point', p.id)"
          />
        </template>
      </svg>

      <!-- legend: always-visible text labels, never color-alone identity —
           3 of the 5 competitor colors read below 3:1 contrast on the light
           surface, so the dataviz skill's "relief" requirement (visible
           labels) applies here, not just as a nice-to-have. -->
      <div class="legend">
        <span v-for="s in series" :key="s.key" class="legend-item">
          <span class="legend-swatch" :style="{ background: s.color }"></span>{{ s.label }}
        </span>
      </div>

      <div class="tooltip" v-if="hoveredPoint">
        <span class="tooltip-date">{{ formatDate(hoveredPoint.generatedAt) }}</span>
        <span v-for="h in hoveredValues" :key="h.key" class="tooltip-entry">
          <span class="legend-swatch" :style="{ background: h.color }"></span>{{ h.label }}: <strong>{{ h.value }}</strong>
        </span>
        <span class="tooltip-hint">· click to view</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.competitor-trend-chart { margin-bottom: 8px; }
h2 { font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--muted); margin: 0 0 10px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; box-shadow: var(--shadow); }
svg { width: 100%; height: auto; display: block; }
.gridline { stroke: var(--gridline); stroke-width: 1; }
.axis-label { fill: var(--faint); font-size: 10px; font-weight: 500; }
.trend-line { fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
.trend-marker { stroke: var(--card); stroke-width: 2; cursor: pointer; transition: r 0.15s ease; }
.trend-marker.hovered { r: 6; }
@media (prefers-reduced-motion: reduce) { .trend-marker { transition: none; } }
.legend { display: flex; flex-wrap: wrap; gap: 10px 16px; margin-top: 12px; justify-content: center; }
.legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--text); }
.legend-swatch { width: 10px; height: 10px; border-radius: 50%; flex: none; display: inline-block; }
.tooltip {
  margin-top: 10px; font-size: 0.85rem; color: var(--muted); text-align: center;
  display: flex; flex-wrap: wrap; gap: 4px 12px; justify-content: center; align-items: center;
}
.tooltip-date { font-weight: 500; color: var(--fg); }
.tooltip-entry { display: inline-flex; align-items: center; gap: 4px; }
.tooltip-entry strong { color: var(--fg); }
.tooltip-hint { color: var(--faint); }
</style>
