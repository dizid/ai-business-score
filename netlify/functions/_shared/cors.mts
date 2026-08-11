// Minimal CORS hardening (Milestone A5). Every one of these endpoints is
// called only from this same site's own app.html today — this is defensive
// hardening against a stray browser preflight or a future cross-origin
// caller, not a functional requirement right now. Auth here is always a
// Bearer JWT (see auth.mts), never a cookie, so reflecting the caller's own
// Origin (or falling back to '*') carries no CSRF-style risk — there's no
// ambient session to ride along with a forged cross-site request.

// Spread into every Response's headers object alongside 'Content-Type'.
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// Call first, before any other logic (auth, DB, method checks) — a preflight
// OPTIONS request should never reach those. Returns the 204 response to send
// back immediately, or null when this isn't a preflight (handle normally).
export function handleOptions(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}
