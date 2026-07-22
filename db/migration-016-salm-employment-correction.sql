BEGIN;

ALTER TABLE salm_sa2_data ADD COLUMN IF NOT EXISTS employment_count INTEGER;
ALTER TABLE salm_sa2_data ADD COLUMN IF NOT EXISTS employment_growth_yoy NUMERIC(8,4);
ALTER TABLE salm_sa2_data ADD COLUMN IF NOT EXISTS employment_growth_base_quarter TEXT;

ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS supply_employment_count NUMERIC;
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS supply_employment_growth_yoy NUMERIC(8,4);
ALTER TABLE suburb_metrics ADD COLUMN IF NOT EXISTS supply_employment_period TEXT;

CREATE TABLE IF NOT EXISTS suburb_sa2_membership (
  suburb TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'VIC',
  sa2_code TEXT NOT NULL REFERENCES salm_sa2_data(sa2_code),
  allocation_weight NUMERIC(9,8),
  weight_basis TEXT NOT NULL,
  source_key TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (suburb, state, sa2_code),
  CONSTRAINT chk_ssm_weight CHECK (allocation_weight IS NULL OR (allocation_weight > 0 AND allocation_weight <= 1))
);

COMMENT ON COLUMN salm_sa2_data.employment_count IS 'Derived latest-quarter employed persons: labour force minus unemployed';
COMMENT ON COLUMN salm_sa2_data.employment_growth_yoy IS 'Derived year-on-year employment growth percentage using the same quarter';
COMMENT ON COLUMN suburb_metrics.supply_employment_growth IS 'Legacy field: corrected to year-on-year employment growth percentage; use supply_employment_growth_yoy';
COMMENT ON COLUMN suburb_metrics.supply_employment_count IS 'Aggregated employed persons for verified suburb-SA2 membership';

COMMIT;
