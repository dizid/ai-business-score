// Date-formatting helpers — added 2026-09-12 (architecture refactor) to
// dedupe formatDate()-shaped functions that had been independently
// hand-copied across CompanyDetailView.vue, CompetitorBenchmarkView.vue,
// CompanyProgressChart.vue, and CompetitorTrendChart.vue. Three genuinely
// distinct formats existed (not four — the chart components' versions were
// byte-identical), named here by what they're for rather than by which file
// they came from.

// CompanyDetailView.vue's scan-history list format: a full local date+time
// string. Falls back to a caller-supplied label for a value that isn't a
// non-empty string (a scan without a generatedAt yet — still running,
// queued, or failed).
export function formatDateTime(value: unknown, fallback = 'unknown date'): string {
  return typeof value === 'string' && value ? new Date(value).toLocaleString() : fallback;
}

// CompetitorBenchmarkView.vue's "From the scan on {date}" line: date only,
// no time. Falls back to an empty string (the caller's own template
// conditionally renders the surrounding sentence).
export function formatDate(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value ? new Date(value).toLocaleDateString() : fallback;
}

// CompanyProgressChart.vue's and CompetitorTrendChart.vue's x-axis label
// format — short month + day, no year (charts already show recent history,
// not multi-year spans). Both components had this exact implementation
// independently.
export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
