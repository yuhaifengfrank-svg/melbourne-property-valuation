-- Migration 006: SALM SA2 Labour Market Data
--
-- SALM (Small Area Labour Markets) provides quarterly SA2-level estimates
-- of labour force, unemployed persons, and unemployment rate.
-- Data source: Department of Employment and Workplace Relations (DEWR)
-- Period: December 2024 quarter (latest available)
--
-- This migration stores the raw SALM data and adds tracking columns
-- to suburb_metrics for data freshness.

BEGIN;

-- ───────────────────────────────────────────────────────────────────
-- Section 1: Create salm_sa2_data table
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salm_sa2_data (
  sa2_code        TEXT PRIMARY KEY,
  sa2_name        TEXT NOT NULL,
  latest_quarter  TEXT NOT NULL,            -- e.g. 'Dec-24'
  
  -- Latest quarter values (Dec-24)
  labour_force        INTEGER,
  unemployed          INTEGER,
  unemployment_rate   NUMERIC(5,2),
  
  -- Historical time series as JSONB
  -- Structure: { "Dec-10": { lf, unemp, rate }, "Mar-11": {...}, ... }
  historical_data     JSONB,
  
  -- Coverage metadata
  has_labour_force       BOOLEAN DEFAULT false,
  has_unemployed         BOOLEAN DEFAULT false,
  has_unemployment_rate  BOOLEAN DEFAULT false,
  quarters_available     INTEGER DEFAULT 0,
  
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE salm_sa2_data IS 'SALM quarterly SA2 labour market estimates from DEWR';
COMMENT ON COLUMN salm_sa2_data.sa2_code IS 'ABS 2021 ASGS SA2 9-digit code';
COMMENT ON COLUMN salm_sa2_data.latest_quarter IS 'Most recent quarter with data (e.g. Dec-24)';
COMMENT ON COLUMN salm_sa2_data.labour_force IS 'Smoothed labour force (persons) — latest quarter';
COMMENT ON COLUMN salm_sa2_data.unemployed IS 'Smoothed unemployed (persons) — latest quarter';
COMMENT ON COLUMN salm_sa2_data.unemployment_rate IS 'Smoothed unemployment rate (%) — latest quarter';
COMMENT ON COLUMN salm_sa2_data.historical_data IS 'Full quarterly time series as JSONB';

-- Index for suburb → SA2 lookups
CREATE INDEX IF NOT EXISTS salm_sa2_code_idx ON salm_sa2_data (sa2_code);

-- ───────────────────────────────────────────────────────────────────
-- Section 2: Add SALM tracking columns to suburb_metrics
-- ───────────────────────────────────────────────────────────────────

-- Track which quarter the SALM data came from
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS supply_unemployment_quarter TEXT;

COMMENT ON COLUMN suburb_metrics.supply_unemployment_quarter IS 'SALM data quarter label (e.g. Dec-24) — tracks freshness of unemployment data';

COMMIT;
