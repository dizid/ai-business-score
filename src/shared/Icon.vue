<script setup lang="ts">
defineProps<{ name: 'chevron' | 'caret-down' | 'logo' }>();
</script>

<template>
  <svg
    v-if="name === 'chevron'"
    class="icon"
    width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"
  >
    <path d="M7 4.5 11.5 9 7 13.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
  <svg
    v-else-if="name === 'caret-down'"
    class="icon"
    width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"
  >
    <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
  <svg
    v-else-if="name === 'logo'"
    class="icon"
    width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"
  >
    <circle cx="10" cy="10" r="8.5" stroke="currentColor" stroke-width="2" />
    <path d="M10 5.5v5l3.2 1.9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>
</template>

<style scoped>
.icon { display: block; flex: none; }
</style>
