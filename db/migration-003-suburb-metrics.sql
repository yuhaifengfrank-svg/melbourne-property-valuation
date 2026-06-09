-- Migration 003: Create suburb_metrics table
-- Part of Opportunity Engine V2 batch refresh system

CREATE TABLE IF NOT EXISTS suburb_metrics (
  suburb         TEXT NOT NULL,
  state          TEXT NOT NULL DEFAULT 'VIC',
  
  -- Prices
  median_house_price  NUMERIC(12,0),
  median_unit_price   NUMERIC(12,0),
  median_house_rent   NUMERIC(10,0),
  median_unit_rent    NUMERIC(10,0),
  
  -- Yield (percentages stored as e.g. 3.5 = 3.5%)
  gross_yield         NUMERIC(5,2),
  
  -- Market health
  vacancy_rate        NUMERIC(5,2),
  
  -- Growth (percentages)
  growth_1y           NUMERIC(6,2),
  growth_3y           NUMERIC(6,2),
  growth_5y           NUMERIC(6,2),
  
  -- Demographics / environment
  population_growth       NUMERIC(6,2),
  school_score            NUMERIC(5,1),
  infrastructure_score    NUMERIC(5,1),
  supply_risk_score       NUMERIC(5,1),
  
  -- Composite
  opportunity_score   NUMERIC(5,1),
  
  -- Classification
  opportunity_type    TEXT,
  
  -- Metadata
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  PRIMARY KEY (suburb, state)
);

COMMENT ON TABLE suburb_metrics IS 'Pre-computed suburb-level metrics, refreshed nightly. Powers Opportunity Engine V2.';
