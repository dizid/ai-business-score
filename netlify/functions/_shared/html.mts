// HTML-escaping for hand-built HTML responses (report.mts). Netlify Functions
// have no templating engine in this repo — every DB-sourced string spliced
// into an HTML response (brand names, categories, competitor names, etc.)
// MUST go through this first. report.mts is public and unauthenticated, so a
// brand name containing `<script>` is a real stored-XSS vector against every
// visitor, including crawlers that render embedded scripts — this is the
// single most important file in the public-report workstream.
export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
