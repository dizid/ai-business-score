// Milestone 0a spike — reads back the marker spike-trigger-background.mts
// writes. See that file for context. Throwaway, delete both after use.

import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';

export default async (req: Request) => {
  const store = getStore('spike');
  const status = await store.get('status', { type: 'json' });
  return new Response(JSON.stringify({ status: status ?? null }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config: Config = {
  path: '/spike-check',
};
