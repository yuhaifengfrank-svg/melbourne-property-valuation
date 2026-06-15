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
--   - Checks for duplicate non-NULL draft_id before modifying indexes.
--   - Fails explicitly if duplicates exist — never auto-merges or deletes data.
--   - Uses a transaction with ACCESS EXCLUSIVE lock on report_snapshots
--     during the index swap to avoid a no-uniqueness window.
--   - Idempotent: second run does nothing (partial index already gone,
--     full index already exists).
--   - Does not modify snapshot, payment or entitlement business data.

BEGIN;

-- Step 1: Check for duplicate non-NULL draft_id
DO $$
DECLARE
  dup_count INTEGER;
  dup_records TEXT;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT draft_id FROM report_snapshots
    WHERE draft_id IS NOT NULL
    GROUP BY draft_id
    HAVING COUNT(*) > 1
  ) dups;

  IF dup_count > 0 THEN
    SELECT string_agg(draft_id, ', ') INTO dup_records
    FROM (
      SELECT draft_id FROM report_snapshots
      WHERE draft_id IS NOT NULL
      GROUP BY draft_id
      HAVING COUNT(*) > 1
    ) dups;
    RAISE EXCEPTION 'Migration 011 failed: found % duplicate non-NULL draft_id(s): %. Manual cleanup required before migration.', dup_count, dup_records;
  END IF;
END $$;

-- Step 2: Drop the old partial unique index (safe — IF EXISTS)
DROP INDEX IF EXISTS idx_rs_draft_id;

-- Step 3: Create the full unique index (supports ON CONFLICT (draft_id))
CREATE UNIQUE INDEX IF NOT EXISTS idx_rs_draft_id ON report_snapshots (draft_id);

COMMIT;
