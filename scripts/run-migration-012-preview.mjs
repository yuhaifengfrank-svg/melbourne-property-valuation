#!/usr/bin/env node
/**
 * Run migration-012 against the verified Preview database only.
 *
 * Required env:
 *   PREVIEW_DATABASE_URL=postgresql://...
 *
 * Safety:
 * - Refuses known production/main endpoint.
 * - Uses explicit tagged-template DDL, not raw full-file execution.
 * - Verifies all three tables exist before reporting success.
 */

import { neon } from "@neondatabase/serverless";

const url = process.env.PREVIEW_DATABASE_URL;
if (!url) throw new Error("PREVIEW_DATABASE_URL is not set");

const parsed = new URL(url);
if (!parsed.hostname.includes("neon.tech")) {
  throw new Error("Not a Neon URL");
}
if (parsed.hostname.includes("ep-winter-band-a7qym6bq")) {
  throw new Error("Refusing to run migration against production/main endpoint");
}

const sql = neon(url);

async function tableStatus() {
  const rows = await sql`
    select
      to_regclass('public.data_source_registry') as data_source_registry,
      to_regclass('public.suburb_planning_summary') as suburb_planning_summary,
      to_regclass('public.property_planning_cache') as property_planning_cache
  `;
  return rows[0];
}

console.log("Target host:", parsed.hostname);
console.log("Before:", await tableStatus());

await sql`
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
  )
`;

await sql`
  CREATE INDEX IF NOT EXISTS idx_dsr_source_key
      ON data_source_registry (source_key)
`;

await sql`
  CREATE INDEX IF NOT EXISTS idx_dsr_source_type
      ON data_source_registry (source_type)
`;

await sql`
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
  )
`;

await sql`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_sps_suburb_state
      ON suburb_planning_summary (suburb, state)
`;

await sql`
  CREATE INDEX IF NOT EXISTS idx_sps_dominant_zone
      ON suburb_planning_summary (dominant_zone_code)
`;

await sql`
  CREATE INDEX IF NOT EXISTS idx_sps_constraint
      ON suburb_planning_summary (planning_constraint_level)
`;

await sql`
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
  )
`;

await sql`
  CREATE INDEX IF NOT EXISTS idx_ppc_property_key
      ON property_planning_cache (property_key)
`;

await sql`
  CREATE INDEX IF NOT EXISTS idx_ppc_suburb_state
      ON property_planning_cache (suburb, state)
`;

await sql`
  CREATE INDEX IF NOT EXISTS idx_ppc_lat_lng
      ON property_planning_cache (lat, lng)
`;

const after = await tableStatus();
console.log("After:", after);

const ok = after.data_source_registry
  && after.suburb_planning_summary
  && after.property_planning_cache;

if (!ok) throw new Error("MIGRATION_012_FAILED_TABLES_STILL_MISSING");

console.log("MIGRATION_012_PREVIEW_OK");
