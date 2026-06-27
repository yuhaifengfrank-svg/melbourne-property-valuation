-- =============================================================================
-- Sync Target: Preview Neon
-- Table: census_sa2_data (UPDATE, not CREATE)
--
-- Purpose: Supplement existing census_sa2_data with ABS G41 dwelling structure.
--          The table already contains g01, g02, g33, g36, g37, g40, g46a, g46b,
--          g60a, seifa, g41 columns (jsonb).
--
-- Source: ABS 2021 GCP SA2 VIC (G01/G02/G41 CSVs)
-- Sync artifact: abs_census_2021.json (suburb_summary/)
--
-- NOTE: This table already exists on Preview Neon with g41 column.
--       No schema change needed — existing g41 jsonb is the target.
-- =============================================================================

-- Reference DDL (already created by prior migration)
/*
CREATE TABLE IF NOT EXISTS census_sa2_data (
    sa2_code    VARCHAR NOT NULL PRIMARY KEY,
    g01         JSONB,          -- population counts
    g02         JSONB,          -- median age, income, rent, mortgage
    g33         JSONB,
    g36         JSONB,          -- tenure, landlord type (used for vacancy proxy)
    g37         JSONB,
    g40         JSONB,
    g46a        JSONB,
    g46b        JSONB,
    g60a        JSONB,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    seifa       JSONB,          -- socio-economic indexes
    g41         JSONB           -- dwelling structure (separate house, townhouse, apartment counts)
);
*/

-- =============================================================================
-- Data Mapping: abs_census_2021.json → census_sa2_data.g41
--
-- Each record in abs_census_2021.json has:
--   sa2_code              → census_sa2_data.sa2_code (PK)
--   total_population      → g01->>'tot_p_p'
--   total_males           → g01->>'tot_p_m'
--   total_females         → g01->>'tot_p_f'
--   median_age            → g02->>'median_age_persons'
--   median_household_income_weekly  → g02->>'median_tot_hhd_inc_weekly'
--   median_family_income_weekly     → g02->>'median_tot_fam_inc_weekly'
--   median_personal_income_weekly   → g02->>'median_tot_prsnl_inc_weekly'
--   median_rent_weekly    → g02->>'median_rent_weekly'
--   median_mortgage_repay → g02->>'median_mortgage_repay_monthly'
--   dwelling counts (separate_house / townhouse / apartment / other) → g41->>'...'
--
-- Sync is an UPDATE per sa2_code, not INSERT (rows already exist).
-- Missing sa2_code values should be INSERTed as new rows.
-- =============================================================================

-- =============================================================================
-- Sync SQL (Reference — not executed in Phase 1B)
--
-- UPDATE census_sa2_data
-- SET g41 = jsonb_build_object(
--     'separate_house', (SELECT ...),
--     'townhouse', (SELECT ...),
--     'apartment', (SELECT ...),
--     'other_dwelling', (SELECT ...)
-- ),
--     updated_at = now()
-- WHERE sa2_code = '<sa2_code>';
-- =============================================================================
