<script setup lang="ts">
import { ref } from 'vue';

const step = ref<'step1' | 'step2'>('step1');

const passphrase1 = ref('');
const website1 = ref('');
const analyzing = ref(false);
const status1 = ref('');
const status1IsError = ref(false);

const passphrase2 = ref('');
const brand = ref('');
const website2 = ref('');
const competitors = ref('');
const category = ref('');
const useCase = ref('');
const region = ref('');
const customerSegment = ref('');
const prefillNote = ref('');
const submitting = ref(false);
const status2 = ref('');

function goToStep2() {
  passphrase2.value = passphrase1.value;
  website2.value = website1.value.trim();
  step.value = 'step2';
}

function skip() {
  prefillNote.value = '';
  goToStep2();
}

function back() {
  step.value = 'step1';
  status1.value = '';
  status1IsError.value = false;
}

async function analyze() {
  if (!passphrase1.value || !website1.value.trim()) {
    status1.value = 'Enter a passphrase and a website first.';
    status1IsError.value = true;
    return;
  }

  analyzing.value = true;
  status1.value = 'Asking Perplexity to research your business — do not close this tab.';
  status1IsError.value = false;

  try {
    const res = await fetch('/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ website: website1.value.trim(), passphrase: passphrase1.value }),
    });

    if (res.status === 403) {
      status1.value = 'Wrong passphrase.';
      status1IsError.value = true;
      return;
    }

    const data = await res.json();

    if (data.ok === false) {
      // Enrichment failed (timeout, API error, etc.) — never a dead end,
      // just fall through to a blank, manually-filled form.
      prefillNote.value = `Auto-fill didn't work (${data.error}) — fill in the fields below manually.`;
      goToStep2();
      return;
    }

    brand.value = data.brand || '';
    category.value = data.category || '';
    useCase.value = data.use_case || '';
    region.value = data.region || '';
    customerSegment.value = data.customer_segment || '';
    competitors.value = (data.competitors || []).join(', ');

    const guessedSomething =
      data.brand || data.category || data.use_case || data.region || data.customer_segment || (data.competitors || []).length;
    prefillNote.value = guessedSomething
      ? 'Pre-filled from your site — review and edit anything that looks off, then run the check.'
      : "Couldn't confidently determine most fields from your site — fill them in below.";

    goToStep2();
  } catch (err) {
    prefillNote.value = `Auto-fill didn't work (${(err as Error).message}) — fill in the fields below manually.`;
    goToStep2();
  } finally {
    analyzing.value = false;
    status1.value = '';
  }
}

// Native form POST (not fetch): the /scan function responds with a real
// 302 redirect to /result.html#d=<data>, and only a native browser
// navigation reliably carries the URL fragment through a redirect chain.
// This handler must NOT call preventDefault() — it only decorates the UI
// before the browser's own submission proceeds, so the disabled button and
// status text stay visible for the full ~20-30s the real navigation takes.
function onScanSubmit() {
  submitting.value = true;
  status2.value = 'Calling ChatGPT and Gemini via Perplexity — please wait, do not close this tab.';
}
</script>

