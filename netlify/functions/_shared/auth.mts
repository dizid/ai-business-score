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
