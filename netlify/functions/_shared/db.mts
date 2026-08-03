// Shared Neon Postgres client for Netlify Functions. Uses the HTTP-fetch-based
// driver (not a pooled TCP client like `pg`) because each function invocation
// is an isolated, possibly-cold-started process — no long-lived pool to share.
import { neon } from '@neondatabase/serverless';

declare const Netlify: { env: { get(key: string): string | undefined } };

let cachedSql: ReturnType<typeof neon> | null = null;

export function sql() {
  if (cachedSql) return cachedSql;
  const databaseUrl = Netlify.env.get('DATABASE_URL');
  if (!databaseUrl) {
    throw new Error('Server misconfigured: DATABASE_URL not set');
  }
  cachedSql = neon(databaseUrl);
  return cachedSql;
}
