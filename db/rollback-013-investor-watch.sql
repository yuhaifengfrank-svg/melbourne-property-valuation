-- Investor Watch V1 rollback. This deletes Investor Watch data only.
BEGIN;
DROP TABLE IF EXISTS investor_watch_notification_preferences;
DROP TABLE IF EXISTS investor_watch_change_events;
DROP TABLE IF EXISTS investor_watch_score_history;
DROP TABLE IF EXISTS investor_watch_items;
DROP TABLE IF EXISTS investor_watch_memberships;
DROP TABLE IF EXISTS member_sessions;
DROP TABLE IF EXISTS member_login_tokens;
COMMIT;
