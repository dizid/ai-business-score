-- Migration: 20260916150000_add_monthly_scan_limit_override.sql
-- Date: 2026-09-16
-- Author: Claude Sonnet 5
-- Applied via: Neon MCP (prepare_database_migration -> verify on temp branch -> complete_database_migration)
-- Why: PRO_PLAN_MONTHLY_SCAN_LIMIT was dropped 50 -> 20 the same day (real
--   per-provider cost check found a scan can run $2-4; see plan.mts's own
--   comment and root CLAUDE.md's Deployment section for the full math).
--   Marc wants a handful of test accounts to run above that new cap without
--   raising it for every Pro user. Nullable/additive, same pattern as every
--   other per-row override in this schema (companies.scan_frequency,
--   companies.language, etc.) -- NULL means "use the global
--   PRO_PLAN_MONTHLY_SCAN_LIMIT constant", set means "use this number
--   instead". No code path writes this automatically; it's set by hand via
--   a direct UPDATE, same as the existing "manually granting a beta tester
--   Pro" pattern documented in netlify/functions/CLAUDE.md's Billing
--   section.
-- Rollback: ALTER TABLE public.user_profiles DROP COLUMN monthly_scan_limit_override;

ALTER TABLE public.user_profiles ADD COLUMN monthly_scan_limit_override integer;
