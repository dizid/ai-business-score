// Converts a public.scans DB row (snake_case columns) into the camelCase
// shape scanPayload.ts's validatePayload() expects — the same shape /scan
// used to write directly into the Blobs store and the URL fragment. Keeping
// this shape stable is what lets ScanDetail.vue be reused unchanged.
export function toScanPayload(row: Record<string, any>) {
  return {
    id: row.id,
    brand: row.brand,
    website: row.website,
    category: row.category,
    citedCount: row.cited_count,
    completedCalls: row.completed_calls,
    failedCalls: row.failed_calls,
    ambiguousBrandFlag: row.ambiguous_brand_flag,
    perPromptRank: row.per_prompt_rank,
    competitorTallies: row.competitor_tallies,
    score: row.score,
    advice: row.advice,
    rawResponses: row.raw_responses,
    generatedAt: row.generated_at,
    deepAdvice: row.deep_advice ?? null,
    deepAdviceGeneratedAt: row.deep_advice_generated_at ?? null,
  };
}
