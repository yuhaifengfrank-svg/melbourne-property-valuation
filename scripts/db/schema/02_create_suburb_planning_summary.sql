-- =============================================================================
-- Sync Target: Preview Neon
-- Table: suburb_planning_summary
--
-- Purpose: Per-suburb planning zone and overlay summary for AusHomeValue.
--          Used by Opportunity Engine and suburb detail pages.
--
-- Source: VicPlan vicplan_zones + vicplan_overlays (aggregated by suburb)
-- Sync artifact: vicplan_monash.json (planning_summary/)
--
-- NOTE: This table already exists on Preview Neon (Migration-012).
--       This DDL is for reference and future migration tracking only.
-- =============================================================================

-- Reference DDL (already created by Migration-012)
/*
CREATE TABLE IF NOT EXISTS suburb_planning_summary (
    id                              BIGSERIAL PRIMARY KEY,
    suburb                          TEXT NOT NULL,                  -- suburb name (e.g. 'Monash')
    state                           TEXT NOT NULL DEFAULT 'VIC',
    lga                             TEXT,                           -- local government area
    dominant_zone_code              TEXT,                           -- most common zone (e.g. 'GRZ', 'PPRZ')
    dominant_zone_category          TEXT,                           -- 'residential', 'commercial', 'industrial', etc.
    dominant_zone_flexibility       TEXT,                           -- 'high', 'medium', 'low', 'mixed'
    overlay_count                   INTEGER NOT NULL DEFAULT 0,
    overlay_codes                   TEXT[],                         -- array of overlay codes
    has_design_overlay              BOOLEAN NOT NULL DEFAULT FALSE,
    has_flood_overlay               BOOLEAN NOT NULL DEFAULT FALSE,
    has_bushfire_overlay            BOOLEAN NOT NULL DEFAULT FALSE,
    has_environment_overlay         BOOLEAN NOT NULL DEFAULT FALSE,
    has_development_plan_overlay    BOOLEAN NOT NULL DEFAULT FALSE,
    heritage_status                 TEXT NOT NULL DEFAULT 'unknown',
    planning_constraint_level       TEXT,                           -- 'low', 'medium', 'high', 'severe'
    redevelopment_flexibility_score INTEGER,                        -- 1-10 score
    manual_review_required          BOOLEAN NOT NULL DEFAULT TRUE,
    source_key                      TEXT,                           -- e.g. 'vicplan_monash_sample'
    source_version                  TEXT,
    derived_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);
*/

-- =============================================================================
-- Data Mapping (Phase 1 pilot: Monash LGA only)
--
-- vicplan_monash.json
--   zone_summary.dominant_zone
--     → dominant_zone_code
--   zone_summary.unique_zone_codes
--     → (for reference, not mapped to any column)
--   zone_summary.total_parcels
--     → (for reference, not mapped to any column)
--   zone_summary.records[].zone_code
--     → zone_code breakdown (suburb-level aggregation pending Phase 3)
--
-- Phase 1 sync approach:
--   Monash LGA → single row in suburb_planning_summary
--   suburb='Monash', lga='MONASH', dominant_zone_code=(from zone_summary.dominant_zone)
--   zone_code breakdown stored as JSONB in an optional raw_data column
--   or inserted as separate rows per zone_code
--
-- Phase 3 (full VicPlan) will expand this to all VIC suburbs.
-- =============================================================================
