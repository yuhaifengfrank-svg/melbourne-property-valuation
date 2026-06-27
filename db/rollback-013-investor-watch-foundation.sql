-- ============================================================================
-- Rollback 013: Investor Watch Phase 1 foundation
--
-- DESTRUCTIVE: this removes all Phase 1 Investor Watch member/watchlist data.
-- Run only after an explicit environment check and approved rollback decision.
-- Existing lead_contacts and report_snapshots are not modified.
-- ============================================================================

BEGIN;

-- Reverse dependency order.
DROP TABLE IF EXISTS membership_report_usage;
DROP TABLE IF EXISTS investor_watch_items;
DROP TABLE IF EXISTS investor_watch_memberships;
DROP TABLE IF EXISTS member_sessions;
DROP TABLE IF EXISTS member_login_tokens;

COMMIT;

