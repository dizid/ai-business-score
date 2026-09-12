// Direct xAI (Grok) provider adapter — split out of aivis-core.mjs
// (2026-09-12 architecture refactor). xAI's /v1/responses was confirmed
// live 2026-08-15 to be the *same* OpenAI-Responses-API-compatible shape
// Perplexity's own gateway already used, so this is a thin wrapper around
// the shared client rather than its own request/parse logic — unlike
// anthropic.mjs/google.mjs, which each have a genuinely different response
// shape. Noticeably slower than Anthropic/Google in live testing — 30-50s+
// per call observed (Grok's agentic multi-round web search), see
// shared/CLAUDE.md's CALL_TIMEOUT_MS_BY_MODEL note in
// netlify/functions/CLAUDE.md for the resulting per-model timeout.

import { callResponsesShapeApi } from './responsesShapeClient.mjs';

const XAI_URL = 'https://api.x.ai/v1/responses';

export async function call(apiKey, modelId, prompt, signal) {
  return callResponsesShapeApi(XAI_URL, apiKey, modelId, prompt, signal);
}
