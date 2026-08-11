<script setup lang="ts">
// Static content only — no DB, no API calls. Reachable without auth (see
// router.ts), same reasoning as PrivacyView.vue.
</script>

<template>
  <main class="legal">
    <router-link class="back" to="/app">&larr; Back to AIVis</router-link>

    <h1>Terms of Service</h1>
    <p class="draft-note">
      Draft — have this reviewed before relying on it for compliance.
    </p>
    <p class="updated">Last updated: 2026-08-11</p>

    <section>
      <h2>1. Acceptance of these terms</h2>
      <p>
        By creating an account or using AIVis, you agree to these terms. If
        you don't agree, don't use the service.
      </p>
    </section>

    <section>
      <h2>2. What AIVis does</h2>
      <p>
        AIVis checks whether AI search tools (currently OpenAI and Google
        models, queried through Perplexity's grounded search API) mention a
        business when asked relevant category questions, and reports the
        result as a score you can track over time. See
        <router-link to="/app/how-it-works">How this works</router-link>
        for the full explanation of the methodology.
      </p>
    </section>

    <section>
      <h2>3. Plans and billing</h2>
      <p>
        AIVis offers a <strong>Free plan</strong> (limited to one company and
        a small number of total scans, no credit card required) and a
        <strong>Pro plan</strong> (unlimited companies and scans, billed on a
        recurring monthly basis). Pro subscriptions are billed and managed
        through Stripe. You can cancel your Pro subscription at any time;
        cancellation takes effect at the end of the current billing period,
        and we don't provide partial-period refunds except where required by
        law.
      </p>
    </section>

    <section>
      <h2>4. Scores are informational, not guaranteed</h2>
      <p>
        AIVis's detection is presence-only, not sentiment-aware — a negative
        or comparative mention of your business still counts as "cited."
        The visibility score is a heuristic weighting of that same
        presence-only detection, not an independently verified ranking, and
        each scan is a single point-in-time check of live AI model outputs
        that AIVis doesn't control and can't guarantee the accuracy,
        completeness, or consistency of. Use scores and advice as a
        directional signal to guide your own AI-search optimization work, not
        as a certified or warrantied measurement. Any advice generated
        (including AI-generated "deeper advice") is provided as-is and should
        be evaluated using your own judgment before you act on it.
      </p>
    </section>

    <section>
      <h2>5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use AIVis to scan or track a business without a legitimate reason
          for doing so (e.g. your own business or a competitor analysis).</li>
        <li>Attempt to bypass plan limits, rate limits, or authentication.</li>
        <li>Use the service to send abusive, illegal, or harmful content
          through our systems (including via company names, categories, or
          competitor fields).</li>
        <li>Attempt to disrupt, reverse-engineer, or overload the service.</li>
      </ul>
      <p>We may suspend or terminate accounts that violate these terms.</p>
    </section>

    <section>
      <h2>6. Your account</h2>
      <p>
        You're responsible for keeping your login credentials secure and for
        all activity under your account. Let us know immediately if you
        believe your account has been compromised.
      </p>
    </section>

    <section>
      <h2>7. Limitation of liability</h2>
      <p>
        AIVis is provided "as is," without warranties of any kind, express or
        implied. To the maximum extent permitted by law, we are not liable
        for any indirect, incidental, or consequential damages arising from
        your use of the service, including business decisions made based on a
        score or advice AIVis produced. Our total liability for any claim
        related to AIVis is limited to the amount you paid us in the twelve
        months before the claim arose.
      </p>
    </section>

    <section>
      <h2>8. Termination</h2>
      <p>
        You can stop using AIVis and delete your account at any time. We may
        suspend or terminate your access if you violate these terms or if
        required by law.
      </p>
    </section>

    <section>
      <h2>9. Changes to these terms</h2>
      <p>
        We may update these terms as the product changes. If changes are
        material, we'll update the "Last updated" date above. Continued use
        of AIVis after a change means you accept the updated terms.
      </p>
    </section>

    <section>
      <h2>10. Contact</h2>
      <p>
        Questions about these terms? Email
        <a href="mailto:dev@dizid.com">dev@dizid.com</a>.
      </p>
    </section>
  </main>
</template>

<style scoped>
.legal { max-width: 720px; margin: 0 auto; padding: 32px 20px 80px; }
.back { display: inline-block; margin-bottom: 24px; font-size: 0.88rem; color: var(--muted); text-decoration: none; }
.back:hover { text-decoration: underline; }
h1 { font-size: 1.7rem; margin: 0 0 8px; }
.draft-note {
  font-size: 0.88rem; font-weight: 600; color: var(--warning);
  background: color-mix(in srgb, var(--warning) 14%, transparent);
  border: 1px solid var(--warning); border-radius: 8px; padding: 10px 14px;
  margin: 0 0 8px; display: inline-block;
}
.updated { font-size: 0.82rem; color: var(--faint); margin: 0 0 32px; }
section { margin-bottom: 28px; }
h2 { font-size: 1.15rem; margin: 0 0 10px; }
p { color: var(--muted); margin: 0 0 12px; }
ul { color: var(--muted); margin: 0 0 12px; padding-left: 22px; }
li { margin-bottom: 8px; }
a { color: var(--accent); }
</style>
