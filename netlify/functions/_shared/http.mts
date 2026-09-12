// Response-construction helpers — added 2026-09-12 (architecture refactor)
// to replace the 50+ hand-rolled `new Response(JSON.stringify(...), {...})`
// call sites that had accumulated across netlify/functions/*.mts with no
// shared helper. `cors` stays an explicit opt-in parameter rather than a
// hidden default, matching cors.mts's own "opt-in, not automatic" design —
// stripe-webhook.mts/ops-failure-digest.mts/scheduled-rescan.mts/
// run-scan-background.mts deliberately never want CORS headers on their
// responses (see cors.mts's own header comment for why).

export function jsonResponse(
  body: unknown,
  init: { status?: number; cors?: Record<string, string> } = {}
): Response {
  const { status = 200, cors = {} } = init;
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

// Convenience wrapper for the extremely common `{ error: message, ... }`
// shape — `extra` merges in additional fields some error responses need
// (e.g. `{ upgradeRequired: true }`).
export function errorResponse(
  message: string,
  status: number,
  extra: Record<string, unknown> = {},
  cors: Record<string, string> = {}
): Response {
  return jsonResponse({ error: message, ...extra }, { status, cors });
}
