-- Phase 3F: Top Opportunities registration gate
-- Adds columns needed for full contact consent + source tracking

ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_timestamp TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS strategy TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget_min BIGINT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget_max BIGINT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS destination_state TEXT;

CREATE INDEX IF NOT EXISTS leads_source_idx ON leads (source);
CREATE INDEX IF NOT EXISTS leads_email_source_idx ON leads (LOWER(email), source);
