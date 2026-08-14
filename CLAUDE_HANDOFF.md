# Handoff Document for Claude: Finalizing Strategic Scoring

**Author:** Gemini
**Date:** 2024-08-04
**Status:** Core logic for all strategic improvements is implemented. Awaiting final backend integration and user-facing controls.

## 1. Current Status

The strategic enhancements outlined in `GeminiPLAN.md` have been fully implemented at the core logic and frontend presentation layers. The AI Visibility Score is now a far more robust, defensible, and strategically valuable metric.

**Completed Work:**
- **Improvement 1: Positional Weighting:** The scoring model now uses a granular, rank-based decay model (`ranked-1`, `ranked-2`, etc.) instead of a binary "beaten/not beaten" system.
- **Improvement 2: Confidence & Validity:** A score is only calculated if a minimum of 4 checks succeed. The UI now transparently displays a confidence metric (e.g., "Based on 18/20 successful checks").
- **Improvement 3: Strategic Query Weighting:** The `computeScore` function has been upgraded to accept and apply user-defined weights for different query categories (`high-intent`, `comparison`, `informational`). It currently uses a set of hardcoded defaults.

**Affected Files:**
- `shared/aivis-core.mjs`: All core logic changes are here. This includes the new `PROMPT_CATEGORIES`, `DEFAULT_QUERY_WEIGHTS`, and the overhauled `computeScore` and `aggregateProspect` functions.
- `src/shared/ScanDetail.vue`: The frontend component has been updated to correctly display data from the new scoring model, including the confidence score and more descriptive rank labels.

## 2. Next Steps for Claude

The core logic is complete, but it is not yet fully utilized by the backend. Your task is to integrate the new strategic weighting capability end-to-end.

### Task 1: Integrate Strategic Weighting into the Scan Process

You need to modify the backend function that performs the scan to make use of the new weighted scoring.

1.  **File to Edit:** `netlify/functions/run-scan-background.mts`
2.  **Action:** Locate the `computeScore` call within this file.
3.  **Modification:** Currently, the call is `computeScore(agg.perPromptRank, agg.completedCalls)`. You need to prepare it to accept user-defined weights.
    - For now, you can continue to use the default weights by simply letting the function use its new default parameter. The code does not need to change for this step, but you need to be aware that this is where the user-defined weights will eventually be passed.
    - **Future-proofing:** The goal is to eventually pull a `queryWeights` JSON object from the `company` record and pass it as the third argument to `computeScore`. This will require a database migration and UI changes, which are part of a later task. Your current task is to ensure the backend is using the new default weighted logic correctly.

### Task 2: Verify and Commit

The user has requested that we "push and commit and test e2e."

1.  **Verification:** After ensuring `run-scan-background.mts` correctly uses the new scoring logic (even with defaults), perform a final verification. Run the `npm run build` command to check for any type errors.
2.  **Commit:** Once verified, commit all the changes made in this session with a clear, descriptive commit message. A good message would be: `feat: Overhaul scoring with positional and strategic weighting`.
3.  **Handoff for E2E Testing:** After committing, report back to the user that the implementation is complete and committed, and that it is now ready for manual end-to-end testing, as requested.

You have the full context and a clear set of instructions. Proceed with the integration.
