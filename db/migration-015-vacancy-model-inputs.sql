-- Additive storage for official supply/planning observations and reproducible model snapshots.
-- This migration is not run automatically and does not rewrite legacy suburb metrics.
CREATE TABLE IF NOT EXISTS suburb_building_permit_observations (
  id BIGSERIAL PRIMARY KEY, permit_number TEXT, municipality TEXT NOT NULL, suburb TEXT NOT NULL,
  postcode TEXT, issue_date DATE NOT NULL, description TEXT, building_use TEXT,
  new_dwellings NUMERIC, demolished_dwellings NUMERIC, estimated_cost NUMERIC,
  dwelling_count_quality TEXT NOT NULL, source_key TEXT NOT NULL, source_url TEXT NOT NULL,
  source_period TEXT NOT NULL, source_retrieved_at TIMESTAMPTZ NOT NULL,
  raw_record_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sbpo_quality CHECK (dwelling_count_quality IN ('reported','inferred','unknown'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sbpo_source_record ON suburb_building_permit_observations (source_key, raw_record_hash);
CREATE INDEX IF NOT EXISTS idx_sbpo_suburb_date ON suburb_building_permit_observations (suburb, issue_date DESC);

CREATE TABLE IF NOT EXISTS council_planning_application_observations (
  id BIGSERIAL PRIMARY KEY, council TEXT NOT NULL, suburb TEXT, postcode TEXT,
  application_number TEXT NOT NULL, lodged_date DATE, decision_date DATE, status TEXT,
  description TEXT, proposed_dwellings NUMERIC, dwelling_count_quality TEXT NOT NULL,
  source_key TEXT NOT NULL, source_url TEXT NOT NULL, source_retrieved_at TIMESTAMPTZ NOT NULL,
  raw_record_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_cpao_quality CHECK (dwelling_count_quality IN ('reported','inferred','unknown'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cpao_source_record ON council_planning_application_observations (source_key, raw_record_hash);
CREATE INDEX IF NOT EXISTS idx_cpao_suburb_lodged ON council_planning_application_observations (suburb, lodged_date DESC);

CREATE TABLE IF NOT EXISTS suburb_vacancy_model_snapshots (
  id BIGSERIAL PRIMARY KEY, suburb TEXT NOT NULL, lga TEXT NOT NULL, as_of DATE NOT NULL,
  model_version TEXT NOT NULL, benchmark_value NUMERIC NOT NULL, benchmark_source_key TEXT NOT NULL,
  estimate_value NUMERIC, range_low NUMERIC, range_high NUMERIC, confidence TEXT NOT NULL,
  evidence_coverage NUMERIC NOT NULL, adjustment_coefficient NUMERIC,
  feature_inputs JSONB NOT NULL, feature_contributions JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_svms_confidence CHECK (confidence IN ('insufficient','low','medium')),
  CONSTRAINT chk_svms_coverage CHECK (evidence_coverage >= 0 AND evidence_coverage <= 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_svms_version ON suburb_vacancy_model_snapshots (suburb, as_of, model_version);
