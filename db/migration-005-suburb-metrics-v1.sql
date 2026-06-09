-- Migration 005: suburb_metrics V1 Final Schema — Phase 1A Baseline Freeze
-- 
-- Rationale:
--   V1 finalizes the suburb_metrics table with all fields needed by
--   the Opportunity Intelligence Platform. Existing columns are preserved;
--   new fields add confidence metadata, factor decomposition, and
--   explicit supply_constraint / infrastructure scores.
--
--   Fields already deployed via ad-hoc ALTER TABLE are explicitly declared
--   here so the full schema is self-documenting in one migration file.
--
-- Changes from migration-003:
--   1. Adds govt_5yr_cagr  (already deployed via ALTER TABLE, now code-visible)
--   2. Adds undervaluation  (already deployed via ALTER TABLE, now code-visible)
--   3. Adds factor_confidence_ scores for each primary factor
--   4. Adds source_confidence_ scores for each data origin
--   5. Adds fallback_confidence_ for fallback tier tracking
--   6. Adds overall_confidence  (composite from factor/source/fallback)
--   7. Adds explicit supply_constraint_score (was orphan supply_risk_score,
--      now renamed in V1 but kept for backward compat)
--   8. Adds infrastructure_score as first-class computed field
--      (was placeholder in migration-003, now populated)
--   9. Adds performance indexes

BEGIN;

-- ───────────────────────────────────────────────────────────────────
-- Section 1: Ensure ALL factor columns exist (idempotent ALTER TABLE)
-- ───────────────────────────────────────────────────────────────────

-- Growth / price fields
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS govt_5yr_cagr      NUMERIC(5,2);
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS undervaluation      NUMERIC(5,1);

-- Factor confidence (0..100, NULL = not computed)
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS conf_undervaluation   NUMERIC(5,1);
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS conf_growth          NUMERIC(5,1);
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS conf_yield           NUMERIC(5,1);
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS conf_vacancy         NUMERIC(5,1);
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS conf_school          NUMERIC(5,1);

-- Source confidence (0..100, NULL = not computed)
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS conf_sales_source    NUMERIC(5,1);
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS conf_rent_source     NUMERIC(5,1);
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS conf_school_source   NUMERIC(5,1);
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS conf_growth_source   NUMERIC(5,1);
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS conf_vacancy_source  NUMERIC(5,1);

-- Fallback confidence (which fallback tier was used for each dimension)
-- Tier meaning: A=direct, B=pooled, C=regional, D=static/default
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS fallback_tier_sales    TEXT;  -- 'A' | 'B' | 'C' | 'D'
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS fallback_tier_growth   TEXT;
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS fallback_tier_yield    TEXT;
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS fallback_tier_vacancy  TEXT;
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS fallback_tier_school   TEXT;

-- Supply constraint (renamed conceptually from supply_risk_score for V1)
-- supply_risk_score already exists in migration-003. Add alias for clarity.
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS supply_constraint_score NUMERIC(5,1);

-- Infrastructure score (was placeholder, now explicitly populated)
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS infrastructure_score   NUMERIC(5,1);

-- Overall confidence (composite rolled up from factor / source / fallback)
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS overall_confidence     NUMERIC(5,1);

-- Calculation metadata
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS scoring_version        TEXT DEFAULT 'v2';

-- ───────────────────────────────────────────────────────────────────
-- Section 2: Indexes for performance
-- ───────────────────────────────────────────────────────────────────

-- Primary factor query pattern: "top opportunities by type"
CREATE INDEX IF NOT EXISTS sm_opportunity_score_desc_idx 
  ON suburb_metrics (opportunity_score DESC NULLS LAST) 
  WHERE opportunity_type IS NOT NULL;

-- Type-filtered queries (most frequent: homepage / /opportunities/ pages)
CREATE INDEX IF NOT EXISTS sm_opportunity_type_score_idx 
  ON suburb_metrics (opportunity_type, opportunity_score DESC NULLS LAST);

