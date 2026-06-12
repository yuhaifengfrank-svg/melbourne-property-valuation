-- Phase 1B: Customer Funnel — lead contacts, preferences, events, consent
-- New tables, independent from existing `leads` table (untouched)

-- 1. Lead contacts (unique by LOWER(email))
CREATE TABLE IF NOT EXISTS lead_contacts (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    email_lower TEXT NOT NULL UNIQUE,
    name TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_contacts_email_lower ON lead_contacts (email_lower);
CREATE INDEX IF NOT EXISTS idx_lead_contacts_created_at ON lead_contacts (created_at DESC);

-- 2. Lead preferences (one-to-one with lead_contacts)
CREATE TABLE IF NOT EXISTS lead_preferences (
    id BIGSERIAL PRIMARY KEY,
    lead_contact_id BIGINT NOT NULL REFERENCES lead_contacts(id) ON DELETE CASCADE,
    session_id TEXT,
    budget_min BIGINT,
    budget_max BIGINT,
    state TEXT,
    goal TEXT,
    property_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_preferences_contact ON lead_preferences (lead_contact_id);
CREATE INDEX IF NOT EXISTS idx_lead_preferences_session ON lead_preferences (session_id);

-- 3. Lead events (anonymous or contact-linked)
CREATE TABLE IF NOT EXISTS lead_events (
    id BIGSERIAL PRIMARY KEY,
    lead_contact_id BIGINT REFERENCES lead_contacts(id) ON DELETE SET NULL,
    session_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_events_session ON lead_events (session_id);
CREATE INDEX IF NOT EXISTS idx_lead_events_contact ON lead_events (lead_contact_id);
CREATE INDEX IF NOT EXISTS idx_lead_events_type ON lead_events (event_type);
CREATE INDEX IF NOT EXISTS idx_lead_events_created ON lead_events (created_at DESC);

-- 4. Consent records (independent audit trail)
CREATE TABLE IF NOT EXISTS consent_records (
    id BIGSERIAL PRIMARY KEY,
    lead_contact_id BIGINT NOT NULL REFERENCES lead_contacts(id) ON DELETE CASCADE,
    consent_type TEXT NOT NULL CHECK (consent_type IN ('service_processing', 'marketing')),
    granted BOOLEAN NOT NULL DEFAULT FALSE,
    ip_hash TEXT,
    source_reference TEXT,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consent_records_contact ON consent_records (lead_contact_id);
CREATE INDEX IF NOT EXISTS idx_consent_records_type ON consent_records (consent_type);
CREATE INDEX IF NOT EXISTS idx_consent_records_source_ref ON consent_records (source_reference) WHERE source_reference IS NOT NULL;

-- 5. Session contact binding (one session → one contact)
CREATE TABLE IF NOT EXISTS lead_session_contacts (
    session_id TEXT PRIMARY KEY,
    lead_contact_id BIGINT NOT NULL REFERENCES lead_contacts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_session_contacts_contact ON lead_session_contacts (lead_contact_id);
