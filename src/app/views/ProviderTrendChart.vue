<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatDateShort } from '../lib/format';

// Multi-series sibling to CompetitorTrendChart.vue, same file — plots
// presence-rate-over-time per AI provider ("is Claude improving while
// ChatGPT isn't?") instead of per named competitor. Unlike that chart's
// open-ended mention counts, presencePct is a 0-100 percentage, so this
// reuses CompanyProgressChart.vue's fixed [0, 50, 100] gridline scale
// instead of CompetitorTrendChart's dynamic max. Same hand-rolled SVG
// approach, no charting library, reusing the same --competitor-1..5
// dataviz-skill-validated categorical palette CompetitorTrendChart.vue
// already uses — these slots are a generic categorical palette, not
// semantically tied to "competitor."
export interface ProviderPresencePoint { model: string; presencePct: number; }
const props = defineProps<{
  scans: {
    id: string;
    generatedAt: string;
    providers: ProviderPresencePoint[];
  }[];
}>();

const emit = defineEmits<{ (e: 'select-point', id: string): void }>();

const points = computed(() =>
  [...props.scans]
    .filter((s) => s.generatedAt)
    .sort((a, b) => a.generatedAt.localeCompare(b.generatedAt))
);

// Providers are a small, bounded set (5 as of 2026-09-14) — unlike
// CompetitorTrendChart's unbounded named-competitor set, every provider
// that ever appeared in this company's scan history is shown, capped at 5
// only as a defensive match to the same dataviz-skill palette-size limit
// CompetitorTrendChart.vue already enforces (a 6th+ series is never a
// generated hue — it's dropped, never cycled).
const PROVIDER_COLORS = [
  'var(--competitor-1)', 'var(--competitor-2)', 'var(--competitor-3)', 'var(--competitor-4)', 'var(--competitor-5)',
];
const MAX_PROVIDER_SERIES = 5;

interface Series { key: string; label: string; color: string; values: (number | null)[]; }
const series = computed<Series[]>(() => {
  const totalCalls = new Map<string, number>();
  for (const s of points.value) {
    for (const p of s.providers) {
      totalCalls.set(p.model, (totalCalls.get(p.model) ?? 0) + 1);
    }
  }
  const topModels = [...totalCalls.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_PROVIDER_SERIES)
    .map(([model]) => model);

  return topModels.map((model, i) => ({
    key: model,
    label: model,
    color: PROVIDER_COLORS[i],
    // null (not 0) when this provider wasn't part of a given scan (e.g. a
    // scan predating that provider's addition, or HOSTED_MODELS excluding
    // it during the 2026-09-04->09-14 cost-control window) — a real "no
    // data" gap, not "0% presence," so the line breaks there rather than
    // drawing through a misleading zero.
    values: points.value.map((s) => s.providers.find((p) => p.model === model)?.presencePct ?? null),
  }));
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
function yFor(pct: number) {
  return PAD_TOP + plotHeight * (1 - pct / 100);
}

// Break each series' line across its own no-data gaps, same discipline as
// CompanyProgressChart.vue's score-null handling.
function segmentsFor(values: (number | null)[]) {
  const segs: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (current.length) segs.push(current);
      current = [];
      return;
    }
    current.push({ x: xFor(i), y: yFor(v) });
  });
  if (current.length) segs.push(current);
  return segs;
}
function linePathsFor(values: (number | null)[]) {
  return segmentsFor(values).map((seg) => {
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
  });
}

const gridlines = [0, 50, 100];

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
  return series.value
    .map((s) => ({ key: s.key, label: s.label, color: s.color, value: s.values[i] }))
    .filter((v) => v.value !== null);
});
</script>

<template>
  <div class="provider-trend-chart" v-if="points.length && series.length > 1">
    <h2>AI presence rate over time</h2>
    <div class="card">
      <svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" preserveAspectRatio="xMidYMid meet">
        <g v-for="g in gridlines" :key="g">
          <line class="gridline" :x1="PAD_LEFT" :x2="WIDTH - PAD_RIGHT" :y1="yFor(g)" :y2="yFor(g)" />
          <text class="axis-label" :x="PAD_LEFT - 8" :y="yFor(g)" text-anchor="end" dominant-baseline="middle">{{ g }}</text>
        </g>

        <template v-for="(p, i) in points" :key="'label-' + i">
          <text
            v-if="showAllLabels || i === 0 || i === points.length - 1"
            class="axis-label"
            :x="xFor(i)" :y="HEIGHT - 8"
            :text-anchor="labelAnchor(i)"
          >{{ formatDateShort(p.generatedAt) }}</text>
        </template>

        <template v-for="s in series" :key="s.key">
          <path
            v-for="(d, si) in linePathsFor(s.values)" :key="s.key + '-line-' + si"
            class="trend-line"
            :style="{ stroke: s.color }"
            :d="d"
          />
        </template>

        <template v-for="(p, i) in points" :key="'markers-' + i">
          <template v-for="s in series" :key="s.key + '-' + i">
            <circle
              v-if="s.values[i] !== null"
              class="trend-marker"
              :class="{ hovered: hoveredIndex === i }"
              :style="{ fill: s.color }"
              :cx="xFor(i)" :cy="yFor(s.values[i]!)" r="4"
              @mouseenter="hoveredIndex = i"
              @mouseleave="hoveredIndex = null"
              @click="emit('select-point', p.id)"
            />
          </template>
        </template>
      </svg>

      <div class="legend">
        <span v-for="s in series" :key="s.key" class="legend-item">
          <span class="legend-swatch" :style="{ background: s.color }"></span>{{ s.label }}
        </span>
      </div>

      <div class="tooltip" v-if="hoveredPoint && hoveredValues.length">
        <span class="tooltip-date">{{ formatDateShort(hoveredPoint.generatedAt) }}</span>
        <span v-for="h in hoveredValues" :key="h.key" class="tooltip-entry">
          <span class="legend-swatch" :style="{ background: h.color }"></span>{{ h.label }}: <strong>{{ h.value }}%</strong>
        </span>
        <span class="tooltip-hint">· click to view</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.provider-trend-chart { margin-bottom: 8px; }
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
.legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--text); font-family: ui-monospace, monospace; }
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
