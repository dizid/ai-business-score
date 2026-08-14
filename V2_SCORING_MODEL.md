# Technical Reference: V2 Scoring Model Implementation

**Author:** Gemini
**Date:** 2024-08-04
**Status:** Implemented

This document details the technical execution of "Improvement 1: Implement Positional Weighting" as outlined in `GeminiPLAN.md`. It serves as a reference for the new, more sophisticated ranking and scoring architecture. All changes were applied to `shared/aivis-core.mjs`.

## 1. Objective

The primary goal was to replace the V1's simplistic and arbitrary scoring model with a defensible, granular, and more accurate system based on precise positional ranking. This addresses the "Magic Number" and "Strategic Vagueness" problems of the original model.

## 2. Core Logic Changes

### 2.1. `aggregateProspect`: From Binary to Positional Ranking

The `aggregateProspect` function was completely overhauled.

**Previous Logic:**
- Determined if the brand was mentioned.
- Determined if any competitor was mentioned *before* the brand (`beatenBy`).
- Assigned a binary rank: `'ranked-1'`, `'beaten'`, or `'not-mentioned'`.

**New Logic:**
1.  **Comprehensive Mention Collection:** The function now iterates through the brand and all competitors, finding the first index of each mention in the AI response text.
2.  **Unified Mention List:** All found mentions are collected into a single `allMentions` array, with each entry containing the entity's name, its index, and whether it's the primary brand.
3.  **Positional Sorting:** This `allMentions` array is sorted by index, creating an exact order of appearance.
4.  **Precise Rank Assignment:** The function determines the brand's position (0-indexed) in the sorted list. This position is then mapped to a more granular rank value:
    - Position 0: `'ranked-1'`
    - Position 1: `'ranked-2'`
    - Position 2: `'ranked-3'`
    - Position 3+: `'mentioned'`
    - Not in list: `'not-mentioned'`

This new implementation provides a much richer, more accurate picture of the competitive landscape within each AI response. The `beatBrandCount` for competitors is also now calculated based on this sorted list, making it more accurate.

### 2.2. `computeScore`: From "Magic Number" to Decay Model

The `computeScore` function was updated to leverage the new, granular ranking data.

**Previous Logic:**
- Used a hardcoded `SCORE_BEATEN_WEIGHT` of `0.4`.
- Calculated score based on `ranked1Count` and `beatenCount`.

**New Logic:**
1.  **`RANK_WEIGHTS` Constant:** A new, defensible constant, `RANK_WEIGHTS`, was introduced, mapping the new rank strings to specific multipliers:
    ```javascript
    const RANK_WEIGHTS = {
      'ranked-1': 1.0,
      'ranked-2': 0.6,
      'ranked-3': 0.3,
      'mentioned': 0.1,
    };
    ```
2.  **Weighted Summation:** The function now iterates through the `perPromptRank` array and calculates a `totalWeightedScore` by summing the corresponding weight for each result's rank.
3.  **Final Score Calculation:** The final score is `100 * (totalWeightedScore / completedCalls)`, creating a direct and transparent relationship between rank and score.

## 3. Downstream System Adaptations

To ensure system-wide consistency, functions that consume the ranking data were also updated.

### 3.1. `selectAdvice`
The logic for determining a "beaten" scenario was updated. It now considers `'ranked-2'`, `'ranked-3'`, and `'mentioned'` as collective indicators that the brand was cited but did not rank first. The parameters passed to the `'mixed'` advice card were updated accordingly.

### 3.2. `summarizePerPromptRank`
This function, which generates the text for the deep-advice prompt, was significantly improved. Instead of a simple "ranked first, beaten, or not mentioned" summary, it now provides a detailed breakdown reflecting the new, granular ranks:
- **Example V1 Output:** `- ...: ranked first in 1, beaten by a competitor in 2, not mentioned in 1 (of 4 checks)`
- **Example V2 Output:** `- ...: ranked first in 1, ranked 2nd in 2, not mentioned in 1 (of 4 checks)`

This provides the "deep advice" LLM with much more precise data to ground its strategic recommendations.

## 4. Conclusion

The V1 scoring model has been successfully deprecated and replaced with a more robust, defensible, and strategically insightful V2 architecture. The system now measures AI visibility with greater precision, directly reflecting the value of ranking position. This completes the foundational work for the first strategic improvement.
