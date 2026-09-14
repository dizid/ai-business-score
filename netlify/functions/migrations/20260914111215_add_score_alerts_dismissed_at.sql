-- Migration: 20260914111215_add_score_alerts_dismissed_at.sql
-- Date: 2026-09-14
-- Author: Claude (deep-research improvement pass, Phase 4b)
-- Applied via: Neon MCP (prepare_database_migration -> verify on temp branch -> complete_database_migration)
-- Why: score_alerts has no read/dismissed state (netlify/functions/CLAUDE.md's
--   score_alerts entry: "no read/dismissed state ... out of scope for that
--   pass"). Users can't dismiss a regression alert they've already acted on,
--   and companies.mts's dashboard "Alerts" widget has no way to distinguish
--   an acknowledged alert from a new one. Nullable/additive, same pattern as
--   every other migration on this table's siblings (harmonia, entity_presence,
--   etc.) -- existing rows default to NULL (never dismissed), no backfill needed.
-- Rollback: ALTER TABLE public.score_alerts DROP COLUMN dismissed_at;

ALTER TABLE public.score_alerts ADD COLUMN dismissed_at timestamptz;
