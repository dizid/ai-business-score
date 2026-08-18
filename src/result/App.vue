<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { b64urlDecode, validatePayload, type ValidatedPayload } from '../shared/scanPayload';
import ScanDetail from '../shared/ScanDetail.vue';

// This page has no way to verify the #d= payload actually came from a real
// /scan call — it's a public static page reading data from a URL fragment,
// which anyone can forge and send as a link. validatePayload() (shared with
// history/App.vue's detail pane) is what stands between a forged payload
// and the page — reject anything that doesn't match the exact shape
// scan.mts produces, rather than coercing.
const data = ref<ValidatedPayload | null>(null);
const errorKind = ref<'missing' | 'decode' | 'invalid' | null>(null);

onMounted(() => {
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const encoded = params.get('d');

  if (!encoded) {
    errorKind.value = 'missing';
    return;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(b64urlDecode(encoded));
  } catch {
    errorKind.value = 'decode';
    return;
  }

  const validated = validatePayload(raw);
  if (!validated) {
    errorKind.value = 'invalid';
    return;
  }

  data.value = validated;
});
</script>

<template>
  <main>
    <template v-if="errorKind === 'missing'">
      <h1>No result data</h1>
      <p id="error">This link is missing its result data — it may be incomplete or corrupted. Ask for a fresh link.</p>
    </template>
    <template v-else-if="errorKind === 'decode'">
      <h1>Could not read result</h1>
      <p id="error">This link's data could not be decoded. Ask for a fresh link.</p>
    </template>
    <template v-else-if="errorKind === 'invalid'">
      <h1>Invalid result data</h1>
      <p id="error">This link's data doesn't match the expected format — it may be corrupted or not a genuine Foreground link. Ask for a fresh link.</p>
    </template>

    <ScanDetail v-else-if="data" :payload="data" />

    <template v-else-if="!errorKind">
      <p>Loading result...</p>
    </template>
  </main>
</template>

<style scoped>
main {
  max-width: 640px;
  margin: 0 auto;
  padding: 40px 20px 80px;
}
#error { color: var(--critical); }
</style>
