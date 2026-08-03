// AIVis scan history — lists every scan /scan has ever persisted to the
// "aivis-scans" Netlify Blobs store, newest first. This is what makes past
// scans durable: the URL-fragment link from /scan still works standalone
// (no DB read needed to view a single result), but this endpoint is the
// only way to see everything that's been run without having kept every link.
//
// POST-only with the passphrase in the JSON body (not a query string) —
// same anti-abuse gate as /scan and /enrich, but a query param would land
// in Netlify's function access logs and the browser's history/referrer in
// plaintext, unlike a POST body.

import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';

declare const Netlify: { env: { get(key: string): string | undefined } };

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { passphrase?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const passphrase = body.passphrase || '';
  const expectedPassphrase = Netlify.env.get('SCAN_PASSPHRASE');
  if (!expectedPassphrase || passphrase !== expectedPassphrase) {
    return new Response(JSON.stringify({ error: 'Forbidden — wrong or missing passphrase' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const store = getStore('aivis-scans');
  const { blobs } = await store.list();

  const scans = await Promise.all(
    blobs.map(({ key }) => store.get(key, { type: 'json' }))
  );

  // Newest first — generatedAt is an ISO string, so plain string comparison
  // sorts chronologically.
  scans.sort((a: any, b: any) => (b?.generatedAt || '').localeCompare(a?.generatedAt || ''));

  return new Response(JSON.stringify({ ok: true, scans }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config: Config = {
  path: '/history',
};
