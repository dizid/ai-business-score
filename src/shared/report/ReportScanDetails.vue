<script setup lang="ts">
// "Details per scan" section of the dashboard report (2026-09-11
// redesign): scan-level extras that aren't core GEO scoring or SEO/Site
// Health data — deep advice, entity presence, homepage clarity, own-site
// citations, failures, and scan metadata. Dashboard-theme only.
import { computed } from 'vue';
import { type ValidatedPayload } from '../scanPayload';
import { CITATION_TIER_LABEL } from '../scanLabels';
import { deriveOwnSiteCitationRows, deriveFailureRows, deriveScanDurationLabel } from '../scanDerived';
import CollapsibleSection from '../CollapsibleSection.vue';

const props = withDefaults(
  defineProps<{
    payload: ValidatedPayload;
    allowDeepAdvice?: boolean;
    deepAdviceLocked?: boolean;
    deepAdviceLoading?: boolean;
  }>(),
  { allowDeepAdvice: false, deepAdviceLocked: false, deepAdviceLoading: false }
);
defineEmits<{ 'generate-deep-advice': []; 'upgrade': [] }>();

const ownSiteCitationRows = computed(() => deriveOwnSiteCitationRows(props.payload));
const failureRows = computed(() => deriveFailureRows(props.payload));
const scanDurationLabel = computed(() => deriveScanDurationLabel(props.payload));
</script>

<template>
  <div class="report-details">
    <template v-if="allowDeepAdvice || payload.deepAdvice || deepAdviceLocked">
      <h2>Deeper advice</h2>
      <div class="card deep-advice-card" v-if="payload.deepAdvice">
        <ol class="deep-advice-steps">
          <li v-for="(step, i) in payload.deepAdvice.steps" :key="i">
            <div class="step-head">
              <strong>{{ step.title }}</strong>
              <span class="difficulty" :class="`difficulty-${step.difficulty.toLowerCase()}`">{{ step.difficulty }}</span>
            </div>
            <p v-if="step.reasoning">{{ step.reasoning }}</p>
          </li>
        </ol>
        <div class="deep-advice-meta" v-if="payload.deepAdviceGeneratedAtDate">
          Generated {{ payload.deepAdviceGeneratedAtDate.toLocaleString() }}
        </div>
      </div>
      <button
        v-else-if="allowDeepAdvice"
        type="button"
        class="deep-advice-button"
        :disabled="deepAdviceLoading"
        @click="$emit('generate-deep-advice')"
      >
        {{ deepAdviceLoading ? 'Generating…' : 'Generate deeper advice' }}
      </button>
      <div class="card deep-advice-locked" v-else-if="deepAdviceLocked">
        <p>Unlock AI-generated action steps — specific, ranked fixes based on this scan's actual results.</p>
        <button type="button" class="deep-advice-button" @click="$emit('upgrade')">
          Upgrade to Pro
        </button>
      </div>
    </template>

    <CollapsibleSection
      v-if="payload.entityPresence"
      title="Entity presence"
      :status-text="payload.entityPresence.wikipediaFound ? 'Wikipedia found' : 'No Wikipedia page'"
    >
      <p v-if="payload.entityPresence.wikipediaFound" class="citations-intro">
        Wikipedia page found: <a :href="payload.entityPresence.wikipediaUrl ?? undefined" target="_blank" rel="noopener">{{ payload.entityPresence.wikipediaUrl }}</a>
        <template v-if="payload.entityPresence.linksToOwnSite === true"> — links to this site.</template>
        <template v-else-if="payload.entityPresence.linksToOwnSite === false"> — does not link to this site.</template>
      </p>
      <p v-else class="citations-intro">No Wikipedia page found for this brand — a real Wikipedia presence is a common off-site authority signal AI models draw on.</p>
    </CollapsibleSection>

    <CollapsibleSection
      v-if="payload.clarityCheck"
      title="Homepage clarity"
      :status-text="payload.clarityCheck.hasSpecificClaim ? 'Specific claim found' : 'No specific claim found'"
    >
      <p v-if="payload.clarityCheck.hasSpecificClaim" class="citations-intro">
        Found a specific, quotable claim: "{{ payload.clarityCheck.quote }}"
      </p>
      <p v-else class="citations-intro">
        This homepage doesn't clearly state a specific, quotable fact about what the business does or who it's for — generic phrasing ("quality service you can trust") gives an AI model nothing distinct to cite.
      </p>
    </CollapsibleSection>

    <CollapsibleSection v-if="ownSiteCitationRows.length" title="Your site, cited" :status-text="`${ownSiteCitationRows.length}`">
      <p class="citations-intro">AI models cited these pages from your own site while answering:</p>
      <ul class="citation-list">
        <li v-for="(c, i) in ownSiteCitationRows" :key="i">
          <a :href="c.url" target="_blank" rel="noopener">{{ c.title }}</a>
          <span class="citation-meta">{{ c.model }} &middot; {{ c.promptLabel }} &middot; {{ CITATION_TIER_LABEL[c.tier] }}</span>
        </li>
      </ul>
    </CollapsibleSection>

    <CollapsibleSection v-if="failureRows.length" title="Failed checks" :status-text="`${payload.failedCalls}`">
      <ul class="fail-reasons">
        <li v-for="(f, i) in failureRows" :key="i">
          <span class="check-model">{{ f.model }}</span> — {{ f.promptLabel }}: {{ f.error || 'no error message' }}
        </li>
      </ul>
    </CollapsibleSection>
    <p class="details-note" v-else-if="payload.failedCalls > 0">
      {{ payload.failedCalls }} additional {{ payload.failedCalls === 1 ? 'check' : 'checks' }} failed to
      complete (API error or timeout) — which specific prompt/model failed isn't currently recorded for this scan.
    </p>

    <div class="card scan-meta-card">
      <div class="scan-meta-label">Scan metadata</div>
      <dl class="scan-meta-list">
        <div><dt>Checked</dt><dd>{{ payload.generatedAtDate.toLocaleString() }}</dd></div>
        <div v-if="scanDurationLabel"><dt>Duration</dt><dd>{{ scanDurationLabel }}</dd></div>
        <div><dt>Successful checks</dt><dd>{{ payload.completedCalls }} / {{ payload.completedCalls + payload.failedCalls }}</dd></div>
      </dl>
    </div>

    <p
      class="details-empty"
      v-if="!payload.deepAdvice && !allowDeepAdvice && !deepAdviceLocked && !payload.entityPresence && !payload.clarityCheck && !ownSiteCitationRows.length && !failureRows.length && payload.failedCalls === 0"
    >No additional scan details available.</p>
  </div>
