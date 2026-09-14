// Regression coverage for the 2026-09-12 provider-registry rewrite
// (shared/aivis/providers/registry.mjs + client.mjs replacing the old
// imperative switch in callModel). Network is mocked at the global fetch
// boundary, same pattern as tests/aivis-core.test.mjs's callModelWithRetry
// suite, so the real dispatch/request-construction logic actually runs.
//
// The regression that matters most here: anthropic/google/xai must NOT
// silently fall through to the Perplexity gateway when their own key is
// missing (openai is the one deliberate exception) — a registry rewrite
// that accidentally flattened that asymmetry would still pass every other
// test in this suite but would change real production behavior (a missing
// ANTHROPIC_API_KEY would silently route through Perplexity instead of
// failing loudly), so it gets its own explicit test per provider.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callModel } from '../shared/aivis-core.mjs';

function mockFetchResponse(jsonBody) {
  return { ok: true, status: 200, json: async () => jsonBody, text: async () => '' };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('callModel — per-provider request shape', () => {
  it('sends the anthropic request to ANTHROPIC_URL with x-api-key and the web-search tool', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse({ content: [{ type: 'text', text: 'hi' }] }));
    vi.stubGlobal('fetch', fetchMock);
    await callModel({ anthropic: 'test-key' }, 'anthropic/claude-haiku-4-5', 'prompt');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(options.headers['x-api-key']).toBe('test-key');
    const body = JSON.parse(options.body);
    expect(body.model).toBe('claude-haiku-4-5');
    expect(body.max_tokens).toBe(2048);
    expect(body.tools[0].type).toBe('web_search_20250305');
  });

  it('sends the google request to the generateContent endpoint with a key query param and the google_search tool', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] }));
    vi.stubGlobal('fetch', fetchMock);
    await callModel({ google: 'test-key' }, 'google/gemini-3-flash-preview', 'prompt');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain(':generateContent?key=test-key');
    const body = JSON.parse(options.body);
    expect(body.tools[0]).toEqual({ google_search: {} });
  });

  it('sends the xai request to XAI_URL in the shared Responses-API shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse({ output_text: 'hi' }));
    vi.stubGlobal('fetch', fetchMock);
    await callModel({ xai: 'test-key' }, 'xai/grok-4.6', 'prompt');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.x.ai/v1/responses');
    expect(options.headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(options.body);
    expect(body.model).toBe('grok-4.6');
    expect(body.tools[0]).toEqual({ type: 'web_search' });
  });

  it('sends the openai request to OPENAI_URL when apiKeys.openai is configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse({ output_text: 'hi' }));
    vi.stubGlobal('fetch', fetchMock);
    await callModel({ openai: 'test-key' }, 'openai/gpt-5-mini', 'prompt');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(options.headers.Authorization).toBe('Bearer test-key');
  });

  it('sends the mistral request to the Conversations API with inputs (not messages) and the web_search tool', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse({ outputs: [{ type: 'message.output', content: 'hi' }] }));
    vi.stubGlobal('fetch', fetchMock);
    await callModel({ mistral: 'test-key' }, 'mistral/mistral-small-latest', 'prompt');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.mistral.ai/v1/conversations');
    expect(options.headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(options.body);
    expect(body.model).toBe('mistral-small-latest');
    expect(body.inputs).toBe('prompt');
    expect(body.tools[0]).toEqual({ type: 'web_search' });
  });

  it('parses a real mistral response shape — concatenates text chunks and dedupes tool_reference citations', async () => {
    // Trimmed down from an actual captured 2026-09-14 live response: a
    // 'tool.execution' entry (search-engine raw results, ignored — this app
    // only needs the model's own answer + which sources it cited) followed
    // by a 'message.output' entry whose content interleaves text chunks
    // with tool_reference citation chunks, including a repeated URL.
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse({
      outputs: [
        { type: 'tool.execution', name: 'web_search', info: { result: '{}' } },
        {
          type: 'message.output',
          content: [
            { type: 'text', text: 'Otterly.AI is affordable' },
            { type: 'tool_reference', tool: 'web_search', url: 'https://example.com/a', title: 'A' },
            { type: 'text', text: '. Peec AI is too' },
            { type: 'tool_reference', tool: 'web_search', url: 'https://example.com/a', title: 'A' },
          ],
        },
      ],
      usage: { total_tokens: 500 },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await callModel({ mistral: 'test-key' }, 'mistral/mistral-small-latest', 'prompt');
    expect(result.text).toBe('Otterly.AI is affordable. Peec AI is too');
    expect(result.citations).toEqual([{ url: 'https://example.com/a', title: 'A' }]);
    expect(result.usage).toEqual({ total_tokens: 500 });
  });
});

describe('callModel — fallback and missing-key behavior (the registry-rewrite regression surface)', () => {
  it('falls back openai/* to the Perplexity gateway when apiKeys.openai is not set', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse({ output_text: 'hi' }));
    vi.stubGlobal('fetch', fetchMock);
    await callModel({ perplexity: 'pplx-key' }, 'openai/gpt-5-mini', 'prompt');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.perplexity.ai/v1/responses');
    const body = JSON.parse(options.body);
    // Gateway calls pass the full "provider/model" string through unchanged
    // (unlike direct-provider calls, which strip the prefix).
    expect(body.model).toBe('openai/gpt-5-mini');
  });

  it('falls back an unmapped provider to the Perplexity gateway, passing the full model string through', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse({ output_text: 'hi' }));
    vi.stubGlobal('fetch', fetchMock);
    await callModel({ perplexity: 'pplx-key' }, 'somefutureprovider/model-x', 'prompt');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.perplexity.ai/v1/responses');
    expect(JSON.parse(options.body).model).toBe('somefutureprovider/model-x');
  });

  it('does NOT fall back anthropic/* to the gateway when ANTHROPIC_API_KEY is missing, even if perplexity is configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(callModel({ perplexity: 'pplx-key' }, 'anthropic/claude-haiku-4-5', 'prompt')).rejects.toThrow(
      'No ANTHROPIC_API_KEY configured for direct call to anthropic/claude-haiku-4-5'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does NOT fall back google/* to the gateway when GOOGLE_API_KEY is missing, even if perplexity is configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(callModel({ perplexity: 'pplx-key' }, 'google/gemini-3-flash-preview', 'prompt')).rejects.toThrow(
      'No GOOGLE_API_KEY configured for direct call to google/gemini-3-flash-preview'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does NOT fall back xai/* to the gateway when XAI_API_KEY is missing, even if perplexity is configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(callModel({ perplexity: 'pplx-key' }, 'xai/grok-4.6', 'prompt')).rejects.toThrow(
      'No XAI_API_KEY configured for direct call to xai/grok-4.6'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does NOT fall back mistral/* to the gateway when MISTRAL_API_KEY is missing, even if perplexity is configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(callModel({ perplexity: 'pplx-key' }, 'mistral/mistral-small-latest', 'prompt')).rejects.toThrow(
      'No MISTRAL_API_KEY configured for direct call to mistral/mistral-small-latest'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws a clear error when no provider key and no perplexity fallback key are configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(callModel({}, 'openai/gpt-5-mini', 'prompt')).rejects.toThrow(
      'No PERPLEXITY_API_KEY configured for gateway call to openai/gpt-5-mini'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
