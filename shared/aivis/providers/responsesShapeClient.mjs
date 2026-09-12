// The OpenAI-Responses-API-compatible shape shared by three of this app's
// four providers: Perplexity's own gateway, xAI (confirmed live to be the
// *same* shape), and OpenAI itself (the shape's origin). Split out of
// aivis-core.mjs (2026-09-12 architecture refactor) — was named
// callPerplexityOrXai, which undersold what it actually is now that OpenAI
// also calls through it. anthropic.mjs and google.mjs have their own
// genuinely different response shapes and don't use this.

import { truncate } from '../../textUtils.mjs';

// Exported — every provider module (anthropic.mjs, google.mjs, and this
// file's own callResponsesShapeApi below) builds the same "HTTP error with
// an attached .status" shape, so they share one implementation instead of
// three copies that could quietly drift apart.
export async function parseErrorResponse(res, model) {
  const body = await res.text().catch(() => '');
  const err = new Error(`HTTP ${res.status} from ${model}: ${truncate(body, 300)}`);
  // Attached so callModelWithRetry can back off harder specifically on 429
  // (rate limit) instead of treating it the same as any other failure.
  err.status = res.status;
  return err;
}

// Defensive extraction: try the confirmed-live OpenAI-Responses-API shape
// first, then chat-completions-style as a fallback, then fail loudly rather
// than silently returning garbage into a cold email or a public result page.
export function extractText(json) {
  if (typeof json.output_text === 'string') return json.output_text;
  if (Array.isArray(json.output)) {
    const chunks = [];
    for (const item of json.output) {
      if (Array.isArray(item.content)) {
        for (const c of item.content) {
          if (typeof c.text === 'string') chunks.push(c.text);
        }
      }
    }
    if (chunks.length) return chunks.join('\n');
  }
  if (json.choices?.[0]?.message?.content) return json.choices[0].message.content;
  throw new Error(`Could not extract text from response — unexpected shape: ${JSON.stringify(json).slice(0, 300)}`);
}

// Citation-URL attribution (PLAN_NEXT_PHASE.md Milestone F). Perplexity's
// `/v1/responses` payload carries source citations as `url_citation`
// annotations on each MessageOutputItem's content parts — confirmed against
// the live OpenAPI schema at https://docs.perplexity.ai/api-reference/agent-post
// (ContentPart.annotations[], Annotation.type === 'url_citation', with
// `url`/`title`), not guessed. Same traversal shape extractText already
// walks (json.output[].content[]), just reading `annotations` instead of
// `text`. Unlike extractText, a response with no citations is normal (not
// every grounded answer cites a source) — returns [] rather than throwing.
export function extractCitations(json) {
  if (!Array.isArray(json.output)) return [];
  const seen = new Set();
  const citations = [];
  for (const item of json.output) {
    if (!Array.isArray(item.content)) continue;
    for (const c of item.content) {
      if (!Array.isArray(c.annotations)) continue;
      for (const a of c.annotations) {
        if (a?.type !== 'url_citation' || typeof a.url !== 'string' || !a.url) continue;
        if (seen.has(a.url)) continue;
        seen.add(a.url);
        citations.push({ url: a.url, title: typeof a.title === 'string' ? a.title : '' });
      }
    }
  }
  return citations;
}

// Shared by Perplexity's gateway, xai.mjs, and openai.mjs — same request/
// response shape across all three (confirmed live for xai/openai during the
// 2026-08-15/08-25 direct-provider migrations, see shared/CLAUDE.md).
export async function callResponsesShapeApi(url, apiKey, model, prompt, signal, extraBody) {
  const requestBody = { model, input: prompt, tools: [{ type: 'web_search' }], ...extraBody };
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal,
  });
  if (!res.ok) throw await parseErrorResponse(res, model);
  const json = await res.json();
  return { text: extractText(json), usage: json.usage ?? null, citations: extractCitations(json) };
}
