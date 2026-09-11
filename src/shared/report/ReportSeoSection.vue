<script setup lang="ts">
// SEO section of the dashboard report (2026-09-11 redesign): Site Health
// ("Harmonia" internally, see scanLabels.ts) master-detail — master = the
// 4 weighted pillars, detail = the selected pillar's checks plus whichever
// richer breakout explains those checks (security headers + AI-crawler
// access for Technical SEO, schema for Content Structure, Core Web Vitals
// for UX Signals, additional markup signals for On-Page SEO). A SEPARATE,
// secondary score from the AI Visibility Score in the GEO/Executive
// Summary sections — never blended into it, see shared/harmonia.mjs.
// Dashboard-theme only.
import { computed, ref, watch } from 'vue';
import { type ValidatedPayload } from '../scanPayload';
import Icon from '../Icon.vue';
import {
  deriveHarmoniaPillars, deriveHarmoniaBand, deriveExtraPsiScores, deriveAdditionalAuditRows,
  cwvRating, formatSeconds, type HarmoniaPillarView,
} from '../scanDerived';

const props = defineProps<{ payload: ValidatedPayload }>();

const harmoniaPillars = computed(() => deriveHarmoniaPillars(props.payload));
const harmoniaBand = computed(() => deriveHarmoniaBand(props.payload));
const extraPsiScores = computed(() => deriveExtraPsiScores(props.payload));
const additionalAuditRows = computed(() => deriveAdditionalAuditRows(props.payload));
const additionalSeoSignals = computed(() => props.payload.harmonia?.additionalSeoSignals ?? null);
const hreflangCodesLabel = computed(() => {
  const codes = (additionalSeoSignals.value?.hreflangTags ?? []).map((t) => t.hreflang).filter((c): c is string => Boolean(c));
  return codes.join(', ');
});

const selectedPillarKey = ref<HarmoniaPillarView['key'] | null>(null);
watch(harmoniaPillars, (pillars) => {
  if (!pillars.some((p) => p.key === selectedPillarKey.value)) {
    selectedPillarKey.value = pillars.length ? pillars[0].key : null;
  }
}, { immediate: true });
const selectedPillar = computed(() => harmoniaPillars.value.find((p) => p.key === selectedPillarKey.value) ?? null);
function selectPillar(key: HarmoniaPillarView['key']) { selectedPillarKey.value = key; }

const copiedSchemaIndex = ref<number | null>(null);
function copySchema(example: string, index: number) {
  navigator.clipboard.writeText(example);
  copiedSchemaIndex.value = index;
  setTimeout(() => {
    if (copiedSchemaIndex.value === index) copiedSchemaIndex.value = null;
  }, 2000);
}
</script>