<template>
  <main>
    <div class="wordmark-row">
      <div class="wordmark">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="10" cy="10" r="8.5" stroke="currentColor" stroke-width="2"></circle>
          <path d="M10 5.5v5l3.2 1.9" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
        </svg>
        AIVis
      </div>
      <a class="history-link" href="/history.html">History</a>
    </div>
    <h1>AI search visibility check</h1>
    <p class="sub">Runs 6 live checks across ChatGPT and Gemini (via Perplexity) and gives you a shareable result link. Takes ~20-30 seconds.</p>

    <!-- Step 1: just a URL + passphrase. We analyze the site and pre-fill the
         rest of the form in step 2 — nobody should have to type category,
         competitors, region, etc. by hand if the site already says it. -->
    <div class="card" v-show="step === 'step1'">
      <label>Passphrase</label>
      <input type="password" v-model="passphrase1" required autocomplete="off">

      <label>Your business website</label>
      <input type="text" v-model="website1" required placeholder="acmeplumbing.com">

      <button type="button" :disabled="analyzing" @click="analyze">
        {{ analyzing ? 'Analyzing your site (~15-20s)...' : 'Analyze my site' }}
      </button>
      <div class="row-links">
        <span></span>
        <button type="button" class="link" @click="skip">Skip — I'll fill it in manually</button>
      </div>
      <div class="status" :class="{ error: status1IsError }">{{ status1 }}</div>
    </div>

    <!-- Step 2: pre-filled (when analysis succeeds) but every field stays a
         plain editable input — auto-fill is a starting point, not the final
         answer, and the founder should be able to fix anything the model
         guessed wrong before spending API calls on the real scan. -->
    <form class="card" v-show="step === 'step2'" method="POST" action="/scan" @submit="onScanSubmit">
      <input type="hidden" name="passphrase" :value="passphrase2">

      <div class="prefill-note">{{ prefillNote }}</div>

      <label>Brand name</label>
      <input type="text" name="brand" v-model="brand" required>

      <label>Website <span class="hint">(bare domain or full URL)</span></label>
      <input type="text" name="website" v-model="website2" required placeholder="acmeplumbing.com">

      <label>Competitors <span class="hint">(comma-separated, 2-3)</span></label>
      <input type="text" name="competitors" v-model="competitors" required placeholder="Bob's Pipes, QuickFlow Plumbing">

      <label>Category</label>
      <input type="text" name="category" v-model="category" required placeholder="emergency plumber">

      <label>Use case</label>
      <input type="text" name="use_case" v-model="useCase" required placeholder="a burst pipe at home">

      <label>Region</label>
      <input type="text" name="region" v-model="region" required placeholder="Rotterdam">

      <label>Customer segment</label>
      <input type="text" name="customer_segment" v-model="customerSegment" required placeholder="homeowners">

      <button type="submit" :disabled="submitting">
        {{ submitting ? 'Running checks (~20-30s)...' : 'Run check' }}
      </button>
      <div class="row-links">
        <button type="button" class="link" @click="back">← back</button>
        <span></span>
      </div>
      <div class="status">{{ status2 }}</div>
    </form>
  </main>
</template>

<style scoped>
main {
  max-width: 560px;
  margin: 0 auto;
  padding: 48px 20px 80px;
}
.wordmark {
  display: flex; align-items: center; gap: 8px;
  font-weight: 700; font-size: 0.95rem; letter-spacing: 0.01em;
  color: var(--muted); margin-bottom: 24px;
}
.wordmark svg { flex: none; }
.wordmark-row { display: flex; justify-content: space-between; align-items: center; }
.history-link { font-size: 0.85rem; color: var(--muted); text-decoration: underline; }
h1 { font-size: 1.5rem; margin-bottom: 4px; }
p.sub { color: var(--muted); margin-top: 0; margin-bottom: 32px; }
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 8px 20px 20px;
}
label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  margin-top: 18px;
  margin-bottom: 6px;
}
label .hint { font-weight: 400; color: var(--muted); }
input {
  width: 100%;
  padding: 10px 12px;
  font-size: 1rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--fg);
}
input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
button {
  margin-top: 28px;
  width: 100%;
  padding: 12px 16px;
  font-size: 1rem;
  font-weight: 600;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
}
button:disabled { opacity: 0.6; cursor: wait; }
.status { margin-top: 16px; font-size: 0.9rem; color: var(--muted); min-height: 1.2em; }
.status.error { color: var(--critical); }
.row-links {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  font-size: 0.85rem;
}
.row-links a { color: var(--muted); }
.row-links button.link {
  background: none; border: none; padding: 0; margin: 0;
  color: var(--muted); text-decoration: underline; cursor: pointer;
  font-size: 0.85rem; width: auto;
}
.prefill-note {
  font-size: 0.82rem; color: var(--muted); margin-top: -10px; margin-bottom: 4px;
}
</style>
