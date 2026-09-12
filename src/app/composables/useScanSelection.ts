// Master-detail scan-selection state — split out of CompanyDetailView.vue
// (2026-09-12 architecture refactor). Only that view needs this;
// CompetitorBenchmarkView.vue always uses "latest completed scan," a
// different selection rule entirely, so this composable isn't shared with
// it the way useCompany.ts is.
import { computed, ref, type Ref } from 'vue';
import { validatePayload } from '../../shared/scanPayload';

export function useScanSelection(scans: Ref<Record<string, unknown>[]>) {
  const selectedIndex = ref<number | null>(null);

  // A scan row's own id when it has one (any real DB-backed scan does);
  // falls back to its array index for a shape that somehow lacks one,
  // so v-for :key and selectScanById's lookup never collide or throw.
  function keyOf(scan: Record<string, unknown>, index: number): string {
    return (scan.id as string) || String(index);
  }

  const selectedScan = computed(() =>
    selectedIndex.value === null ? null : scans.value[selectedIndex.value] ?? null
  );
  // raw_responses/generated_at (and therefore validatePayload()) are only
  // ever populated once a scan reaches status='completed' — calling
  // validatePayload on a pending/running/failed row always returns null,
  // which used to render as a misleading generic "couldn't be rendered"
  // message indistinguishable from a genuinely malformed record. Gate on
  // status first so the real state (still running / actually failed, with
  // its real error_message) shows instead.
  const selectedScanStatus = computed(() => (selectedScan.value as any)?.status ?? 'completed');
  const selectedPayload = computed(() =>
    selectedScan.value && selectedScanStatus.value === 'completed' ? validatePayload(selectedScan.value) : null
  );

  function selectScan(index: number) {
    selectedIndex.value = index;
  }
  // Used by chart components (CompanyProgressChart.vue) whose markers only
  // know a scan's id, not its current index in the list.
  function selectScanById(id: string) {
    const idx = scans.value.findIndex((s, i) => keyOf(s, i) === id);
    if (idx !== -1) selectScan(idx);
  }
  function backToList() {
    selectedIndex.value = null;
  }

  return { selectedIndex, selectedScan, selectedScanStatus, selectedPayload, selectScan, selectScanById, backToList, keyOf };
}
