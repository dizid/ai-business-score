// Prompt templates (EN + NL), model-category weighting metadata, and
// human-readable prompt labels — split out of aivis-core.mjs (2026-09-12
// architecture refactor) as the "what do we ask the AI" domain, distinct
// from "how do we call the AI" (providers/) and "how do we score/advise on
// the answer" (score.mjs/advice.mjs). See shared/aivis-core.mjs's own header
// comment for why this split exists and shared/CLAUDE.md for this content's
// product history — nothing here changed behavior, only location.

// A `category` string is free-typed by the founder (or auto-inferred) and
// isn't guaranteed to read as a clean noun phrase — e.g. "Sport, boxing".
// Splicing that straight into "What's the best {category} for..." produces
// a grammatically broken prompt that confuses the model into asking a
// clarifying question instead of answering (observed live 2026-08-09 with
// category "Sport, boxing" → gpt-5-mini got stuck on "do you mean 'is
// boxing the best sport'?"). Normalizing comma/slash-joined categories into
// a single " / "-joined phrase keeps templates 0 and 2 grammatical either way.
function normalizeCategory(category) {
  return category.split(/[,/]+/).map((s) => s.trim()).filter(Boolean).join(' / ');
}

// `competitors` can legitimately be empty — buildEnrichPrompt below tells the
// auto-fill model to leave it empty rather than guess. Without this fallback,
// competitor-comparison templates would substitute the literal string
// "undefined" into a live prompt sent to the AI. Mirrors the templates' own
// existing "reuse competitors[0] for the second slot" behavior when only one
// competitor is known.
const NO_COMPETITOR_FALLBACK = 'other well-known alternatives';
function competitorAt(p, index) {
  return p.competitors[index] || p.competitors[0] || NO_COMPETITOR_FALLBACK;
}

// ---------- Prompts (10, generic — brand/competitor substitution only) ----------
// Vertical-adjusted templating explicitly deferred, see TODOS.md. Grew from
// 8 to 10 on 2026-08-09 (added 8/9 below) after the hosted site's original
// 3-prompt subset (0-2, the most generically-worded of the set) read as too
// narrow/generic to a live user — rather than rewriting 0-2, the fix is to
// widen the query-intent variety (criteria-based, switcher-intent) and have
// the hosted site run the full set like proof-script always has (see
// run-scan-background.mts).
export const PROMPT_TEMPLATES = [
  (p) => `What's the best ${normalizeCategory(p.category)} option for ${p.use_case}?`,
  (p) => `Compare ${p.brand} vs ${competitorAt(p, 0)} vs ${competitorAt(p, 1)}.`,
  (p) => `I need a good ${normalizeCategory(p.category)} option — what do you recommend and why?`,
  (p) => `Top ${p.category} companies in ${p.region}?`,
  (p) => `Is ${p.brand} a good choice for ${p.use_case}? What are the alternatives?`,
  (p) => `What are people saying about ${p.brand} vs ${competitorAt(p, 0)}?`,
  (p) => `Best ${p.category} for ${p.customer_segment}?`,
  (p) => `Who are the leaders in ${p.category}?`,
  (p) => `What should I look for when choosing a ${normalizeCategory(p.category)}, and which brands do that well?`,
  (p) => `I'm looking to switch away from ${competitorAt(p, 0)} — what's a good ${normalizeCategory(p.category)} alternative?`,
];

