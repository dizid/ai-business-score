# Database migrations

Added 2026-09-12 (architecture refactor) to give schema changes a durable,
reviewable git history. **This does not change how migrations are
applied** — schema changes still go through the existing Neon MCP workflow
(`prepare_database_migration` → verify on a temp branch →
`complete_database_migration`), exactly as documented in the root
`netlify/functions/CLAUDE.md`. The only thing this adds is committing the
SQL text to this folder *before* running it, instead of the SQL living only
in prose in `CLAUDE.md` after the fact.

**Nothing in `npm run build`/CI auto-applies these files.** This is a
historical record and review artifact, not a Flyway/Prisma-style runner —
there is no migration-runner tool in this repo, deliberately (see the
architecture-refactor plan's "explicitly out of scope" section,
`~/.claude/plans/check-everythink-i-am-foamy-candle.md`).

## Naming

```
YYYYMMDDHHMMSS_short-description.sql
```

Sortable by filename, no separate counter file needed. Example:
`20260913090000_add_example_column.sql`.

## Header format

```sql
-- Migration: 20260913090000_add_example_column.sql
-- Date: 2026-09-13
-- Author: <name>
-- Applied via: Neon MCP (prepare_database_migration -> verify on temp branch -> complete_database_migration)
-- Why: <business/technical reason>
-- Rollback: <manual rollback SQL, or "not reversible: <why>">

ALTER TABLE public.companies ADD COLUMN example_field text;
```

## Process

1. Write the `.sql` file here first, with the header above filled in.
2. Apply it for real via the existing Neon MCP workflow — same mechanism
   already in use for every schema change to date, just with the SQL text
   committed to git first instead of only described in prose afterward.
3. Commit the file alongside (or right after) the code that depends on the
   new schema.

## What this does NOT cover

- **History before this folder existed** stays in the root
  `netlify/functions/CLAUDE.md`'s prose — not backfilled here.
- **Dormant schema artifacts** (`company_urls` table, `companies.is_public`
  column — see `netlify/functions/CLAUDE.md`'s Database schema section) are
  not touched by this convention's introduction; retroactively cleaning
  those up is a separate decision.
- **No automated runner.** Applying a file here still means going through
  Neon MCP by hand (or asking Claude to), same as always.
