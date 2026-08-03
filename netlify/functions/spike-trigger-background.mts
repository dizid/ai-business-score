// Milestone 0a spike (SaaS-pivot plan, /home/marc/.claude/plans/cheerful-leaping-dragon.md):
// proves whether Netlify Background Functions actually keep running past the
// HTTP response on this site's plan (nf_team_dev), or whether the invocation
// is killed the moment a response is returned. The `-background` filename
// suffix is Netlify's required naming convention for this function type.
//
// Throwaway — delete this file and spike-check.mts once the verdict is known.

import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';

export default async (req: Request) => {
  const startedAt = new Date().toISOString();
  const store = getStore('spike');
  await store.setJSON('status', { phase: 'started', startedAt });

  // Simulate the slow part of a real scan continuing after Netlify would
  // otherwise have already sent a response for a normal (non-background)
  // function.
  await new Promise((resolve) => setTimeout(resolve, 5000));

  await store.setJSON('status', {
    phase: 'finished',
    startedAt,
    finishedAt: new Date().toISOString(),
  });

  return new Response('ok');
};

export const config: Config = {
  path: '/spike-trigger',
};
