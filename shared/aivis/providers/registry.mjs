// The provider registry — added 2026-09-12 (architecture refactor) to
// replace client.mjs's old imperative if/switch dispatch. Adding a 5th
// provider going forward means: one new file exporting call() (see
// anthropic.mjs/google.mjs/xai.mjs/openai.mjs for the shape), one entry
// here, and one entry in MODELS below — down from editing ~6 scattered
// spots in what used to be one 1236-line file.
//
// PROVIDER_ADAPTERS preserves the real, asymmetric, load-bearing behavior
// from the 2026-08-15/2026-08-25 direct-provider migrations documented in
// shared/CLAUDE.md: anthropic/google/xai each REQUIRE their own key and
// throw a clear, attributable error if it's missing (no silent fallback);
// openai is the one exception — it falls through to the Perplexity gateway
// if apiKeys.openai isn't set, so every existing caller that hardcodes
// `{ perplexity: apiKey }` for 'openai/gpt-5-mini' keeps working unchanged.
// This asymmetry is intentional, not an oversight to "clean up" — flattening
// it would silently change behavior for callers with no openai key.
import { call as anthropicCall } from './anthropic.mjs';
import { call as googleCall } from './google.mjs';
import { call as xaiCall } from './xai.mjs';
import { call as openaiCall } from './openai.mjs';

export const PROVIDER_ADAPTERS = {
  anthropic: { call: anthropicCall, requireOwnKey: true, keyName: 'ANTHROPIC_API_KEY' },
  google: { call: googleCall, requireOwnKey: true, keyName: 'GOOGLE_API_KEY' },
  xai: { call: xaiCall, requireOwnKey: true, keyName: 'XAI_API_KEY' },
  openai: { call: openaiCall, requireOwnKey: false, keyName: 'OPENAI_API_KEY' },
};

// ---------- Models (4, cheap tier, live-verified) ----------
// Briefly grew to 6 on 2026-08-09 (4 unverified additions sourced from a web
// search of Perplexity's changelog, since docs.perplexity.ai itself was
// unreachable through this network's egress policy to smoke-test directly)
// — reverted same day after that combined with the 10-prompt expansion to
// push per-scan calls to 60, an untested load. 'openai/gpt-5-mini' and
// 'google/gemini-3-flash-preview' were the only two confirmed against a
// real Perplexity call at that point (see client.mjs's PPLX_URL comment —
// live smoke-tested 2026-07-28).
//
// 2026-08-13: grew from 2 to 4, this time smoke-tested one at a time before
// being trusted, per the discipline the 2026-08-09 revert established.
// 'anthropic/claude-haiku-4-5' and 'xai/grok-4.6' were both confirmed live
// against a real single-call smoke test first (a throwaway script, deleted
// after use). The Anthropic call initially failed outright — HTTP 400
// "max_output_tokens is required when using Anthropic models" — fixed by
// having anthropic.mjs send that field only for anthropic/* models.
//
// The SAME smoke-testing pass also found something much bigger than the
// model additions: Perplexity's real per-key concurrency limit is ~1, not
// the 4 this file's callers were already using. Bursts of 2-4 concurrent
// calls — even across different providers — failed 50-83% of the time with
// HTTP 429, while fully sequential (no overlap) calls succeeded 100%. That
// means the CONCURRENCY_LIMIT=4 shipped earlier the same day (itself a fix
// for an even worse CONCURRENCY_LIMIT=10 incident) was ALSO still silently
// dropping a large fraction of calls to 429 — see
// run-scan-background.mts's CONCURRENCY_LIMIT comment for the resulting
// fix (concurrency dropped to 1, i.e. fully sequential).
export const MODELS = [
  'openai/gpt-5-mini',
  'google/gemini-3-flash-preview',
  'anthropic/claude-haiku-4-5',
  'xai/grok-4.6',
];
