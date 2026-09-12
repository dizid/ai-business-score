// Direct Google (Gemini) provider adapter — split out of aivis-core.mjs's
// callGoogleDirect/parseGoogleResponse (2026-09-12 architecture refactor).
// Live-verified 2026-08-15 against the generateContent endpoint with the
// google_search tool — see shared/CLAUDE.md's "Multi-provider model client"
// entry for the full migration story and the citation-URL caveat below;
// this file only moved, it did not change behavior.

import { parseErrorResponse } from './responsesShapeClient.mjs';

// Pure — see anthropic.mjs's parseResponse comment for the same "testable
// without a network call" rationale. Citation URLs here are Google's
// grounding-redirect links (vertexaisearch.cloud.google.com/...), not the
// real source URL — confirmed live: Gemini-sourced citations will never
// hostname-match a company's own domain the way Perplexity/Anthropic/xAI
// citations do (see aggregate.mjs's ownSiteCitations matching). A real,
// documented limitation, not a bug to silently paper over.
export function parseResponse(json) {
  const parts = json.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || '').join('\n');
  const chunks = json.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const citations = chunks
    .filter((c) => c?.web?.uri)
    .map((c) => ({ url: c.web.uri, title: c.web.title || '' }));
  const usage = json.usageMetadata ? { total_tokens: json.usageMetadata.totalTokenCount ?? 0 } : null;
  return { text, usage, citations };
}

export async function call(apiKey, modelId, prompt, signal) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
    }),
    signal,
  });
  if (!res.ok) throw await parseErrorResponse(res, `google/${modelId}`);
  return parseResponse(await res.json());
}
