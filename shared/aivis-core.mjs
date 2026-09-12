// Shared AIVis detection + Perplexity API logic — used by both the local
// proof-script (proof-script/index.mjs) and the hosted scan function
// (web/netlify/functions/scan.mjs). Keep this the single source of truth for
// prompt templates, models, brand-detection, and the API call — the two
// callers differ only in orchestration (batch CLI vs. single web request).
//
// 2026-09-12: split into shared/aivis/* submodules (architecture refactor —
// this file had grown to 1200+ lines mixing 6+ distinct domains with no
// internal boundaries: prompt templates, provider transport, aggregation,
// scoring, advice, and four separate prompt-builder/parser pairs). This
// file is now a pure re-exporting facade: every one of its original 36
// exports is re-exported unchanged below, under its original name, so
// existing consumers (proof-script's plain `node index.mjs`, Netlify
// functions, the Vue app — roughly 20 files) need zero changes. See
// shared/CLAUDE.md for the full module map and shared/aivis/*'s own header
// comments for what moved where and why. New code should prefer importing
// directly from shared/aivis/* submodules; this facade exists purely for
// backward compatibility — don't add new exports here.
export {
  PROMPT_TEMPLATES,
  SUPPORTED_LANGUAGES,
  PROMPT_TEMPLATES_BY_LANGUAGE,
  promptTemplatesForLanguage,
  PROMPT_CATEGORIES,
  PROMPT_LABELS,
} from './aivis/prompts.mjs';
export {
  isAmbiguousBrandName,
  normalizeUrl,
  hostnameOf,
  domainAlias,
  findMentions,
  findBrandMention,
} from './aivis/brand.mjs';
export { extractText, extractCitations } from './aivis/providers/responsesShapeClient.mjs';
export { parseResponse as parseAnthropicResponse } from './aivis/providers/anthropic.mjs';
export { parseResponse as parseGoogleResponse } from './aivis/providers/google.mjs';
export { MODELS } from './aivis/providers/registry.mjs';
export { callModel, callModelWithRetry, runWithConcurrency } from './aivis/providers/client.mjs';
export { aggregateProspect } from './aivis/aggregate.mjs';
export { DEFAULT_QUERY_WEIGHTS, computeScore, scoreBand } from './aivis/score.mjs';
export { selectAdvice, findCompetitorExcerpt } from './aivis/advice.mjs';
export { buildEnrichPrompt, parseEnrichmentResponse } from './aivis/enrichment.mjs';
export { buildDeepAdvicePrompt, parseDeepAdviceResponse } from './aivis/deepAdvice.mjs';
export { buildSentimentJudgePrompt, parseSentimentJudgeResponse } from './aivis/sentimentJudge.mjs';
export { buildClarityCheckPrompt, parseClarityCheckResponse } from './aivis/clarityCheck.mjs';
export { requiredProspectFields, missingProspectFields } from './aivis/prospectFields.mjs';
