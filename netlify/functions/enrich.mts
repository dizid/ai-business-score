// AIVis enrichment — best-effort auto-fill for the scan form. Takes just a
// website URL, makes one Perplexity web_search call to research the
// business, and returns guessed values for the rest of the scan form's
// fields (brand, category, use_case, region, customer_segment,
// competitors). Deliberately best-effort and non-blocking: any field the
// model can't confidently infer comes back empty, and the founder can
// always edit the pre-filled form or skip straight to filling it by hand
// (see index.html) — this removes typing, it never removes control.
//
// Gated by Neon Auth (Milestone 2 of the SaaS-pivot plan) since it also
// costs real money per call (one web_search-grounded Perplexity call) —
// previously a shared SCAN_PASSPHRASE, now any authenticated user.

import type { Config } from '@netlify/functions';
import { callModelWithRetry, buildEnrichPrompt, parseEnrichmentResponse, normalizeUrl } from '../../shared/aivis-core.mjs';
import { requireAuth, authErrorResponse, AuthError } from './_shared/auth.mts';
import { corsHeaders, handleOptions } from './_shared/cors.mts';

declare const Netlify: { env: { get(key: string): string | undefined } };

export default async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders(req) });
  }

  try {
    await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }

  let body: { website?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  const website = (body.website || '').trim();
  if (!website) {
    return new Response(JSON.stringify({ error: 'Missing website' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  const apiKey = Netlify.env.get('PERPLEXITY_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured: PERPLEXITY_API_KEY not set' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  const normalizedWebsite = normalizeUrl(website);

  // Same 20s per-call ceiling as /scan's individual calls — this is a single
  // web_search-grounded call, not six in parallel, so it typically finishes
  // faster than a full scan even at the same timeout.
  const CALL_TIMEOUT_MS = 20000;

  try {
    // 2 attempts, same as run-scan-background.mts's calls — one transient
    // timeout/rate-limit blip shouldn't immediately read as "Couldn't
    // auto-fill." No shared scan-wide deadline to abort against here (this
    // is a single standalone call, not a batch), so no AbortSignal is passed.
    const result = await callModelWithRetry(apiKey, 'openai/gpt-5-mini', buildEnrichPrompt(normalizedWebsite), CALL_TIMEOUT_MS, 2);
    const fields = parseEnrichmentResponse(result.text);
    return new Response(JSON.stringify({ ok: true, website: normalizedWebsite, ...fields }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  } catch (err) {
    // Enrichment failing is never fatal — the caller falls back to a blank,
    // manually-filled form. Report why (200, not 500) so the UI can show the
    // reason instead of just silently doing nothing.
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }
};

export const config: Config = {
  path: '/enrich',
};
