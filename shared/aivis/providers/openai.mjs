// Direct OpenAI provider adapter — split out of aivis-core.mjs (2026-09-12
// architecture refactor). Added 2026-08-25, written to mirror xai.mjs
// exactly (xai's endpoint was already confirmed to be "the same
// OpenAI-Responses-API-compatible shape," implying OpenAI's own
// /v1/responses is the shape's origin). Live-verified 2026-08-25 against a
// real OPENAI_API_KEY — see shared/CLAUDE.md's "Multi-provider model
// client" entry for the full story, INCLUDING the real 30.5s-per-call
// latency finding that keeps this provider deliberately out of
// run-scan-background.mts's HOSTED_MODELS (still called directly by
// proof-script and run-scan-background.mts's own clarity-check/sentiment-
// judge calls, which hardcode 'openai/gpt-5-mini' independent of
// HOSTED_MODELS — see that entry for why). This file only moved the call
// logic; the latency/timeout decisions documented there are unchanged.

import { callResponsesShapeApi } from './responsesShapeClient.mjs';

const OPENAI_URL = 'https://api.openai.com/v1/responses';

export async function call(apiKey, modelId, prompt, signal) {
  return callResponsesShapeApi(OPENAI_URL, apiKey, modelId, prompt, signal);
}