<template>
  <div class="report-seo">
    <template v-if="payload.harmonia">
      <div class="seo-summary-head">
        <span class="seo-overall-score" :class="`band-text-${harmoniaBand}`">{{ payload.harmonia.harmoniaScore ?? '—' }}<span class="of100">/ 100</span></span>
        <span class="seo-summary-label">Technical, on-page, content-structure, and UX health of {{ payload.website }} — not part of the AI Visibility Score.</span>
      </div>

      <div class="seo-master-detail">
        <div class="seo-master">
          <button
            v-for="p in harmoniaPillars" :key="p.key"
            type="button" class="seo-master-row"
            :class="{ active: p.key === selectedPillarKey }"
            @click="selectPillar(p.key)"
          >
            <div class="seo-master-row-top">
              <span class="seo-master-label">{{ p.label }}</span>
              <span class="seo-master-score" :class="`band-text-${p.band}`">{{ p.score ?? '—' }}</span>
            </div>
            <div class="board-track" v-if="p.score !== null"><div class="board-fill" :class="`band-fill-${p.band}`" :style="{ width: p.score + '%' }"></div></div>
          </button>
        </div>

        <div class="seo-detail card" v-if="selectedPillar">
          <div class="seo-detail-label">{{ selectedPillar.label }}</div>
          <ul class="harmonia-checklist" v-if="selectedPillar.checks.length">
            <li v-for="c in selectedPillar.checks" :key="c.id" :class="c.passed ? 'passed' : 'failed'">
              <span class="check-icon"><Icon :name="c.passed ? 'check' : 'x'" /></span> {{ c.label }}
            </li>
          </ul>
          <p class="seo-pillar-empty" v-else>Not available for this scan.</p>

          <template v-if="selectedPillar.key === 'technicalSeo'">
            <div class="seo-extra" v-if="payload.harmonia.securityHeaders.length">
              <h3>Security headers</h3>
              <ul class="harmonia-checklist">
                <li v-for="h in payload.harmonia.securityHeaders" :key="h.header" :class="h.present ? 'passed' : 'failed'">
                  <span class="check-icon"><Icon :name="h.present ? 'check' : 'x'" /></span> {{ h.header }}
                </li>
              </ul>
            </div>
            <div class="seo-extra" v-if="payload.harmonia.aiCrawlerAccess.bots.length">
              <h3>AI crawler access (robots.txt)</h3>
              <ul class="harmonia-checklist">
                <li v-for="b in payload.harmonia.aiCrawlerAccess.bots" :key="b.bot" :class="b.blocked ? 'failed' : 'passed'">
                  <span class="check-icon"><Icon :name="b.blocked ? 'x' : 'check'" /></span> {{ b.bot }} ({{ b.provider }}) — {{ b.blocked ? 'blocked' : b.matched ? 'allowed' : 'no rule (allowed by default)' }}
                </li>
              </ul>
            </div>
          </template>

          <div class="seo-extra" v-if="selectedPillar.key === 'onPageSeo' && additionalSeoSignals">
            <h3>Additional SEO signals</h3>
            <ul class="harmonia-checklist">
              <li :class="additionalSeoSignals.htmlLang ? 'passed' : 'failed'">
                <span class="check-icon"><Icon :name="additionalSeoSignals.htmlLang ? 'check' : 'x'" /></span>
                HTML lang attribute {{ additionalSeoSignals.htmlLang ? `set (${additionalSeoSignals.htmlLang})` : 'not set' }}
              </li>
              <li :class="additionalSeoSignals.faviconPresent ? 'passed' : 'failed'">
                <span class="check-icon"><Icon :name="additionalSeoSignals.faviconPresent ? 'check' : 'x'" /></span>
                Favicon present
              </li>
              <li :class="additionalSeoSignals.manifestPresent ? 'passed' : 'failed'">
                <span class="check-icon"><Icon :name="additionalSeoSignals.manifestPresent ? 'check' : 'x'" /></span>
                Web app manifest present
              </li>
              <li :class="additionalSeoSignals.twitterCard.length ? 'passed' : 'failed'">
                <span class="check-icon"><Icon :name="additionalSeoSignals.twitterCard.length ? 'check' : 'x'" /></span>
                Twitter Card tags present
              </li>
              <li :class="additionalSeoSignals.hreflangTags.length ? 'passed' : 'failed'">
                <span class="check-icon"><Icon :name="additionalSeoSignals.hreflangTags.length ? 'check' : 'x'" /></span>
                hreflang tags present{{ hreflangCodesLabel ? ` (${hreflangCodesLabel})` : '' }}
              </li>
              <li :class="additionalSeoSignals.sitemapUrlCount ? 'passed' : 'failed'">
                <span class="check-icon"><Icon :name="additionalSeoSignals.sitemapUrlCount ? 'check' : 'x'" /></span>
                <template v-if="additionalSeoSignals.sitemapUrlCount">Sitemap{{ additionalSeoSignals.sitemapIsIndex ? ' index' : '' }} lists {{ additionalSeoSignals.sitemapUrlCount }} URL{{ additionalSeoSignals.sitemapUrlCount === 1 ? '' : 's' }}</template>
                <template v-else>No sitemap URLs found</template>
              </li>
            </ul>
          </div>

          <template v-if="selectedPillar.key === 'contentStructure'">
            <div class="seo-extra" v-if="payload.harmonia.schema.detected.length">
              <h3>Schema.org detected</h3>
              <ul class="schema-list">
                <li v-for="(n, i) in payload.harmonia.schema.detected" :key="i" :class="n.valid ? 'passed' : 'failed'">
                  <span class="check-icon"><Icon :name="n.valid ? 'check' : 'x'" /></span> {{ n.type || 'Unrecognized type' }}
                  <span class="schema-issues" v-if="n.issues.length">— {{ n.issues.join('; ') }}</span>
                </li>
              </ul>
            </div>
            <div class="seo-extra" v-if="payload.harmonia.schema.opportunities.length">
              <h3>Schema opportunities</h3>
              <div class="schema-opportunity" v-for="(o, i) in payload.harmonia.schema.opportunities" :key="i">
                <div class="schema-opportunity-head-row">
                  <div class="schema-opportunity-head">{{ o.type }}</div>
                  <button type="button" class="copy-schema-button" @click="copySchema(o.example, i)">
                    {{ copiedSchemaIndex === i ? 'Copied' : 'Copy' }}
                  </button>
                </div>
                <p class="schema-opportunity-reason">{{ o.reason }}</p>
                <pre class="schema-opportunity-example"><code>{{ o.example }}</code></pre>
              </div>
            </div>
          </template>

          <template v-if="selectedPillar.key === 'uxSignals'">
            <div class="seo-extra" v-if="payload.harmonia.coreWebVitals">
              <h3>Core Web Vitals (mobile)</h3>
              <div class="cwv-row">
                <span class="cwv-metric" :class="`cwv-${cwvRating('lcpMs', payload.harmonia.coreWebVitals.lcpMs)}`">LCP {{ formatSeconds(payload.harmonia.coreWebVitals.lcpMs) }}</span>
                <span class="cwv-metric" :class="`cwv-${cwvRating('clsScore', payload.harmonia.coreWebVitals.clsScore)}`">CLS {{ payload.harmonia.coreWebVitals.clsScore ?? '—' }}</span>
                <span class="cwv-metric" :class="`cwv-${cwvRating('inpMs', payload.harmonia.coreWebVitals.inpMs)}`">INP {{ payload.harmonia.coreWebVitals.inpMs !== null ? formatSeconds(payload.harmonia.coreWebVitals.inpMs) : 'no field data' }}</span>
              </div>
            </div>
            <div class="seo-extra" v-if="extraPsiScores.some((s) => s.score !== null) || additionalAuditRows.length">
              <h3>Additional Lighthouse checks (mobile)</h3>
              <div class="cwv-row" v-if="extraPsiScores.some((s) => s.score !== null)">
                <span v-for="s in extraPsiScores" v-show="s.score !== null" :key="s.key" class="cwv-metric" :class="`band-${s.band}`">{{ s.label }} {{ s.score }}</span>
              </div>
              <ul class="harmonia-checklist" v-if="additionalAuditRows.length">
                <li v-for="a in additionalAuditRows" :key="a.id" :class="a.passed ? 'passed' : 'failed'">
                  <span class="check-icon"><Icon :name="a.passed ? 'check' : 'x'" /></span> {{ a.label }}
                </li>
              </ul>
            </div>
          </template>
        </div>
      </div>

      <p class="harmonia-errors" v-if="payload.harmonia.errors.length">
        Some checks couldn't complete: {{ payload.harmonia.errors.join('; ') }}
      </p>
    </template>
    <p class="seo-unavailable" v-else-if="payload.completedCalls > 0 || payload.failedCalls > 0">
      Technical/SEO audit isn't available for this scan (ran before this feature shipped, or the site couldn't be reached).
    </p>
  </div>
