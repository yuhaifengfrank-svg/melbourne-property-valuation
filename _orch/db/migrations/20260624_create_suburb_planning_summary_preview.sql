-- ============================================================================
-- Migration: 20260624_create_suburb_planning_summary_preview
-- Environment: Stage / Preview Neon ONLY
-- Purpose: Pre-create suburb_planning_summary table before verify.
--          sync_artifact.py has ensure_table() with matching DDL,
--          but running this migration first allows WITHOUT ROWID safe-typing
--          and avoids script creating it on-the-fly during verify.
--
-- ⚠️  This DDL MUST match sync_artifact.py's VICPLAN_MONASH_DDL exactly.
--     Last verified: 2026-06-24 20:01 AEST | All 13 fields match artifact.
--
-- Artifact: vicplan_monash.json (953 rows, 13 fields)
-- Target table: suburb_planning_summary
-- Sync: INSERT OR IGNORE via sync_artifact.py --mode=sync --approve
-- ============================================================================

CREATE TABLE IF NOT EXISTS suburb_planning_summary (
    id              TEXT        PRIMARY KEY,
    zone_code       TEXT,
    zone_name       TEXT        NOT NULL,
    zone_short      TEXT,
    overlay         TEXT,
    address         TEXT,
    suburb          TEXT,
    state           TEXT        DEFAULT 'VIC',
    lga             TEXT        DEFAULT 'Monash',
    zone_colour     TEXT,
    data_source     TEXT        DEFAULT 'VicPlan',
    data_version    TEXT        DEFAULT '2025-Q1',
    scraped_at      TEXT
);

COMMENT ON TABLE  suburb_planning_summary IS 'VicPlan zone data from Oracle Data Factory Phase 1B artifact (vicplan_monash). Stage/Preview Neon only.';
COMMENT ON COLUMN suburb_planning_summary.id IS 'Unique record ID from artifact (e.g. page_1)';
COMMENT ON COLUMN suburb_planning_summary.zone_code IS 'Zone code (e.g. MON001_001)';
COMMENT ON COLUMN suburb_planning_summary.zone_name IS 'Human-readable zone name (e.g. General Residential Zone Schedule 1)';
COMMENT ON COLUMN suburb_planning_summary.zone_short IS 'Short zone code (e.g. GRZ1)';
COMMENT ON COLUMN suburb_planning_summary.overlay IS 'Planning overlay code (e.g. ESO2)';
COMMENT ON COLUMN suburb_planning_summary.suburb IS 'Suburb name (e.g. Chadstone)';
COMMENT ON COLUMN suburb_planning_summary.lga IS 'Local Government Area (e.g. Monash)';
COMMENT ON COLUMN suburb_planning_summary.zone_colour IS 'Hex colour for zone (e.g. #F4D03F)';
COMMENT ON COLUMN suburb_planning_summary.data_source IS 'Source system (default: VicPlan)';
COMMENT ON COLUMN suburb_planning_summary.scraped_at IS 'When this data was scraped from VicPlan';

-- Index for suburb lookups (primary query pattern)
CREATE INDEX IF NOT EXISTS idx_suburb_planning_summary_suburb ON suburb_planning_summary (suburb);

-- Index for zone_code lookups
CREATE INDEX IF NOT EXISTS idx_suburb_planning_summary_zone_code ON suburb_planning_summary (zone_code);

-- Index for LGA lookups
CREATE INDEX IF NOT EXISTS idx_suburb_planning_summary_lga ON suburb_planning_summary (lga);
