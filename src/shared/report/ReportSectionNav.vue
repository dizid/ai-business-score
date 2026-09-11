<script setup lang="ts">
// The dashboard-theme report's primary section switcher — Executive
// Summary / GEO / SEO / Details (2026-09-11 dashboard redesign) —
// replacing the legacy Overview/Details 2-tab split for theme="dashboard"
// only. Reuses the same tabbar visual language ScanDetail.vue's legacy
// tabs already use (role="tablist", aria-selected, accent underline) so
// it doesn't introduce a second nav idiom.
export type ReportSection = 'summary' | 'geo' | 'seo' | 'details';
defineProps<{ modelValue: ReportSection }>();
defineEmits<{ 'update:modelValue': [value: ReportSection] }>();
const SECTIONS: { key: ReportSection; label: string }[] = [
  { key: 'summary', label: 'Executive Summary' },
  { key: 'geo', label: 'GEO' },
  { key: 'seo', label: 'SEO' },
  { key: 'details', label: 'Details' },
];
</script>

<template>
  <div class="report-nav" role="tablist">
    <button
      v-for="s in SECTIONS" :key="s.key"
      type="button" role="tab"
      :aria-selected="modelValue === s.key"
      :class="{ active: modelValue === s.key }"
      @click="$emit('update:modelValue', s.key)"
    >{{ s.label }}</button>
  </div>
</template>

<style scoped>
.report-nav { display: flex; gap: 4px; flex-wrap: wrap; }
.report-nav button {
  appearance: none; border: none; background: none; cursor: pointer;
  padding: 10px 4px; margin-right: 20px;
  font-size: 0.92rem; font-weight: 600; color: var(--muted);
  border-bottom: 2px solid transparent; transition: color 0.15s ease, border-color 0.15s ease;
}
.report-nav button:hover { color: var(--fg); }
.report-nav button.active { color: var(--fg); border-bottom-color: var(--accent); }
</style>
