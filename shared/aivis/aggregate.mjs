// Result aggregation — split out of aivis-core.mjs (2026-09-12 architecture
// refactor). Shared by both callers: takes prospect + array of { ok, text?,
// usage?, error?, model, promptIndex } and produces cited counts, heuristic
// ranking, per-competitor tallies, and raw responses for the mandatory
// manual skim.

import { hostnameOf, findBrandMention, findMentions } from './brand.mjs';
import { truncate } from '../textUtils.mjs';

export function aggregateProspect(prospect, callResults) {
  const completed = callResults.filter((r) => r.ok);
  const failed = callResults.filter((r) => !r.ok);

  let citedCount = 0;
  let ambiguousBrandFlag = false;
  const perPromptRank = [];
  const competitorTallies = prospect.competitors.map((name) => ({
    name,
    mentionCount: 0,
    beatBrandCount: 0,
    ambiguous: false,
  }));

  // Citation-URL attribution: which of the company's own pages an AI model
  // actually drew its answer from, across every completed check — not
  // gated on whether the brand name itself was textually detected in that
  // response, since a model can ground an answer in a company's page
  // without the response prose repeating the exact brand string. Matches
  // by hostname (subdomain-tolerant: a citation from "www.acme.com" or
  // "blog.acme.com" both count as "acme.com"'s own site).
  const ownHostname = hostnameOf(prospect.website);
  const ownSiteCitations = [];

  for (const r of completed) {
    const brandMatch = findBrandMention(r.text, prospect);
    if (brandMatch.ambiguous) ambiguousBrandFlag = true;
    const cited = !brandMatch.ambiguous && brandMatch.mentioned;
    if (cited) citedCount++;

    for (const citation of r.citations || []) {
      let citedHostname;
      try {
        citedHostname = hostnameOf(citation.url);
      } catch {
        continue; // malformed citation URL — skip rather than crash aggregation over it
      }
      if (citedHostname === ownHostname || citedHostname.endsWith(`.${ownHostname}`)) {
        ownSiteCitations.push({
          promptIndex: r.promptIndex,
          model: r.model,
          url: citation.url,
          title: citation.title,
        });
      }
    }

    const allMentions = [];

    if (cited) {
      allMentions.push({ name: prospect.brand, index: brandMatch.firstIndex, isBrand: true });
    }

    prospect.competitors.forEach((c, i) => {
      const m = findMentions(r.text, c);
      if (m.ambiguous) {
        competitorTallies[i].ambiguous = true;
        return;
      }
      if (m.mentioned) {
        allMentions.push({ name: c, index: m.firstIndex, isBrand: false });
        competitorTallies[i].mentionCount++;
      }
    });

    allMentions.sort((a, b) => a.index - b.index);

    let rankValue;
    const brandPosition = allMentions.findIndex((m) => m.isBrand);

    if (brandPosition === -1) {
      rankValue = 'not-mentioned';
    } else {
      for (let i = 0; i < brandPosition; i++) {
        const competitorName = allMentions[i].name;
        const competitorIndex = prospect.competitors.indexOf(competitorName);
        if (competitorIndex !== -1) {
          competitorTallies[competitorIndex].beatBrandCount++;
        }
      }

      const rankNumber = brandPosition + 1;
      if (rankNumber === 1) {
        rankValue = 'ranked-1';
      } else if (rankNumber === 2) {
        rankValue = 'ranked-2';
      } else if (rankNumber === 3) {
        rankValue = 'ranked-3';
      } else {
        rankValue = 'mentioned';
      }
    }

    perPromptRank.push({ promptIndex: r.promptIndex, rank: rankValue, model: r.model });
  }

  return {
    prospect,
    totalCalls: callResults.length,
    completedCalls: completed.length,
    failedCalls: failed.length,
    citedCount,
    ambiguousBrandFlag,
    perPromptRank,
    competitorTallies,
    rawResponses: completed.map((r) => ({
      model: r.model,
      promptIndex: r.promptIndex,
      text: r.text,
      citations: r.citations || [],
    })),
    // Citations whose hostname matches the company's own website, across
    // every completed check — lets advice point at the exact page an AI
    // model actually drew from, instead of generic "improve your SEO"
    // guidance. Empty for scans run before this field existed or where no
    // completed call happened to cite the company's own site.
    ownSiteCitations,
    // Per-call failure detail (model/prompt/why) — restores what commit
    // 522eb63 shipped and 74afa41 accidentally deleted the next day during
    // an unrelated "flatten repo" refactor. Truncated to 300 chars: error
    // text is free-form (HTTP body, gateway message), not a bounded field.
    failures: failed.map((r) => ({ model: r.model, promptIndex: r.promptIndex, error: truncate(String(r.error), 300) })),
    totalTokens: completed.reduce((sum, r) => sum + (r.usage?.total_tokens ?? 0), 0),
  };
}
