// Direct Mistral provider adapter — added 2026-09-14, the first provider
// added since the 2026-09-12 registry.mjs refactor (see that file's header
// comment for the "one new file + one registry entry + one MODELS entry"
// recipe this follows). Live-verified against a real MISTRAL_API_KEY before
// writing this file, not guessed from docs: docs.mistral.ai states the
// web_search/web_search_premium tools only work on the Conversations API
// (POST /v1/conversations), NOT the Chat Completions API
// (/v1/chat/completions) — "Chat Completions responses don't include the
// search result references that these tools return." Since every other
// provider branch in this codebase always attaches a search/grounding tool
// (see responsesShapeClient.mjs's header comment — "there is no 'ungrounded'
// call path anywhere in this codebase"), this adapter uses the Conversations
// API to match, not the more commonly-documented Chat Completions endpoint.
//
// Confirmed live response shape (two smoke-test calls, one trivial fact that
// skipped search, one real query that triggered it): `outputs` is an array
// of entries. A 'tool.execution' entry (present only when the model actually
// searched) carries raw search-engine results and is not needed for scoring
// — this app only cares about the model's own answer text and which sources
// it chose to cite. The 'message.output' entry's `content` is either a bare
// string (no search performed) or an array of chunks: `{type: 'text', text}`
// interleaved with `{type: 'tool_reference', tool: 'web_search', url, title,
// ...}` — citations are inlined mid-answer, not collected in one place the
// way Anthropic/Google do, hence the single pass below that both
// concatenates text and collects citations from the same chunk array.

import { parseErrorResponse } from './responsesShapeClient.mjs';

const MISTRAL_URL = 'https://api.mistral.ai/v1/conversations';

// Pure — see anthropic.mjs's parseResponse comment for the same "testable
// without a network call" rationale.
export function parseResponse(json) {
  const outputs = json.outputs || [];
  const textParts = [];
  const citations = [];
  const seen = new Set();
  for (const entry of outputs) {
    if (entry.type !== 'message.output') continue;
    const content = entry.content;
    // No web_search call was made (the model answered from its own
    // knowledge) — content is a bare string in that case, an array of
    // chunks otherwise.
    if (typeof content === 'string') {
      textParts.push(content);
      continue;
    }
    if (!Array.isArray(content)) continue;
    for (const chunk of content) {
      if (chunk.type === 'text' && typeof chunk.text === 'string') {
        textParts.push(chunk.text);
      } else if (chunk.type === 'tool_reference' && typeof chunk.url === 'string' && chunk.url) {
        if (seen.has(chunk.url)) continue;
        seen.add(chunk.url);
        citations.push({ url: chunk.url, title: typeof chunk.title === 'string' ? chunk.title : '' });
      }
    }
  }
  // Chunks are meant to be concatenated with no separator to reconstitute
  // the full answer — confirmed live: a text chunk routinely ends mid-word
  // or mid-sentence right before a tool_reference chunk and resumes exactly
  // where it left off in the next text chunk.
  const text = textParts.join('');
  const usage = json.usage ? { total_tokens: json.usage.total_tokens ?? 0 } : null;
  return { text, usage, citations };
}

export async function call(apiKey, modelId, prompt, signal) {
  const res = await fetch(MISTRAL_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelId,
      inputs: prompt,
      tools: [{ type: 'web_search' }],
    }),
    signal,
  });
  if (!res.ok) throw await parseErrorResponse(res, `mistral/${modelId}`);
  return parseResponse(await res.json());
}
