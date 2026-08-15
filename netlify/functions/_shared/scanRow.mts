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
    // failures is new (Milestone A3) — old rows predate the column and read
    // back as null, default to [] so scanPayload.ts never has to special-
    // case null vs. a genuinely empty list.
    failures: row.failures ?? [],
    // own_site_citations is new (Milestone F citation attribution) — same
    // null-to-[] default for pre-migration rows.
    ownSiteCitations: row.own_site_citations ?? [],
    // sentiment_judgments is new (Milestone F sentiment judge) — same
    // null-to-[] default; empty until a user judges at least one check.
    sentimentJudgments: row.sentiment_judgments ?? [],
    generatedAt: row.generated_at,
    deepAdvice: row.deep_advice ?? null,
    deepAdviceGeneratedAt: row.deep_advice_generated_at ?? null,
  };
}
