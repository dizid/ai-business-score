// AIVis enrichment — best-effort auto-fill for the scan form. Takes just a
// website URL, makes one Perplexity web_search call to research the
// business, and returns guessed values for the rest of the scan form's
// fields (brand, category, use_case, region, customer_segment,
// competitors). Deliberately best-effort and non-blocking: any field the
// model can't confidently infer comes back empty, and the founder can
// always edit the pre-filled form or skip straight to filling it by hand
// (see index.html) — this removes typing, it never removes control.
//
// Gated by the same SCAN_PASSPHRASE as /scan since it also costs real money
// per call (one web_search-grounded Perplexity call).

import type { Config } from '@netlify/functions';
import { callModel, buildEnrichPrompt, parseEnrichmentResponse, normalizeUrl } from '../../shared/aivis-core.mjs';

declare const Netlify: { env: { get(key: string): string | undefined } };

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body: { website?: string; passphrase?: string };
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

  const website = (body.website || '').trim();
  if (!website) {
    return new Response(JSON.stringify({ error: 'Missing website' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = Netlify.env.get('PERPLEXITY_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured: PERPLEXITY_API_KEY not set' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const normalizedWebsite = normalizeUrl(website);

  // Same 20s per-call ceiling as /scan's individual calls — this is a single
  // web_search-grounded call, not six in parallel, so it typically finishes
  // faster than a full scan even at the same timeout.
  const CALL_TIMEOUT_MS = 20000;

  try {
    const result = await callModel(apiKey, 'openai/gpt-5-mini', buildEnrichPrompt(normalizedWebsite), CALL_TIMEOUT_MS);
    const fields = parseEnrichmentResponse(result.text);
    return new Response(JSON.stringify({ ok: true, website: normalizedWebsite, ...fields }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // Enrichment failing is never fatal — the caller falls back to a blank,
    // manually-filled form. Report why (200, not 500) so the UI can show the
    // reason instead of just silently doing nothing.
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config: Config = {
  path: '/enrich',
};
