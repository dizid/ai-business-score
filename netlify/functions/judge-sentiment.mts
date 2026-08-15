// On-demand sentiment judge — PLAN_NEXT_PHASE.md Milestone F item 2.
// Triggered by a "Judge sentiment" button on one specific check in
// ScanDetail.vue's check-by-check breakdown (not automatic — see
// aivis-core.mjs's buildSentimentJudgePrompt comment for why: a second LLM
// call per judged check is real added cost/latency on top of an
// already-tight scan pipeline, so this stays opt-in and per-check rather
// than baked into every scan). Mirrors generate-deep-advice.mts's shape
// exactly (auth, ownership check, one callModel call, persist, return the
// updated payload) — same pattern, different target field.
import type { Config, Context } from '@netlify/functions';
import { callModel, buildSentimentJudgePrompt, parseSentimentJudgeResponse } from '../../shared/aivis-core.mjs';
import { requireAuth, authErrorResponse, AuthError } from './_shared/auth.mts';
import { sql } from './_shared/db.mts';
import { toScanPayload } from './_shared/scanRow.mts';
import { corsHeaders, handleOptions } from './_shared/cors.mts';

declare const Netlify: { env: { get(key: string): string | undefined } };

export default async (req: Request, context: Context) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  let userId: string;
  try {
    userId = await requireAuth(req);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }

  let body: { promptIndex?: number; model?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }
  const { promptIndex, model } = body;
  if (typeof promptIndex !== 'number' || typeof model !== 'string' || !model) {
    return new Response(JSON.stringify({ error: 'promptIndex (number) and model (string) are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  const scanId = context.params.id;
  const db = sql();

  const rows = await db`
    SELECT scans.* FROM public.scans
    JOIN public.companies ON companies.id = scans.company_id
    WHERE scans.id = ${scanId} AND companies.owner_user_id = ${userId}
  `;
  if (rows.length === 0) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }
  const scanRow = rows[0];
  if (scanRow.status !== 'completed') {
    return new Response(JSON.stringify({ error: 'Scan is not completed yet' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  const rawResponses: { promptIndex: number; model: string; text: string }[] = scanRow.raw_responses || [];
  const target = rawResponses.find((r) => r.promptIndex === promptIndex && r.model === model);
  if (!target) {
    return new Response(JSON.stringify({ error: 'No matching check found on this scan' }), {
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

  try {
    const prompt = buildSentimentJudgePrompt(scanRow.brand, target.text);
    // openai/gpt-5-mini has no direct key available (see aivis-core.mjs's
    // callModel comment) — still routed through the Perplexity gateway.
    const result = await callModel({ perplexity: apiKey }, 'openai/gpt-5-mini', prompt, 20000);
    const judgment = parseSentimentJudgeResponse(result.text);

    // Upsert by (promptIndex, model) into the existing array rather than
    // always appending, so re-judging a check (or a retry after a
    // malformed-parse fallback) replaces the old entry instead of
    // duplicating it.
    const existing: { promptIndex: number; model: string; classification: string; reasoning: string }[] =
      scanRow.sentiment_judgments || [];
    const next = [
      ...existing.filter((j) => !(j.promptIndex === promptIndex && j.model === model)),
      { promptIndex, model, classification: judgment.classification, reasoning: judgment.reasoning },
    ];

    const updated = await db`
      UPDATE public.scans SET sentiment_judgments = ${JSON.stringify(next)}
      WHERE id = ${scanId}
      RETURNING *
    `;
    return new Response(JSON.stringify({ ok: true, scan: toScanPayload(updated[0]) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }
};

export const config: Config = {
  path: '/scans/:id/judge-sentiment',
};
