-- Additive source/period-aware metric foundation. No existing business data is rewritten.
CREATE TABLE IF NOT EXISTS suburb_metric_observations (
  id BIGSERIAL PRIMARY KEY, suburb TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'VIC',
  metric_key TEXT NOT NULL, metric_kind TEXT NOT NULL, value NUMERIC, unit TEXT,
  property_type TEXT, bedrooms SMALLINT, geography_name TEXT NOT NULL, geography_type TEXT NOT NULL,
  period_start DATE, period_end DATE NOT NULL, source_key TEXT, source_url TEXT, model_version TEXT,
  sample_size INTEGER, confidence TEXT, range_low NUMERIC, range_high NUMERIC,
  definition TEXT NOT NULL, limitations JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_publication_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_smo_kind CHECK (metric_kind IN ('fact','derived_fact','estimate','signal','score','unavailable')),
  CONSTRAINT chk_smo_bedrooms CHECK (bedrooms IS NULL OR bedrooms IN (3,4)),
  CONSTRAINT chk_smo_confidence CHECK (confidence IS NULL OR confidence IN ('insufficient','low','medium','high')),
  CONSTRAINT chk_smo_period CHECK (period_start IS NULL OR period_start <= period_end),
  CONSTRAINT chk_smo_estimate_model CHECK (metric_kind <> 'estimate' OR model_version IS NOT NULL),
  CONSTRAINT chk_smo_fact_source CHECK (metric_kind <> 'fact' OR source_key IS NOT NULL),
  CONSTRAINT chk_smo_range CHECK (range_low IS NULL OR range_high IS NULL OR range_low <= range_high)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_smo_observation ON suburb_metric_observations
  (suburb, state, metric_key, COALESCE(property_type, ''), COALESCE(bedrooms, 0), geography_name,
   period_end, COALESCE(source_key, ''), COALESCE(model_version, ''));
CREATE INDEX IF NOT EXISTS idx_smo_current ON suburb_metric_observations (suburb, state, metric_key, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_smo_publication ON suburb_metric_observations (metric_key, is_publication_eligible, period_end DESC);

CREATE TABLE IF NOT EXISTS suburb_data_research_queue (
  id BIGSERIAL PRIMARY KEY, suburb TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'VIC', metric_key TEXT NOT NULL,
  property_type TEXT, bedrooms SMALLINT, target_as_of DATE NOT NULL DEFAULT DATE '2025-12-31',
  required_geography TEXT NOT NULL DEFAULT 'suburb', cost_constraint TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'source_research_required', sources_checked JSONB NOT NULL DEFAULT '[]'::jsonb,
  candidate_sources JSONB NOT NULL DEFAULT '[]'::jsonb, decision_reason TEXT,
  resolved_observation_id BIGINT REFERENCES suburb_metric_observations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sdrq_bedrooms CHECK (bedrooms IS NULL OR bedrooms IN (3,4)),
  CONSTRAINT chk_sdrq_cost CHECK (cost_constraint = 'free'),
  CONSTRAINT chk_sdrq_status CHECK (status IN ('source_research_required','researching','fact_found','estimate_required','data_unavailable','licence_blocked','resolved'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sdrq_task ON suburb_data_research_queue
  (suburb, state, metric_key, COALESCE(property_type, ''), COALESCE(bedrooms, 0), target_as_of);

COMMENT ON TABLE suburb_metric_observations IS 'Source-aware facts, estimates, signals and scores; legacy suburb_metrics remains unchanged.';
COMMENT ON TABLE suburb_data_research_queue IS 'Free-source research required before modelling missing metrics.';
