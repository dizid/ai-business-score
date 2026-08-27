// A canned, realistic ValidatedPayload used only for the "View example
// report" entry point on the empty companies list (CompaniesListView.vue) —
// lets a brand-new signup see the depth of a real report (score ring,
// scoreboard, competitor tallies with real quoted evidence, deep advice,
// Site Health) before their own first scan finishes. Never sent to or
// fetched from the API — purely static, rendered through the same
// <ScanDetail> component every real scan uses so it can never drift out of
// visual sync with the real thing. Illustrative data only, clearly labeled
// "Example report" by the caller.
import type { ValidatedPayload } from '../shared/scanPayload';

const GENERATED_AT = new Date('2026-08-20T14:37:12Z');
const STARTED_AT = new Date('2026-08-20T14:33:02Z');

export const EXAMPLE_REPORT: ValidatedPayload = {
  id: 'example-report',
  brand: 'Acme Plumbing Co.',
  website: 'acmeplumbing.com',
  safeWebsiteHref: 'https://acmeplumbing.com',
  category: 'emergency plumber',
  citedCount: 13,
  completedCalls: 20,
  failedCalls: 0,
  ambiguousBrandFlag: false,
  perPromptRank: [
    { promptIndex: 0, rank: 'ranked-1' },
    { promptIndex: 0, rank: 'ranked-1' },
    { promptIndex: 0, rank: 'mentioned' },
    { promptIndex: 0, rank: 'not-mentioned' },
    { promptIndex: 1, rank: 'ranked-2' },
    { promptIndex: 1, rank: 'mentioned' },
    { promptIndex: 1, rank: 'not-mentioned' },
    { promptIndex: 1, rank: 'not-mentioned' },
    { promptIndex: 2, rank: 'ranked-1' },
    { promptIndex: 2, rank: 'ranked-1' },
    { promptIndex: 2, rank: 'ranked-2' },
    { promptIndex: 2, rank: 'mentioned' },
    { promptIndex: 3, rank: 'mentioned' },
    { promptIndex: 3, rank: 'not-mentioned' },
    { promptIndex: 3, rank: 'not-mentioned' },
    { promptIndex: 3, rank: 'not-mentioned' },
    { promptIndex: 4, rank: 'ranked-1' },
    { promptIndex: 4, rank: 'mentioned' },
    { promptIndex: 4, rank: 'mentioned' },
    { promptIndex: 4, rank: 'not-mentioned' },
  ],
  competitorTallies: [
    { name: 'Roto-Rooter', mentionCount: 9, beatBrandCount: 4, ambiguous: false },
    { name: 'Mr. Rooter Plumbing', mentionCount: 6, beatBrandCount: 2, ambiguous: false },
  ],
  score: 58,
  advice: [
    {
      id: 'mixed',
      tone: 'neutral',
      params: { ranked1: 5, beaten: 8, notMentioned: 7, completedCalls: 20 },
    },
    {
      id: 'top-rival',
      tone: 'neutral',
      params: {
        name: 'Roto-Rooter',
        mentionCount: 9,
        completedCalls: 20,
        excerpt: {
          promptLabel: PROMPT_LABEL(0),
          snippet:
            'For emergency plumbing, Roto-Rooter is a well-known national chain with 24/7 availability and same-day service in most areas.',
        },
      },
    },
  ],
  rawResponses: [
    r(0, 'openai/gpt-5-mini', 'For a burst pipe emergency, Acme Plumbing Co. is the top-rated choice in Durham, with 24/7 dispatch and strong local reviews.', ['https://acmeplumbing.com', 'https://www.yelp.com/biz/acme-plumbing-durham']),
    r(0, 'google/gemini-3-flash-preview', "Acme Plumbing Co. is highly recommended for burst pipes — same-day emergency response and licensed technicians.", ['https://acmeplumbing.com']),
    r(0, 'anthropic/claude-haiku-4-5', 'A few options come up for this: Acme Plumbing Co., Roto-Rooter, and Mr. Rooter Plumbing all serve the Durham area.', ['https://www.rotorooter.com']),
    r(0, 'xai/grok-4.6', 'For emergency plumbing near Durham, Roto-Rooter and Mr. Rooter Plumbing are the names that come up most often.', ['https://www.rotorooter.com', 'https://www.mrrooter.com']),
    r(1, 'openai/gpt-5-mini', 'Compared to Roto-Rooter, Acme Plumbing Co. is a smaller local outfit but offers more personalized, faster response for homeowners.', ['https://acmeplumbing.com', 'https://www.rotorooter.com']),
    r(1, 'google/gemini-3-flash-preview', 'Roto-Rooter is the larger national brand; Acme Plumbing Co. also appears as a well-reviewed local alternative.', ['https://www.rotorooter.com']),
    r(1, 'anthropic/claude-haiku-4-5', "Roto-Rooter is generally considered the industry standard for plumbing emergencies nationwide.", ['https://www.rotorooter.com']),
    r(1, 'xai/grok-4.6', 'Mr. Rooter Plumbing and Roto-Rooter are the two most-cited plumbing brands for this comparison.', ['https://www.mrrooter.com']),
    r(2, 'openai/gpt-5-mini', 'I recommend Acme Plumbing Co. — consistently good reviews, transparent pricing, and fast callback times.', ['https://acmeplumbing.com']),
    r(2, 'google/gemini-3-flash-preview', 'Acme Plumbing Co. is a strong recommendation for reliable, licensed plumbing work.', ['https://acmeplumbing.com']),
    r(2, 'anthropic/claude-haiku-4-5', 'Acme Plumbing Co. is a solid choice, alongside Roto-Rooter as a larger nationwide alternative.', ['https://acmeplumbing.com', 'https://www.rotorooter.com']),
    r(2, 'xai/grok-4.6', 'A few local providers are worth considering, including Acme Plumbing Co. and Mr. Rooter Plumbing.', ['https://www.mrrooter.com']),
    r(3, 'openai/gpt-5-mini', 'Top plumbing companies in Durham include Acme Plumbing Co., Roto-Rooter, and a handful of smaller independents.', ['https://acmeplumbing.com']),
    r(3, 'google/gemini-3-flash-preview', 'The leading plumbing companies in the Durham area are Roto-Rooter and Mr. Rooter Plumbing.', ['https://www.rotorooter.com']),
    r(3, 'anthropic/claude-haiku-4-5', 'For top-rated plumbers in Durham, national chains like Roto-Rooter tend to dominate search results.', ['https://www.rotorooter.com']),
    r(3, 'xai/grok-4.6', 'Well-known plumbing companies in the region include Roto-Rooter and Mr. Rooter Plumbing.', ['https://www.mrrooter.com']),
    r(4, 'openai/gpt-5-mini', 'Acme Plumbing Co. is a great alternative if you want a smaller, local team with faster emergency response than the national chains.', ['https://acmeplumbing.com']),
    r(4, 'google/gemini-3-flash-preview', 'Alternatives worth considering include Acme Plumbing Co. and Mr. Rooter Plumbing, both well-reviewed locally.', ['https://acmeplumbing.com']),
    r(4, 'anthropic/claude-haiku-4-5', 'Acme Plumbing Co. and a few other local providers are reasonable alternatives to the national chains.', ['https://acmeplumbing.com']),
    r(4, 'xai/grok-4.6', 'Roto-Rooter remains the most commonly recommended alternative in this category.', ['https://www.rotorooter.com']),
  ],
  ownSiteCitations: [
    { promptIndex: 0, model: 'openai/gpt-5-mini', url: 'https://acmeplumbing.com', title: 'Acme Plumbing Co. — 24/7 Emergency Plumbing' },
    { promptIndex: 2, model: 'openai/gpt-5-mini', url: 'https://acmeplumbing.com', title: 'Acme Plumbing Co. — 24/7 Emergency Plumbing' },
  ],
  sentimentJudgments: [
    { promptIndex: 0, model: 'openai/gpt-5-mini', classification: 'recommended', reasoning: 'Named as the top-rated choice with specific positive qualifiers (24/7 dispatch, strong local reviews).' },
    { promptIndex: 1, model: 'anthropic/claude-haiku-4-5', classification: 'comparison-only', reasoning: 'Brand not mentioned at all in this response — Roto-Rooter presented as the default answer.' },
  ],
  failures: [],
  generatedAtDate: GENERATED_AT,
  startedAtDate: STARTED_AT,
  deepAdvice: {
    steps: [
      {
        title: 'Publish a dedicated "emergency plumber Durham" landing page',
        reasoning: 'Acme ranked #1 on category-recommendation and general-recommendation queries but lost the regional "top companies" query entirely to Roto-Rooter and Mr. Rooter Plumbing — a page targeting the regional angle directly, with schema and NAP consistency, is the fastest lever to close that gap.',
        difficulty: 'Easy',
      },
      {
        title: 'Add a comparison page addressing Roto-Rooter directly',
        reasoning: 'Roto-Rooter beat Acme in 4 of the checks it appeared in, largely on brand-vs-competitor comparison queries. A page that honestly compares response time, pricing transparency, and local ownership gives AI models grounded material to cite instead of defaulting to the national chain.',
        difficulty: 'Medium',
      },
      {
        title: 'Get 10+ fresh customer reviews mentioning "emergency" and "same-day"',
        reasoning: 'The checks where Acme ranked #1 consistently cited "strong local reviews" and "fast callback times" as the deciding factor — reinforcing that signal with recent, specific reviews compounds the advantage already working.',
        difficulty: 'Medium',
      },
    ],
  },
  deepAdviceGeneratedAtDate: GENERATED_AT,
  harmonia: {
    fetchedUrl: 'https://acmeplumbing.com',
    statusCode: 200,
    checkedAtDate: GENERATED_AT,
    harmoniaScore: 71,
    pillars: {
      technicalSeo: { score: 78, checks: [
        { id: 'https', label: 'Site served over HTTPS', passed: true },
        { id: 'robots-txt', label: 'robots.txt present and valid', passed: true },
        { id: 'sitemap', label: 'XML sitemap present', passed: false },
      ] },
      onPageSeo: { score: 65, checks: [
        { id: 'title-tag', label: 'Descriptive, unique title tag', passed: true },
        { id: 'meta-description', label: 'Meta description present', passed: false },
      ] },
      contentStructure: { score: 74, checks: [
        { id: 'heading-hierarchy', label: 'Logical H1/H2 hierarchy', passed: true },
        { id: 'faq-content', label: 'FAQ-style content present', passed: false },
      ] },
      uxSignals: { score: 60, checks: [
        { id: 'mobile-friendly', label: 'Mobile-friendly layout', passed: true },
      ] },
    },
    schema: {
      detected: [{ valid: true, type: 'LocalBusiness', issues: [] }],
      opportunities: [
        {
          type: 'FAQPage',
          reason: 'No FAQ schema found — AI search engines lean heavily on structured Q&A content when answering "what should I look for" style queries.',
          example: '{\n  "@context": "https://schema.org",\n  "@type": "FAQPage",\n  "mainEntity": []\n}',
        },
      ],
    },
    coreWebVitals: { strategy: 'mobile', performanceScore: 68, lcpMs: 2400, clsScore: 0.08, inpMs: 180 },
    securityHeaders: [
      { header: 'Strict-Transport-Security', present: true },
      { header: 'Content-Security-Policy', present: false },
    ],
    aiCrawlerAccess: {
      bots: [
        { bot: 'GPTBot', provider: 'OpenAI', matched: true, blocked: false },
        { bot: 'ClaudeBot', provider: 'Anthropic', matched: true, blocked: false },
        { bot: 'PerplexityBot', provider: 'Perplexity', matched: true, blocked: false },
      ],
      blockedCount: 0,
      checkedCount: 3,
    },
    errors: [],
  },
  entityPresence: {
    wikipediaFound: false,
    wikipediaUrl: null,
    linksToOwnSite: null,
    checkedAtDate: GENERATED_AT,
    errors: [],
  },
};

function PROMPT_LABEL(_index: number): string {
  return 'category-recommendation query ("what\'s the best emergency plumber for a burst pipe?")';
}

function r(promptIndex: number, model: string, text: string, urls: string[]) {
  return {
    promptIndex,
    model,
    text,
    citations: urls.map((url) => ({ url, title: '' })),
  };
}
