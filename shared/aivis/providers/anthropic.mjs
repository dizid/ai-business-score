// Direct Anthropic provider adapter — split out of aivis-core.mjs's
// callAnthropicDirect/parseAnthropicResponse (2026-09-12 architecture
// refactor). Live-verified 2026-08-15 against api.anthropic.com/v1/messages
// with the web_search_20250305 tool — see shared/CLAUDE.md's "Multi-provider
// model client" entry for the full migration story; this file only moved,
// it did not change behavior.

import { parseErrorResponse } from './responsesShapeClient.mjs';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// Pure — no fetch, easy to unit-test against a canned JSON fixture built
// from a real captured response (2026-08-15 live verification), unlike the
// async call() below which actually hits the network.
export function parseResponse(json) {
  const textBlocks = (json.content || []).filter((b) => b.type === 'text');
  const text = textBlocks.map((b) => b.text).join('\n');
  const citations = [];
  const seen = new Set();
  for (const b of textBlocks) {
    for (const c of b.citations || []) {
      if (c?.type !== 'web_search_result_location' || !c.url || seen.has(c.url)) continue;
      seen.add(c.url);
      citations.push({ url: c.url, title: c.title || '' });
    }
  }
  // Anthropic has no single total_tokens field like Perplexity/xAI/Google —
  // input_tokens + output_tokens is the live-confirmed equivalent.
  const usage = json.usage
    ? { total_tokens: (json.usage.input_tokens ?? 0) + (json.usage.output_tokens ?? 0) }
    : null;
  return { text, usage, citations };
}

export async function call(apiKey, modelId, prompt, signal) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
    }),
    signal,
  });
  if (!res.ok) throw await parseErrorResponse(res, `anthropic/${modelId}`);
  return parseResponse(await res.json());
}
