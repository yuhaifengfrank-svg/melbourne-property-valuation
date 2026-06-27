-- =============================================================================
-- Sync Target: Preview Neon
-- Table: macro_indicators
--
-- Purpose: Store RBA macro time-series for AusHomeValue suburb valuation context.
--          Used by Opportunity Engine and suburb detail pages.
-- 
-- Source: RBA F1 (cash rate), G1 (CPI), H1 (GDP), H5 (labour force)
--         J1 (market forecasts)
-- Sync artifact: rba_macro_full.json (data/artifacts/macro_summary/rba_macro_full.json)
--
-- NOTE: This table already exists on Preview Neon.
--       This DDL is for reference and future migration tracking only.
--       Run: ALTER/INSERT, not CREATE.
-- =============================================================================

-- Reference DDL (already created by prior migration)
/*
CREATE TABLE IF NOT EXISTS macro_indicators (
    id              SERIAL PRIMARY KEY,
    indicator       TEXT NOT NULL,              -- e.g. 'cash_rate', 'cpi_yoy', 'gdp_yoy', 'unemployment_rate'
    value           NUMERIC NOT NULL,
    recorded_date   DATE NOT NULL,              -- date of the observation
    source          TEXT,                       -- e.g. 'RBA F1', 'RBA G1', 'RBA H1', 'RBA H5'
    fetched_at      TIMESTAMPTZ DEFAULT now()
);

-- Index for time-series queries
CREATE INDEX IF NOT EXISTS idx_macro_indicators_indicator_date
    ON macro_indicators (indicator, recorded_date DESC);
*/

-- =============================================================================
-- Data Mapping: rba_macro_full.json → macro_indicators
--
-- series.cash_rate_target.records[]
--   → indicator='cash_rate', value=cash_rate_target, recorded_date=date, source='RBA F1'
--   series.cash_rate_target.recent_changes[]
--   → separate rows with source='RBA F1 CHANGE' (value=change)
--
-- series.consumer_price_index.records[]
--   → indicator='cpi_index', value=cpi_index, recorded_date=date, source='RBA G1'
--   → indicator='cpi_yoy', value=cpi_yoy, recorded_date=date, source='RBA G1'
--   → indicator='cpi_ex_volatile_yoy', value=cpi_ex_volatile_yoy, recorded_date=date, source='RBA G1'
--
-- series.gdp.records[]
--   → indicator='real_gdp_audm', value=real_gdp_audm, recorded_date=date, source='RBA H1'
--   → indicator='real_gdp_yoy', value=real_gdp_yoy, recorded_date=date, source='RBA H1'
--
-- series.labour_force.records[]
--   → indicator='labour_force', value=labour_force_000, recorded_date=date, source='RBA H5'
--   → indicator='participation_rate', value=participation_rate, recorded_date=date, source='RBA H5'
--   → indicator='employment', value=employment_000, recorded_date=date, source='RBA H5'
--   → indicator='unemployment', value=unemployment_000, recorded_date=date, source='RBA H5'
--   → indicator='unemployment_rate_sa', value=unemployment_rate_sa, recorded_date=date, source='RBA H5'
--   → indicator='unemployment_rate_trend', value=unemployment_rate_trend, recorded_date=date, source='RBA H5'
--
-- series.forecasts.series.*[]
--   → indicator='j1_gdp_growth', value=median, recorded_date=target_quarter, source='RBA J1 GDP'
--   → indicator='j1_headline_inflation', value=median, recorded_date=target_quarter, source='RBA J1 CPI'
--   → indicator='j1_underlying_inflation', value=median, recorded_date=target_quarter, source='RBA J1 CPI'
--   → indicator='j1_unemployment_rate', value=median, recorded_date=target_quarter, source='RBA J1 UE'
-- =============================================================================

-- =============================================================================
-- Sync SQL (Reference — not executed in Phase 1B)
--
-- INSERT INTO macro_indicators (indicator, value, recorded_date, source)
-- SELECT 'cash_rate', (rec->>'cash_rate_target')::numeric, (rec->>'date')::date, 'RBA F1'
-- FROM jsonb_array_elements((SELECT raw_data->'series'->'cash_rate_target'->'records' FROM ...))
-- ON CONFLICT (indicator, recorded_date) DO NOTHING;
-- =============================================================================