</template>

<style scoped>
.card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: var(--shadow); }
h2 { font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--muted); margin: 28px 0 10px; }
h2:first-of-type { margin-top: 0; }

.deep-advice-steps { margin: 0; padding: 0; list-style: none; counter-reset: step-counter; }
.deep-advice-steps li { counter-increment: step-counter; position: relative; padding-left: 34px; margin-bottom: 16px; min-height: 24px; }
.deep-advice-steps li:last-child { margin-bottom: 0; }
.deep-advice-steps li::before {
  content: counter(step-counter); position: absolute; left: 0; top: 0;
  width: 24px; height: 24px; border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 15%, var(--card)); color: var(--accent);
  font-size: 0.78rem; font-weight: 700; display: flex; align-items: center; justify-content: center;
}
.step-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.step-head strong { font-size: 0.95rem; }
.deep-advice-steps p { margin: 4px 0 0; font-size: 0.88rem; color: var(--muted); }
.difficulty { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--border); color: var(--muted); }
.difficulty-easy { border-color: color-mix(in srgb, var(--good) 45%, var(--border)); color: var(--success-text); }
.difficulty-hard { border-color: color-mix(in srgb, var(--critical) 45%, var(--border)); color: var(--critical); }
.deep-advice-meta { margin-top: 14px; font-size: 0.78rem; color: var(--faint); }
.deep-advice-button {
  padding: 10px 16px; font-size: 0.9rem; font-weight: 600;
  border: none; border-radius: 8px; background: var(--accent); color: var(--accent-ink); cursor: pointer;
  box-shadow: var(--shadow); transition: transform 0.15s ease;
}
.deep-advice-button:hover:not(:disabled) { transform: translateY(-1px); }
.deep-advice-button:disabled { opacity: 0.6; cursor: wait; }
.deep-advice-locked { padding: 16px 20px; }
.deep-advice-locked p { margin: 0 0 12px; color: var(--muted); font-size: 0.9rem; }

.citations-intro { margin: 0 0 10px; font-size: 0.85rem; color: var(--muted); }
.citation-list { list-style: none; margin: 0; padding: 0; }
.citation-list li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; padding: 8px 0; border-top: 1px solid var(--border); }
.citation-list li:first-child { border-top: none; padding-top: 0; }
.citation-list a { color: var(--accent); font-size: 0.9rem; }
.citation-meta { font-size: 0.78rem; color: var(--faint); }

.fail-reasons { margin: 0; padding-left: 18px; line-height: 1.6; font-size: 0.85rem; color: var(--muted); }
.fail-reasons li { margin-bottom: 4px; }
.fail-reasons .check-model { color: var(--fg); font-family: ui-monospace, monospace; }
.details-note, .details-empty { color: var(--muted); font-size: 0.88rem; padding: 8px 0; }

.scan-meta-card { padding: 18px 20px; }
.scan-meta-label { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin-bottom: 10px; }
.scan-meta-list { margin: 0; display: flex; flex-direction: column; gap: 6px; }
.scan-meta-list > div { display: flex; justify-content: space-between; gap: 10px; font-size: 0.88rem; }
.scan-meta-list dt { color: var(--muted); margin: 0; }
.scan-meta-list dd { margin: 0; font-weight: 600; font-variant-numeric: proportional-nums; }
</style>
