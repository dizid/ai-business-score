// Milestone 1 verification (SaaS-pivot plan): confirms the deployed function
// can reach the new Neon database. Temporary — delete once Milestone 1 is
// confirmed working in production; superseded by real endpoints from
// Milestone 2 onward.
import type { Config } from '@netlify/functions';
import { sql } from './_shared/db.mts';

export default async (req: Request) => {
  const db = sql();
  const rows = await db`SELECT count(*)::int AS count FROM public.companies`;
  return new Response(JSON.stringify({ companies: rows[0].count }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config: Config = {
  path: '/db-health',
};
