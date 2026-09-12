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
import { authenticate } from './_shared/auth.mts';
import { corsHeaders, handleOptions } from './_shared/cors.mts';
import { jsonResponse, errorResponse } from './_shared/http.mts';

declare const Netlify: { env: { get(key: string): string | undefined } };

export default async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const cors = corsHeaders(req);

  // Plain-text body here (not JSON, unlike every error below) is a
  // deliberate exception preserved from before this file's response-helper
  // migration — not something to "fix" as part of a mechanical pass.
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: cors });
  }

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  let body: { website?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400, {}, cors);
  }

  const website = (body.website || '').trim();
  if (!website) {
    return errorResponse('Missing website', 400, {}, cors);
  }

  const apiKey = Netlify.env.get('PERPLEXITY_API_KEY');
  if (!apiKey) {
    return errorResponse('Server misconfigured: PERPLEXITY_API_KEY not set', 500, {}, cors);
  }

  const normalizedWebsite = normalizeUrl(website);

  // 45s per-call ceiling — was 20s, which is too tight against this app's
  // own documented finding elsewhere (see CLAUDE.md / run-scan-background.mts)
  // that real Perplexity web_search-grounded calls routinely take 15-20s and
  // sometimes longer. At 20s, a call that would have succeeded at 25s instead
  // hits every field with an empty default, reading as "enrichment is
  // inaccurate" when it was actually just cut off. Enrichment's prompt also
  // asks for six researched fields (vs. a scan prompt's single answer), so if
  // anything it needs more headroom than a scan call, not less.
  const CALL_TIMEOUT_MS = 45000;

  try {
    // 3 attempts, matching run-scan-background.mts's retry budget — this is
    // a single standalone call (not one of a 20-call batch sharing a fixed
    // deadline), so the extra attempt only costs latency on this one form,
    // not scan-wide reliability. No shared scan-wide deadline to abort
    // against here, so no AbortSignal is passed.
    // openai/gpt-5-mini stays on the Perplexity gateway here deliberately
    // (NOT the new 2026-08-25 direct-API path — see aivis-core.mjs's
    // callModel comment): a real e2e test the same day measured a direct
    // OpenAI call at 30.5s, over whatever Netlify's synchronous-function
    // execution ceiling is for this site (no function-specific timeout
    // override exists in netlify.toml, so it's the platform default) --
    // it 502'd in production. This function is a regular synchronous
    // Netlify Function, not a Background Function, so it can't absorb that
    // latency the way run-scan-background.mts can. Only run-scan-background.mts
    // and proof-script use the direct path for this reason.
    const result = await callModelWithRetry({ perplexity: apiKey }, 'openai/gpt-5-mini', buildEnrichPrompt(normalizedWebsite), CALL_TIMEOUT_MS, 3);
    const fields = parseEnrichmentResponse(result.text);
    return jsonResponse({ ok: true, website: normalizedWebsite, ...fields }, { cors });
  } catch (err) {
    // Enrichment failing is never fatal — the caller falls back to a blank,
    // manually-filled form. Report why (200, not 500) so the UI can show a
    // reason instead of just silently doing nothing — but log the raw
    // error server-side and return a generic message to the client instead
    // of exposing internal detail (timeout durations, model names, HTTP
    // status bodies) in end-user-facing copy.
    console.error(`Enrichment failed for ${normalizedWebsite}: ${(err as Error).message}`);
    return jsonResponse({ ok: false, error: "Couldn't research that site right now — try again, or fill in the details below." }, { cors });
  }
};

export const config: Config = {
  path: '/enrich',
};
