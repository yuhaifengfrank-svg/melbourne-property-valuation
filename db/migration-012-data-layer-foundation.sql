-- ═══════════════════════════════════════════════════════════════
-- Migration 012: Data Layer Foundation (Phase 0)
--
-- Creates three lightweight derived tables:
--   1. data_source_registry     — metadata & version tracking per source
--   2. suburb_planning_summary  — pre-computed suburb-level planning signals
--   3. property_planning_cache  — cached planning signal per property-key
--
-- No DROP / TRUNCATE / DELETE.
-- No ALTER of existing vicplan_zones / vicplan_overlays.
-- No geometry columns.
-- ═══════════════════════════════════════════════════════════════

-- ── A. data_source_registry ──────────────────────────────────
CREATE TABLE IF NOT EXISTS data_source_registry (
    id              BIGSERIAL PRIMARY KEY,
    source_key      TEXT NOT NULL UNIQUE,
    source_name     TEXT NOT NULL,
    source_type     TEXT NOT NULL,
    source_url      TEXT,
    source_version  TEXT,
    downloaded_at   TIMESTAMPTZ,
    processed_at    TIMESTAMPTZ,
    file_hash       TEXT,
    storage_location TEXT,
    coverage_area   TEXT,
    row_count       INTEGER,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_source_type CHECK (
        source_type IN ('gis', 'macro', 'census', 'sales', 'school', 'planning')
    )
);

CREATE INDEX IF NOT EXISTS idx_dsr_source_key ON data_source_registry (source_key);
CREATE INDEX IF NOT EXISTS idx_dsr_source_type ON data_source_registry (source_type);

-- ── B. suburb_planning_summary ───────────────────────────────
CREATE TABLE IF NOT EXISTS suburb_planning_summary (
    id                          BIGSERIAL PRIMARY KEY,
    suburb                      TEXT NOT NULL,
    state                       TEXT NOT NULL DEFAULT 'VIC',
    lga                         TEXT,
    dominant_zone_code          TEXT,
    dominant_zone_category      TEXT,
    dominant_zone_flexibility   TEXT,
    overlay_count               INTEGER NOT NULL DEFAULT 0,
    overlay_codes               TEXT[],
    has_design_overlay          BOOLEAN NOT NULL DEFAULT FALSE,
    has_flood_overlay           BOOLEAN NOT NULL DEFAULT FALSE,
    has_bushfire_overlay        BOOLEAN NOT NULL DEFAULT FALSE,
    has_environment_overlay     BOOLEAN NOT NULL DEFAULT FALSE,
    has_development_plan_overlay BOOLEAN NOT NULL DEFAULT FALSE,
    heritage_status             TEXT NOT NULL DEFAULT 'unknown',
    planning_constraint_level   TEXT,
    redevelopment_flexibility_score INTEGER,
    manual_review_required      BOOLEAN NOT NULL DEFAULT TRUE,
    source_key                  TEXT,
    source_version              TEXT,
    derived_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_heritage_status CHECK (heritage_status IN ('known', 'partial', 'unknown')),
    CONSTRAINT chk_constraint_level CHECK (
        planning_constraint_level IS NULL OR
        planning_constraint_level IN ('low', 'medium', 'high', 'unknown')
    ),
    CONSTRAINT chk_flexibility_score CHECK (
        redevelopment_flexibility_score IS NULL OR
        (redevelopment_flexibility_score >= -15 AND redevelopment_flexibility_score <= 15)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sps_suburb_state
    ON suburb_planning_summary (suburb, state);
CREATE INDEX IF NOT EXISTS idx_sps_dominant_zone
    ON suburb_planning_summary (dominant_zone_code);
CREATE INDEX IF NOT EXISTS idx_sps_constraint
    ON suburb_planning_summary (planning_constraint_level);

-- ── C. property_planning_cache ───────────────────────────────
CREATE TABLE IF NOT EXISTS property_planning_cache (
    id                          BIGSERIAL PRIMARY KEY,
    property_key                TEXT NOT NULL UNIQUE,
    address                     TEXT,
    suburb                      TEXT,
    state                       TEXT NOT NULL DEFAULT 'VIC',
    lat                         NUMERIC(10,7),
    lng                         NUMERIC(10,7),
    zone_code                   TEXT,
    zone_category               TEXT,
    zone_flexibility            TEXT,
    overlay_codes               TEXT[],
    planning_constraint_level   TEXT,
    redevelopment_flexibility_hint TEXT,
    planning_component_score    INTEGER,
    heritage_status             TEXT NOT NULL DEFAULT 'unknown',
    manual_review_required      BOOLEAN NOT NULL DEFAULT TRUE,
    limitations                 TEXT[],
    source_key                  TEXT,
    source_version              TEXT,
    derived_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at                  TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_ppc_heritage CHECK (heritage_status IN ('known', 'partial', 'unknown')),
    CONSTRAINT chk_ppc_constraint CHECK (
        planning_constraint_level IS NULL OR
        planning_constraint_level IN ('low', 'medium', 'high', 'unknown')
    ),
    CONSTRAINT chk_ppc_component_score CHECK (
        planning_component_score IS NULL OR
        (planning_component_score >= -15 AND planning_component_score <= 15)
    )
);

CREATE INDEX IF NOT EXISTS idx_ppc_property_key
    ON property_planning_cache (property_key);
CREATE INDEX IF NOT EXISTS idx_ppc_suburb_state
    ON property_planning_cache (suburb, state);
CREATE INDEX IF NOT EXISTS idx_ppc_lat_lng
    ON property_planning_cache (lat, lng);

-- ═══════════════════════════════════════════════════════════════
-- End of migration 012
-- ═══════════════════════════════════════════════════════════════
