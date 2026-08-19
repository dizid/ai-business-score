<script setup lang="ts">
// Generalizes the rotating-chevron <details>/<summary> pattern already
// proven in ScanDetail.vue's check-by-check breakdown (one specific
// <details class="check-row">) into a reusable "harmonica bar" — a summary
// row that expands to reveal a section's content. Used for every
// Details-tab section in ScanDetail.vue; the check-by-check breakdown's own
// per-call <details> (one level deeper, inside this component's slot) is
// untouched — this wraps around it, not a replacement for it.
withDefaults(
  defineProps<{
    title: string;
    statusText?: string | null;
    defaultOpen?: boolean;
  }>(),
  { statusText: null, defaultOpen: false }
);
</script>

<template>
  <details class="collapsible-section" :open="defaultOpen">
    <summary>
      <span class="cs-title">{{ title }}</span>
      <span v-if="statusText" class="cs-status">{{ statusText }}</span>
    </summary>
    <div class="cs-body">
      <slot />
    </div>
  </details>
</template>

<style scoped>
.collapsible-section {
  border: 1px solid var(--border);
  border-radius: 10px;
  margin-bottom: 10px;
  background: var(--card);
  box-shadow: var(--shadow);
}
.collapsible-section:last-child { margin-bottom: 0; }
.collapsible-section summary {
  cursor: pointer;
  list-style: none;
  position: relative;
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 14px 34px 14px 16px;
  border-radius: 10px;
  transition: background 0.15s ease;
}
.collapsible-section summary:hover { background: color-mix(in srgb, var(--fg) 3%, transparent); }
.collapsible-section summary::-webkit-details-marker { display: none; }
.collapsible-section summary::after {
  content: "";
  position: absolute; right: 16px; top: 50%;
  width: 8px; height: 8px;
  border-right: 2px solid var(--faint); border-bottom: 2px solid var(--faint);
  transform: translateY(-65%) rotate(45deg);
  transition: transform 0.2s ease;
}
.collapsible-section[open] summary::after { transform: translateY(-35%) rotate(-135deg); }
.collapsible-section[open] summary { border-radius: 10px 10px 0 0; border-bottom: 1px solid var(--border); }
.cs-title { font-weight: 600; font-size: 0.95rem; }
.cs-status { color: var(--muted); font-size: 0.85rem; flex: none; font-variant-numeric: proportional-nums; }
.cs-body { padding: 16px; }
</style>
