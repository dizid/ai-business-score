<script setup lang="ts">
// Static content only — no DB, no API calls. Reachable without auth (see
// router.ts) so it can be shared/linked to prospects who haven't signed up
// yet, and read by anyone deciding whether to trust the score.
</script>

<template>
  <main class="legal">
    <router-link class="back" to="/app">&larr; Back to AIVis</router-link>

    <h1>How AIVis works</h1>
    <p class="lead">
      A plain explanation of what "AI search visibility" means, how a scan
      actually works under the hood, and what to do if your score comes back
      low.
    </p>

    <section>
      <h2>What is AI search visibility?</h2>
      <p>
        More people now ask ChatGPT, Gemini, and similar tools questions like
        "what's the best accountant near me" or "who does custom furniture in
        Rotterdam" instead of typing them into Google. Those AI answers don't
        return a list of ten blue links you can scan for your own name — they
        return a short, confident paragraph that either mentions your
        business, mentions a competitor instead, or mentions neither.
      </p>
      <p>
        <strong>AI search visibility</strong> is whether your business shows
        up in those AI-generated answers. It's the same underlying idea as
        traditional SEO (does Google rank you?), applied to a different
        surface — one where there's no results page to check by hand, because
        the "result" is a sentence a model generated on the fly.
      </p>
    </section>

    <section>
      <h2>How a scan works</h2>
      <p>
        When you run a scan, AIVis sends <strong>10 different prompts</strong>
        — phrased the way a real customer would actually ask, not just "tell
        me about {your brand}" — to <strong>2 AI models</strong>
        (OpenAI's GPT-5 mini and Google's Gemini 3 Flash), for
        <strong>20 checks total</strong> per scan. Some prompts ask for a
        recommendation directly ("what's the best X for Y?"), some ask for a
        comparison against your named competitors, some ask "who are the
        leaders in X category?" — covering the range of ways someone
        genuinely deciding between options might ask.
      </p>
      <p>
        Both models are queried through <strong>Perplexity's grounded search
        API</strong>, which means each answer is backed by a live web search
        rather than only the model's static training data — closer to what a
        real user would see today than asking a model in isolation.
      </p>
      <p>
        For each of the 20 responses, AIVis checks whether your brand name
        (or a domain-derived alias) is mentioned, whether it's the
        <em>first</em> business mentioned, and which competitors — if any —
        appear instead or alongside it. This is <strong>presence
        detection</strong>, not sentiment analysis: a mention is a mention,
        whether the model recommended you enthusiastically or brought you up
        only to say a competitor is better. Detection is intentionally
        conservative — very short or common-word brand names are flagged as
        ambiguous rather than guessed at, since a naive text match on a name
        like "Best" would match almost every response regardless of whether
        your business was actually meant.
      </p>
    </section>

    <section>
      <h2>How the 0-100 score is calculated</h2>
      <p>
        Across the checks that actually completed (a failed API call isn't
        counted as "invisible" — it's excluded, since we don't have data
        either way), the score weights being <strong>ranked first</strong>
        most heavily, with partial credit for being <strong>mentioned but
        beaten</strong> by a competitor named first — being in the
        conversation at all is a real signal, just a weaker one than being
        the top answer. Never being mentioned earns nothing. The bands you'll
        see on your dashboard:
      </p>
      <ul>
        <li><strong>Leading (80-100)</strong> — you're the first answer in most checks.</li>
        <li><strong>Visible (50-79)</strong> — you show up regularly, sometimes first.</li>
        <li><strong>Weak (1-49)</strong> — you're mentioned occasionally, rarely first.</li>
        <li><strong>Invisible (0)</strong> — not mentioned in any completed check.</li>
      </ul>
      <p>
        If every check in a scan fails (a real outage, not a real result),
        AIVis shows no score at all rather than a misleading 0 — a 0 always
        means "checked and genuinely not mentioned," never "we couldn't
        check."
      </p>
    </section>

    <section>
      <h2>What to do with a low score</h2>
      <p>
        A low score means AI models don't currently associate your business
        with the questions your customers are actually asking. A few
        directions that tend to help:
      </p>
      <ul>
        <li><strong>Check what these models are actually reading.</strong> Since
          answers are grounded in live web search, models tend to lean on
          sources that are easy to find and clearly written — review sites,
          industry directories, comparison articles, and your own site's
          content. If those sources don't mention you clearly, an AI model
          has nothing to cite.</li>
        <li><strong>Make your own site answer the question directly.</strong> Content
          that plainly states what you do, who it's for, and how you compare
          to alternatives is easier for a grounded search to pick up than
          vague marketing copy.</li>
        <li><strong>Look at who's beating you.</strong> Your scan's competitor
          breakdown shows which competitors get cited instead, and how often
          — that's a direct signal of who the AI models currently consider
          the default answer in your category.</li>
        <li><strong>Track it over time, not just once.</strong> A single scan is a
          snapshot; AI models' outputs shift as the web changes. Re-scanning
          periodically shows whether changes you make are actually moving the
          needle.</li>
        <li><strong>Use the deeper advice on a scan.</strong> Completed scans can
          generate a grounded, scan-specific breakdown of what's driving your
          result and what to focus on first, instead of generic SEO advice.</li>
      </ul>
    </section>

    <section>
      <h2>Limitations, honestly stated</h2>
      <p>
        AI model outputs aren't fully deterministic or fully within anyone's
        control, including ours. A score reflects a real check against real
        model outputs at a real point in time — it's a strong directional
        signal, not a certified measurement, and it can shift between scans
        even with nothing changed on your end. Treat it the way you'd treat
        any single analytics snapshot: useful, worth tracking over time, and
        not the whole picture on its own.
      </p>
    </section>
  </main>
</template>

<style scoped>
.legal { max-width: 720px; margin: 0 auto; padding: 32px 20px 80px; }
.back { display: inline-block; margin-bottom: 24px; font-size: 0.88rem; color: var(--muted); text-decoration: none; }
.back:hover { text-decoration: underline; }
h1 { font-size: 1.7rem; margin: 0 0 8px; }
.lead { color: var(--muted); font-size: 1.02rem; margin: 0 0 32px; }
section { margin-bottom: 28px; }
h2 { font-size: 1.15rem; margin: 0 0 10px; }
p { color: var(--muted); margin: 0 0 12px; }
ul { color: var(--muted); margin: 0 0 12px; padding-left: 22px; }
li { margin-bottom: 10px; }
strong { color: var(--fg); }
a { color: var(--accent); }
</style>
