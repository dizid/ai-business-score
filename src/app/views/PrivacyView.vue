<script setup lang="ts">
// Static content only — no DB, no API calls. Reachable without auth (see
// router.ts) since a privacy policy has to be readable before someone signs
// up, not just after.
</script>

<template>
  <main class="legal">
    <router-link class="back" to="/app">&larr; Back to AIVis</router-link>

    <h1>Privacy Policy</h1>
    <p class="draft-note">
      Draft — have this reviewed before relying on it for compliance.
    </p>
    <p class="updated">Last updated: 2026-08-11</p>

    <section>
      <h2>Overview</h2>
      <p>
        AIVis ("we", "us") is a small, self-serve tool that checks whether AI
        search tools like ChatGPT and Gemini mention your business, and tracks
        that over time. This policy explains what we collect, why, and how
        it's handled.
      </p>
    </section>

    <section>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Account information</strong> — your email address, used for login and account
          identification via Neon Auth.</li>
        <li><strong>Company data you enter</strong> — brand name, website, category, competitors,
          use case, region, and customer segment for each company you add.
          This is the data used to run scans; you control what's entered.</li>
        <li><strong>Scan results</strong> — the AI models' responses to our prompts, the resulting
          visibility score, competitor tallies, and any advice generated from
          that scan.</li>
        <li><strong>Payment information</strong> — if you upgrade to a paid plan, Stripe collects
          and processes your card details directly. AIVis never sees or
          stores your card number; we only receive a subscription/payment
          status from Stripe.</li>
      </ul>
    </section>

    <section>
      <h2>How we use it</h2>
      <ul>
        <li>Running the AI-visibility scans you request, which involves sending
          your company/category/competitor data to AI models via Perplexity's
          API so it can generate grounded, web-search-backed answers.</li>
        <li>Computing and displaying your visibility score and scan history.</li>
        <li>Billing and subscription management, handled through Stripe.</li>
        <li>Operating, maintaining, and improving the product — for example,
          diagnosing a failed scan.</li>
      </ul>
      <p>
        We do not sell your data, and we do not use it to train AI models of
        our own.
      </p>
    </section>

    <section>
      <h2>Who we share it with</h2>
      <p>These service providers process data on our behalf, only as needed to run AIVis:</p>
      <ul>
        <li><strong>Perplexity AI</strong> — receives the prompts built from your company data to run
          grounded searches against AI models. This is the core of how a scan
          works.</li>
        <li><strong>Stripe</strong> — handles all payment processing for paid plans. AIVis never
          stores your card number or full payment details.</li>
        <li><strong>Neon</strong> — hosts our database and authentication (login/session) system.</li>
        <li><strong>Netlify</strong> — hosts the application and runs its backend functions.</li>
      </ul>
      <p>We don't share your data with anyone else, and never for advertising purposes.</p>
    </section>

    <section>
      <h2>Data retention</h2>
      <p>
        We keep your account and company/scan data for as long as your account
        is active, so you can see your visibility trend over time. If you want
        your account and its data deleted, contact us (below) and we'll remove
        it, aside from records we're legally required to keep (e.g. billing
        records for tax purposes).
      </p>
    </section>

    <section>
      <h2>Security</h2>
      <p>
        Data is encrypted in transit (HTTPS) between your browser, our
        servers, and our providers. Access to the underlying database is
        restricted to what the application needs to function. No system is
        perfectly secure, but we take reasonable, industry-standard measures
        to protect your data.
      </p>
    </section>

    <section>
      <h2>Your rights</h2>
      <p>
        You can request a copy of your data, ask us to correct it, or ask us
        to delete your account entirely at any time by contacting us below.
      </p>
    </section>

    <section>
      <h2>Changes to this policy</h2>
      <p>
        If this policy changes materially, we'll update the "Last updated"
        date above. Continued use of AIVis after a change means you accept
        the updated policy.
      </p>
    </section>

    <section>
      <h2>Contact</h2>
      <p>
        Questions about this policy or your data? Email
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
