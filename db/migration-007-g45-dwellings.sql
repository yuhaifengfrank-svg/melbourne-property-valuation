-- Migration 007: G45 Dwelling Structure by Number of Bedrooms (from ABS Census 2021 G41 table)
--
-- What this does:
--   1. Adds g41 (JSONB) column to census_sa2_data for G41 dwelling structure by bedrooms data
--   2. Adds parsed columns for total dwellings, separate house%, flat%, occupancy rate
--   3. Adds supply_housing_per_capita (recalculated from G41 total dwellings)
--
-- Why:
--   Currently dwelling estimates use Tot_P_P / 2.5 proxy.
--   G41 provides actual dwelling counts by structure and bedroom count.

BEGIN;

-- Add G41 raw JSONB column
ALTER TABLE census_sa2_data ADD COLUMN IF NOT EXISTS g41 JSONB;

-- Add parsed dwelling structure columns
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS dwelling_total         NUMERIC(10,0);
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS dwelling_separate_house NUMERIC(5,1); -- % of total
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS dwelling_flat           NUMERIC(5,1); -- % of total
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS dwelling_semi_detached  NUMERIC(5,1); -- % of total
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS dwelling_3br_plus       NUMERIC(5,1); -- % 3+ bedroom
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS dwelling_occupancy_rate NUMERIC(4,2); -- persons per dwelling
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS dwelling_1br_2br        NUMERIC(5,1); -- % 1-2 bedroom (small dwellings)

-- Column comments
COMMENT ON COLUMN census_sa2_data.g41 IS 'ABS Census 2021 G41: Dwelling structure by number of bedrooms (raw JSONB)';
COMMENT ON COLUMN suburb_metrics.dwelling_total IS 'Total occupied private dwellings (from G41)';
COMMENT ON COLUMN suburb_metrics.dwelling_separate_house IS '% of dwellings that are separate houses';
COMMENT ON COLUMN suburb_metrics.dwelling_flat IS '% of dwellings that are flats/units/apartments';
COMMENT ON COLUMN suburb_metrics.dwelling_semi_detached IS '% of dwellings that are semi-detached/row/terrace';
COMMENT ON COLUMN suburb_metrics.dwelling_3br_plus IS '% of dwellings with 3+ bedrooms';
COMMENT ON COLUMN suburb_metrics.dwelling_occupancy_rate IS 'Persons per dwelling (occupancy rate)';
COMMENT ON COLUMN suburb_metrics.dwelling_1br_2br IS '% of dwellings with 1-2 bedrooms (small dwellings)';

COMMIT;
