// Shared AbortController/timeout plumbing — promoted 2026-09-12 (architecture
// refactor) from harmonia.mjs's local withTimeout(), which every one of its
// network fetchers (fetchHomepage/fetchRobotsTxt/fetchSitemapXml/
// fetchCoreWebVitals) already used. aivis-core.mjs's callModel() had
// independently reinvented the same AbortController+timer pattern with its
// own external-signal-combining logic on top; withCombinedTimeout below is
// that same logic, generalized, so both files now share one implementation
// instead of two that happened to agree by coincidence.

// A single timeoutMs-bounded abort signal, plus a clear() to cancel the
// underlying timer once the operation finishes (success or failure) so it
// doesn't fire after the fact.
export function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

// Like withTimeout, but also honors an externalSignal (e.g. a scan-wide
// deadline shared across many parallel calls) — either one aborting aborts
// the operation. Used by aivis-core.mjs's callModel, which needs both: its
// own per-call timeoutMs budget AND a caller-supplied scan-wide deadline
// that can cut a call off early regardless of how much of its own budget
// remains. ms is optional (a caller with no per-call bound can pass
// undefined/0 and rely on externalSignal alone); if neither is given,
// signal is undefined, matching an unbounded fetch.
export function withCombinedTimeout(ms, externalSignal) {
  const controller = ms ? new AbortController() : undefined;
  const timer = ms ? setTimeout(() => controller.abort(), ms) : undefined;
  const signals = [controller?.signal, externalSignal].filter(Boolean);
  const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
  return { signal, clear: () => { if (timer) clearTimeout(timer); } };
}