</template>

<style scoped>
h3 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--muted); margin: 0 0 10px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; box-shadow: var(--shadow); }

.seo-summary-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
.seo-overall-score { font-size: 1.6rem; font-weight: 700; font-variant-numeric: proportional-nums; font-family: var(--font-display); color: var(--accent-2); }
.seo-overall-score .of100 { font-size: 0.85rem; color: var(--faint); font-weight: 500; }
.seo-summary-label { font-size: 0.82rem; color: var(--muted); flex: 1; min-width: 200px; }

.band-text-leading { color: var(--success-text); }
.band-text-visible { color: color-mix(in srgb, var(--warning) 70%, var(--fg)); }
.band-text-weak { color: var(--serious); }
.band-text-invisible { color: var(--critical); }
.band-text-unavailable { color: var(--muted); }
.board-fill.band-fill-leading { background: var(--good); }
.board-fill.band-fill-visible { background: var(--warning); }
.board-fill.band-fill-weak { background: var(--serious); }
.board-fill.band-fill-invisible { background: var(--critical); }
.board-fill.band-fill-unavailable { background: var(--faint); }
.board-track { height: 8px; border-radius: 4px; background: var(--gridline); overflow: hidden; margin-top: 6px; }
.board-fill { height: 100%; border-radius: 4px; }

/* Master-detail: normal document flow only, no overflow/max-height on
   either pane — same single-scroll-region rule as ReportGeoSection.vue. */
