# CLAUDE.md — proof-script/

Scoped guidance for `proof-script/`, split out of the project root
`CLAUDE.md` on 2026-08-17 (via `/doctor`) so it only loads when a session
actually touches this directory, instead of every session paying for it.
See the root `CLAUDE.md` for overall project context.

### `proof-script/index.mjs` (Approach A)

Unchanged by the SaaS pivot — hand-rolled arg parser and `.env` loader, fail-fast
+ retry (`FailFastTracker`, `callWithRetry`), a concurrency-limited runner
(`runWithConcurrency`), and output formatting (`formatInternalSummary`,
`csvRow`) into `results/`/`tracking.csv` (gitignored). `node
proof-script/index.mjs --dry-run` is the standing regression check, re-run
after every change to `shared/aivis-core.mjs` regardless of which consumer
motivated the change.
