# CLAUDE.md — src/shared/

Scoped guidance for `src/shared/`, split out of the project root
`CLAUDE.md` on 2026-08-17 (via `/doctor`) so it only loads when a session
actually touches this directory, instead of every session paying for it.
See the root `CLAUDE.md` for overall project context.

### `src/shared/scanPayload.ts` + `src/shared/ScanDetail.vue`

Reused across every scan-rendering surface: `result/App.vue`,
`CompanyDetailView.vue`'s detail pane. `scanPayload.ts` holds the types and
`validatePayload()` — fail-closed validation of a scan-result object, since
`result.html`'s payload is inherently unsigned/forgeable (anyone can craft a
`#d=` link) and `CompanyDetailView.vue`'s DB-backed data gets the same
treatment for consistency and bounds-safety. `id` is now a required field
(added for Milestone 6's deep-advice button, which needs to know which scan
to POST to) — confirmed backward compatible since `scan.mts` has always
included `id` in every payload it ever produced, including pre-pivot links
still live in the wild. `deepAdvice`/`deepAdviceGeneratedAt` are optional —
missing, `null`, or malformed all degrade to `null` rather than rejecting
the whole payload, since deep advice is a bonus on top of the always-present
rule-based advice.

`ScanDetail.vue` renders everything from the brand/website header through
the score ring, scoreboard, advice cards, deep-advice section, raw-response
`<details>`, and footer. Its one deliberate exception to "purely
presentational, no other props, no emits" is `allowDeepAdvice`/
`deepAdviceLoading` props plus a `generate-deep-advice` emit — `result/App.vue`
never sets `allowDeepAdvice` (no auth system there), so the button only ever
appears in the authenticated app; the component itself stays auth-agnostic,
`CompanyDetailView.vue` owns the actual fetch call.
