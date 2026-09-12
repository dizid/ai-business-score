// Verifies Neon Auth (Better Auth) JWT bearer tokens for Netlify Functions.
// Neon Auth issues short-lived JWTs (POST {base_url}/token, `sub` = user id)
// verifiable against its JWKS endpoint with no DB round-trip. This module is
// a Netlify-Functions-only concern — it does not touch shared/aivis-core.mjs.
import { createRemoteJWKSet, jwtVerify } from 'jose';

declare const Netlify: { env: { get(key: string): string | undefined } };

export class AuthError extends Error {}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (jwks) return jwks;
  const jwksUrl = Netlify.env.get('NEON_AUTH_JWKS_URL');
  if (!jwksUrl) {
    throw new Error('Server misconfigured: NEON_AUTH_JWKS_URL not set');
  }
  jwks = createRemoteJWKSet(new URL(jwksUrl));
  return jwks;
}

// Returns the authenticated user's id (the JWT's `sub` claim), or throws
// AuthError if the request has no valid bearer token.
export async function requireAuth(req: Request): Promise<string> {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new AuthError('Missing or malformed Authorization header');
  }

  let sub: string | undefined;
  try {
    const { payload } = await jwtVerify(match[1], getJwks());
    sub = typeof payload.sub === 'string' ? payload.sub : undefined;
  } catch (err) {
    throw new AuthError(`Invalid or expired token: ${(err as Error).message}`);
  }

  if (!sub) {
    throw new AuthError('Token missing subject claim');
  }
  return sub;
}

export function authErrorResponse(err: unknown): Response {
  const message = err instanceof AuthError ? err.message : 'Unauthorized';
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Added 2026-09-12 (architecture refactor) to collapse the
// `requireAuth`-then-catch-`AuthError` block that had been copy-pasted
// verbatim into 10 function files. Deliberately a plain function returning
// `string | Response` rather than a `withAuth(handler)` HOC — the 10 real
// call sites don't agree on a single method-check/auth/ownership ordering
// (company.mts checks method then auth then row ownership;
// create-checkout-session.mts checks method then auth then plan state), so
// a wrapper would either have to become configurable (defeating the
// simplification) or silently change one of those orderings. This preserves
// each caller's own explicit control flow with a 3-line replacement for the
// old 6-line block:
//
//   const auth = await authenticate(req);
//   if (auth instanceof Response) return auth;
//   const userId = auth;
//
// `requireAuth`/`authErrorResponse`/`AuthError` stay exported and unchanged
// — still used here, and still independently useful/testable.
export async function authenticate(req: Request): Promise<string | Response> {
  try {
    return await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }
}