// Dutch translation of the same 10 templates, same parameterization, same
// slot-for-slot semantics (index 0 is still "category-recommendation query"
// in either language — PROMPT_CATEGORIES/PROMPT_LABELS below describe the
// SLOT, not the language, and stay unchanged regardless of which set runs).
// First-pass translation, not yet reviewed by a native speaker — flagged in
// PLAN_NEXT_PHASE.md as a real gate before this is trusted the way the
// English set already is: these become live grounded search queries sent to
// production AI models, so "translated" isn't the same as "shippable"
// without that review.
const PROMPT_TEMPLATES_NL = [
  (p) => `Wat is de beste optie op het gebied van ${normalizeCategory(p.category)} voor ${p.use_case}?`,
  (p) => `Vergelijk ${p.brand} met ${competitorAt(p, 0)} en ${competitorAt(p, 1)}.`,
  (p) => `Ik zoek een goede optie op het gebied van ${normalizeCategory(p.category)} — wat raad je aan en waarom?`,
  (p) => `Wat zijn toonaangevende ${p.category}-bedrijven in ${p.region}?`,
  (p) => `Is ${p.brand} een goede keuze voor ${p.use_case}? Wat zijn de alternatieven?`,
  (p) => `Wat wordt er gezegd over ${p.brand} in vergelijking met ${competitorAt(p, 0)}?`,
  (p) => `Wat is de beste ${p.category} voor ${p.customer_segment}?`,
  (p) => `Wie zijn de marktleiders op het gebied van ${p.category}?`,
  (p) => `Waar moet ik op letten bij het kiezen van een ${normalizeCategory(p.category)}, en welke merken doen dat goed?`,
  (p) => `Ik wil overstappen van ${competitorAt(p, 0)} — wat is een goed alternatief op het gebied van ${normalizeCategory(p.category)}?`,
];

// Language support is deliberately a curated, reviewed set (not live/dynamic
// translation) — see PLAN_NEXT_PHASE.md's Milestone C3 and shared/CLAUDE.md's
// cost/incident history: an extra per-scan LLM call to translate queries on
// the fly would add cost/latency risk this codebase has already been burned
// by twice, and unreviewed live-translated search queries are a real
// quality risk, not just a hypothetical one. Adding a new language later
// means adding one more entry here, not a redesign.
export const SUPPORTED_LANGUAGES = ['en', 'nl'];
export const PROMPT_TEMPLATES_BY_LANGUAGE = {
  en: PROMPT_TEMPLATES,
  nl: PROMPT_TEMPLATES_NL,
};
export function promptTemplatesForLanguage(language) {
  return PROMPT_TEMPLATES_BY_LANGUAGE[language] ?? PROMPT_TEMPLATES;
}

// ---------- NEW: Prompt Categorization for Strategic Weighting ----------
export const PROMPT_CATEGORIES = [
  'high-intent',      // 0: Best option for use case
  'comparison',       // 1: Brand vs competitor
  'high-intent',      // 2: General recommendation
  'informational',    // 3: Top companies in region
  'comparison',       // 4: Good choice + alternatives
  'comparison',       // 5: What people are saying (reputation)
  'high-intent',      // 6: Best for customer segment
  'informational',    // 7: Leaders in category
  'high-intent',      // 8: Criteria-based choice
  'high-intent',      // 9: Switching from competitor
];

// Human labels for all 10 PROMPT_TEMPLATES above, in order. Originally
// deep-advice-only and covering just the hosted site's old 3-prompt subset;
// now covers the full set and is also imported by ScanDetail.vue for the
// check-by-check breakdown, so the same wording appears in both places
// rather than drifting out of sync.
export const PROMPT_LABELS = [
  'category-recommendation query ("what\'s the best [category] for [use case]?")',
  'brand-vs-competitor comparison query',
  'general recommendation query ("I need a good [category], what do you recommend?")',
  'regional "top companies" query ("top [category] companies in [region]?")',
  'alternatives query ("is [brand] good for [use case]? what are the alternatives?")',
  'reputation query ("what are people saying about [brand] vs [competitor]?")',
  'segment-specific recommendation query ("best [category] for [customer segment]?")',
  'category-leaders query ("who are the leaders in [category]?")',
  'criteria-based query ("what should I look for when choosing a [category]?")',
  'switcher-intent query ("switching away from [competitor] — what\'s a good alternative?")',
];
