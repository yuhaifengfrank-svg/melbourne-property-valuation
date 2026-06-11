import { neon } from "@neondatabase/serverless";

let initialized = false;
let customerFunnelInitialized = false;

export function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }
  return neon(process.env.DATABASE_URL);
}

export async function ensureSchema(sql) {
  if (initialized) return;

  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      contact_consent BOOLEAN NOT NULL DEFAULT FALSE,
      pdf_download BOOLEAN NOT NULL DEFAULT FALSE,
      property_address TEXT NOT NULL,
      property_suburb TEXT,
      property_state TEXT,
      property_type TEXT,
      estimated_value TEXT,
      midpoint_value BIGINT,
      confidence TEXT,
      selected_lvr INTEGER,
      language TEXT,
      event_type TEXT NOT NULL DEFAULT 'report_unlock',
      lead_score INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'Warm',
      ip_hash TEXT,
      ip_country TEXT,
      ip_region TEXT,
      ip_city TEXT,
      user_agent TEXT,
      analysis JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `;

  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_suburb TEXT`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_state TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS leads_score_idx ON leads (lead_score DESC, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS leads_email_idx ON leads (LOWER(email))`;
  await sql`CREATE INDEX IF NOT EXISTS leads_property_idx ON leads (LOWER(property_address))`;
  await sql`CREATE INDEX IF NOT EXISTS leads_state_suburb_idx ON leads (property_state, LOWER(property_suburb))`;
  await sql`CREATE INDEX IF NOT EXISTS leads_notification_dedupe_idx ON leads (LOWER(email), LOWER(property_address), event_type)`;

  /* Migration 008: Opportunity gate columns */
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_timestamp TIMESTAMPTZ`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS strategy TEXT`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget_min BIGINT`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget_max BIGINT`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS destination_state TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS leads_source_idx ON leads (source)`;
  await sql`CREATE INDEX IF NOT EXISTS leads_email_source_idx ON leads (LOWER(email), source)`;
  await sql`CREATE INDEX IF NOT EXISTS leads_opp_notification_dedupe_idx ON leads (LOWER(email), source)`;

  initialized = true;
}

/**
 * Migration 009: Customer funnel tables (independent from `leads`)
 */
export async function ensureCustomerFunnelSchema(sql) {
  if (customerFunnelInitialized) return;

  await sql`CREATE TABLE IF NOT EXISTS lead_contacts (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    email_lower TEXT NOT NULL UNIQUE,
    name TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS lead_preferences (
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
  )`;

  await sql`CREATE TABLE IF NOT EXISTS lead_events (
    id BIGSERIAL PRIMARY KEY,
    lead_contact_id BIGINT REFERENCES lead_contacts(id) ON DELETE SET NULL,
    session_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS consent_records (
    id BIGSERIAL PRIMARY KEY,
    lead_contact_id BIGINT NOT NULL REFERENCES lead_contacts(id) ON DELETE CASCADE,
    consent_type TEXT NOT NULL CHECK (consent_type IN ('service_processing', 'marketing')),
    granted BOOLEAN NOT NULL DEFAULT FALSE,
    ip_hash TEXT,
    source_reference TEXT,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS lead_session_contacts (
    session_id TEXT PRIMARY KEY,
    lead_contact_id BIGINT NOT NULL REFERENCES lead_contacts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  /* Indexes */
  await sql`CREATE INDEX IF NOT EXISTS idx_lead_contacts_email_lower ON lead_contacts (email_lower)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_lead_contacts_created_at ON lead_contacts (created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_lead_preferences_contact ON lead_preferences (lead_contact_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_lead_preferences_session ON lead_preferences (session_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_lead_events_session ON lead_events (session_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_lead_events_contact ON lead_events (lead_contact_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_lead_events_type ON lead_events (event_type)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_lead_events_created ON lead_events (created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_consent_records_contact ON consent_records (lead_contact_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_consent_records_type ON consent_records (consent_type)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_lead_session_contacts_contact ON lead_session_contacts (lead_contact_id)`;

  customerFunnelInitialized = true;
}
