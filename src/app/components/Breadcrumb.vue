<script setup lang="ts">
import Icon from '../../shared/Icon.vue';

// Simple, shallow trail — this app is only ever 2 levels deep today
// (companies list -> one company). Kept generic (a list of crumbs, last one
// plain text) so it scales if more nesting gets added later.
defineProps<{
  crumbs: { label: string; to?: string }[];
}>();
</script>

<template>
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <template v-for="(crumb, i) in crumbs" :key="i">
      <router-link v-if="crumb.to" :to="crumb.to">{{ crumb.label }}</router-link>
      <span v-else class="current">{{ crumb.label }}</span>
      <Icon v-if="i < crumbs.length - 1" name="chevron" class="sep" />
    </template>
  </nav>
</template>

<style scoped>
.breadcrumb { display: flex; align-items: center; gap: 2px; font-size: 0.85rem; margin-bottom: 12px; flex-wrap: wrap; }
.breadcrumb a { color: var(--muted); text-decoration: underline; text-underline-offset: 2px; }
.breadcrumb a:hover { color: var(--fg); }
.breadcrumb .current { color: var(--muted); }
.breadcrumb .sep { width: 13px; height: 13px; color: var(--faint); }
</style>
