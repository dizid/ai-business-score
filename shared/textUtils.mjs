// Small string-truncation helper — added 2026-09-12 (architecture refactor)
// to dedupe a `.slice(0, 300)` literal that had been independently
// hand-copied at four call sites across shared/aivis/* (an HTTP error body,
// a raw model-response dump, and two LLM-judge "reasoning" fields) rather
// than sharing one implementation. Domain-agnostic on purpose — any caller
// that needs to bound an untrusted free-form string before storing/logging/
// displaying it can reuse this instead of another bare .slice() literal.
export function truncate(str, n) {
  return str.slice(0, n);
}