-- Confidence filtering (Phase 1B: consumers can filter by confidence)
CREATE INDEX IF NOT EXISTS sm_overall_confidence_desc_idx 
  ON suburb_metrics (overall_confidence DESC NULLS LAST)
  WHERE overall_confidence IS NOT NULL;

-- Suburb lookups (single row by LOWER match)
CREATE INDEX IF NOT EXISTS sm_suburb_lower_idx 
  ON suburb_metrics (LOWER(suburb) text_pattern_ops, state);

-- Vacancy queries (for rental-focused pages)
CREATE INDEX IF NOT EXISTS sm_vacancy_rate_idx 
  ON suburb_metrics (vacancy_rate ASC NULLS LAST)
  WHERE vacancy_rate IS NOT NULL;

-- Yield queries (for cashflow-focused pages)
CREATE INDEX IF NOT EXISTS sm_gross_yield_desc_idx 
  ON suburb_metrics (gross_yield DESC NULLS LAST)
  WHERE gross_yield IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────
-- Section 3: Comments (self-documenting)
-- ───────────────────────────────────────────────────────────────────

COMMENT ON COLUMN suburb_metrics.govt_5yr_cagr IS 'VGV ABS SA2 5-year compound annual growth rate (%); used as fallback for growth when sales-based growth is unavailable';
COMMENT ON COLUMN suburb_metrics.undervaluation IS 'Undervaluation factor (0-100) derived from median price vs. market tier';
COMMENT ON COLUMN suburb_metrics.conf_undervaluation IS 'Confidence in undervaluation factor (0-100)';
COMMENT ON COLUMN suburb_metrics.conf_growth IS 'Confidence in growth factor (0-100)';
COMMENT ON COLUMN suburb_metrics.conf_yield IS 'Confidence in yield factor (0-100)';
COMMENT ON COLUMN suburb_metrics.conf_vacancy IS 'Confidence in vacancy factor (0-100)';
COMMENT ON COLUMN suburb_metrics.conf_school IS 'Confidence in school factor (0-100)';
COMMENT ON COLUMN suburb_metrics.conf_sales_source IS 'Confidence that sales source data is reliable (0-100)';
COMMENT ON COLUMN suburb_metrics.conf_rent_source IS 'Confidence that rental source data is reliable (0-100)';
COMMENT ON COLUMN suburb_metrics.conf_school_source IS 'Confidence that school source data is reliable (0-100)';
COMMENT ON COLUMN suburb_metrics.conf_growth_source IS 'Confidence that growth projection source is reliable (0-100)';
COMMENT ON COLUMN suburb_metrics.conf_vacancy_source IS 'Confidence that vacancy source data is reliable (0-100)';
COMMENT ON COLUMN suburb_metrics.fallback_tier_sales IS 'Fallback tier used for median price: A=direct, B=pooled, C=regional, D=static';
COMMENT ON COLUMN suburb_metrics.fallback_tier_growth IS 'Fallback tier used for growth projection: A=direct, B=pooled, C=regional, D=VGV default';
COMMENT ON COLUMN suburb_metrics.fallback_tier_yield IS 'Fallback tier used for yield: A=computed, B=price-proxy, C=regional, D=default(4%)';
COMMENT ON COLUMN suburb_metrics.fallback_tier_vacancy IS 'Fallback tier used for vacancy: A=SA2 census, B=regional avg, C=state avg, D=default(5%)';
COMMENT ON COLUMN suburb_metrics.fallback_tier_school IS 'Fallback tier used for school: A=local ICSEA, B=regional avg, C=state avg, D=default(50)';
COMMENT ON COLUMN suburb_metrics.supply_constraint_score IS 'Supply constraint score (0-100); high = limited new supply = upward price pressure';
COMMENT ON COLUMN suburb_metrics.infrastructure_score IS 'Infrastructure investment score (0-100); high = major govt/private investment underway';
COMMENT ON COLUMN suburb_metrics.overall_confidence IS 'Composite confidence (0-100) rolled up from factor + source + fallback tiers';
COMMENT ON COLUMN suburb_metrics.scoring_version IS 'Scoring engine version tag (e.g. v1, v2)';

COMMIT;
