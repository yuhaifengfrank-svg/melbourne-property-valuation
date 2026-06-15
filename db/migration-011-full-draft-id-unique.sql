-- Migration 011: Full unique index on report_snapshots(draft_id)
--
-- Phase 1B originally created a partial unique index:
--   CREATE UNIQUE INDEX … ON report_snapshots (draft_id) WHERE draft_id IS NOT NULL
--
-- This partial index does NOT support INSERT … ON CONFLICT (draft_id).
-- PostgreSQL requires a full (non-partial) unique index or constraint for ON CONFLICT.
--
-- This migration replaces the partial index with a full unique index.
-- PostgreSQL UNIQUE allows multiple NULL rows (NULL ≠ NULL), so historical
-- rows with draft_id IS NULL are not a problem.
--
-- Safety:
--   - ACCESS EXCLUSIVE LOCK prevents concurrent writes during the swap.
--   - Checks for duplicate non-NULL draft_id before modifying indexes.
--   - Fails explicitly if duplicates exist — never auto-merges or deletes data.
--   - Error message reports the count only; never outputs full draft_id values.
--   - Idempotent: second run does nothing — DROP IF EXISTS already done,
--     full unique index already exists (IF NOT EXISTS).
--   - Does not modify snapshot, payment or entitlement business data.
--   - Does not touch lead_contacts or any customer-funnel table.

BEGIN;

-- Step 1: Lock the table before any check or index change.
-- ACCESS EXCLUSIVE prevents all concurrent reads and writes during the
-- no-uniqueness window between DROP and CREATE.  The lock is held for
-- the remaining duration of the transaction.
LOCK TABLE report_snapshots IN ACCESS EXCLUSIVE MODE;

-- Step 2: Check for duplicate non-NULL draft_id.
-- If duplicates exist, fail explicitly.  Never auto-merge or delete data.
-- Only the count is reported; individual draft_id values are never
-- included in the error message to avoid leaking internal identifiers.
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT draft_id FROM report_snapshots
    WHERE draft_id IS NOT NULL
    GROUP BY draft_id
    HAVING COUNT(*) > 1
  ) dups;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Migration 011 failed: found % duplicate non-NULL draft_id(s). Manual cleanup required before migration.', dup_count;
  END IF;
END $$;

-- Step 3: Drop the old partial unique index (safe — IF EXISTS)
DROP INDEX IF EXISTS idx_rs_draft_id;

-- Step 4: Create the full unique index (supports ON CONFLICT (draft_id))
CREATE UNIQUE INDEX IF NOT EXISTS idx_rs_draft_id ON report_snapshots (draft_id);

COMMIT;