.seo-master-detail { display: block; }
.seo-master { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.seo-master-row {
  display: block; width: 100%; text-align: left;
  background: var(--card); border: 1px solid var(--border); border-left: 3px solid transparent;
  border-radius: 8px; padding: 10px 12px;
  color: var(--fg); font: inherit; cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.seo-master-row:hover { border-color: var(--accent-2); }
.seo-master-row.active { border-color: var(--accent-2); border-left-color: var(--accent-2); background: color-mix(in srgb, var(--accent-2) 7%, var(--card)); }
.seo-master-row-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.seo-master-label { font-size: 0.88rem; font-weight: 500; }
.seo-master-score { font-weight: 700; font-variant-numeric: proportional-nums; }
.seo-detail { padding: 20px; }
.seo-detail-label { font-size: 0.85rem; font-weight: 600; margin-bottom: 10px; }
.seo-pillar-empty { font-size: 0.82rem; color: var(--faint); font-style: italic; margin: 0; }

.harmonia-checklist { list-style: none; margin: 0; padding: 0; font-size: 0.85rem; }
.harmonia-checklist li { display: flex; align-items: baseline; gap: 6px; padding: 3px 0; color: var(--muted); }
.harmonia-checklist li.passed .check-icon { color: var(--success-text); }
.harmonia-checklist li.failed .check-icon { color: var(--critical); }
.check-icon { flex: none; font-weight: 700; display: inline-flex; align-items: center; }

.seo-extra { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }
.cwv-row { display: flex; flex-wrap: wrap; gap: 8px; }
.cwv-metric { font-size: 0.82rem; font-weight: 600; padding: 4px 10px; border-radius: 999px; background: color-mix(in srgb, var(--faint) 16%, transparent); color: var(--muted); }
.cwv-metric.cwv-good { background: color-mix(in srgb, var(--good) 18%, transparent); color: var(--success-text); }
.cwv-metric.cwv-needs-improvement { background: color-mix(in srgb, var(--warning) 20%, transparent); color: color-mix(in srgb, var(--warning) 70%, var(--fg)); }
.cwv-metric.cwv-poor { background: color-mix(in srgb, var(--critical) 16%, transparent); color: var(--critical); }
.cwv-metric.band-leading { background: color-mix(in srgb, var(--good) 18%, transparent); color: var(--success-text); }
.cwv-metric.band-visible { background: color-mix(in srgb, var(--warning) 20%, transparent); color: color-mix(in srgb, var(--warning) 70%, var(--fg)); }
.cwv-metric.band-weak { background: color-mix(in srgb, var(--serious) 18%, transparent); color: var(--serious); }
.cwv-metric.band-invisible { background: color-mix(in srgb, var(--critical) 16%, transparent); color: var(--critical); }
.cwv-metric.band-unavailable { background: color-mix(in srgb, var(--faint) 16%, transparent); color: var(--muted); }

.schema-list { list-style: none; margin: 0; padding: 0; font-size: 0.85rem; }
.schema-list li { display: flex; align-items: baseline; gap: 6px; padding: 4px 0; color: var(--muted); }
.schema-issues { color: var(--faint); font-size: 0.8rem; }
.schema-opportunity { margin-bottom: 16px; }
.schema-opportunity:last-child { margin-bottom: 0; }
.schema-opportunity-head-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.schema-opportunity-head { font-weight: 600; font-size: 0.88rem; margin-bottom: 2px; }
.copy-schema-button { font-size: 0.76rem; padding: 3px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--card); color: var(--muted); cursor: pointer; flex: none; }
.copy-schema-button:hover { color: var(--fg); border-color: var(--accent); }
.schema-opportunity-reason { font-size: 0.82rem; color: var(--muted); margin: 0 0 8px; }
.schema-opportunity-example {
  font-size: 0.78rem; font-family: ui-monospace, monospace; color: var(--muted);
  background: color-mix(in srgb, var(--fg) 4%, transparent);
  border: 1px solid var(--border); border-radius: 8px;
  padding: 10px 12px; overflow-x: auto; white-space: pre; margin: 0;
}
.harmonia-errors { font-size: 0.8rem; color: var(--faint); font-style: italic; margin: 16px 0 0; }
.seo-unavailable { color: var(--muted); font-size: 0.88rem; padding: 8px 0; }

@media (min-width: 700px) {
  .seo-master-detail { display: grid; grid-template-columns: 300px 1fr; gap: 20px; align-items: start; }
  .seo-master { margin-bottom: 0; position: sticky; top: 24px; }
}
</style>
