import { neon } from "@neondatabase/serverless";

let initialized = false;
let customerFunnelInitialized = false;
let reportPaymentInitialized = false;

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
  /* Migration: Ensure email and email_lower have UNIQUE constraints (for on-conflict upsert) */
  // These may fail (constraint already exists, or duplicates) — safe to ignore
  try { await sql`ALTER TABLE lead_contacts ADD CONSTRAINT lead_contacts_email_key UNIQUE (email)`; } catch (_) {}
  try { await sql`ALTER TABLE lead_contacts ADD CONSTRAINT lead_contacts_email_lower_key UNIQUE (email_lower)`; } catch (_) {};
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

/**
 * Migration 010: Report payment tables (independent from existing lead/customer tables)
 * Created in Phase 1A — no Stripe API calls, no frontend changes.
 *
 * ⚠️ report_snapshots is NOT created on every free valuation.
 * It is created at checkout initiation: when user clicks "Unlock Full Report",
 * the service locks the current valuation output into a snapshot.
 */
export async function ensureReportPaymentSchema(sql) {
  if (reportPaymentInitialized) return;

  await sql`CREATE TABLE IF NOT EXISTS report_snapshots (
    report_id TEXT PRIMARY KEY,
    property_key TEXT NOT NULL,
    valuation_version TEXT NOT NULL,
    snapshot_json JSONB NOT NULL,
    snapshot_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
  )`;

  await sql`CREATE INDEX IF NOT EXISTS idx_rs_property_key ON report_snapshots (property_key)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_rs_created_at ON report_snapshots (created_at DESC)`;

  await sql`CREATE TABLE IF NOT EXISTS report_payments (
    id BIGSERIAL PRIMARY KEY,
    report_id TEXT NOT NULL REFERENCES report_snapshots(report_id),
    lead_contact_id BIGINT NOT NULL REFERENCES lead_contacts(id),
    stripe_customer_id TEXT,
    stripe_checkout_session_id TEXT UNIQUE,
    stripe_payment_intent_id TEXT UNIQUE,
    purchase_intent_key TEXT NOT NULL UNIQUE,
    amount_cents INTEGER NOT NULL DEFAULT 399 CHECK (amount_cents = 399),
    currency TEXT NOT NULL DEFAULT 'aud' CHECK (currency = 'aud'),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'refunded', 'disputed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS idx_rp_report_id ON report_payments (report_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_rp_lead_contact ON report_payments (lead_contact_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_rp_status ON report_payments (status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_rp_stripe_customer ON report_payments (stripe_customer_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_rp_created_at ON report_payments (created_at DESC)`;

  await sql`CREATE TABLE IF NOT EXISTS report_entitlements (
    id BIGSERIAL PRIMARY KEY,
    report_id TEXT NOT NULL REFERENCES report_snapshots(report_id),
    lead_contact_id BIGINT NOT NULL REFERENCES lead_contacts(id),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'refunded', 'revoked', 'disputed')),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    UNIQUE (report_id),
    UNIQUE (report_id, lead_contact_id)
  )`;

  await sql`CREATE INDEX IF NOT EXISTS idx_re_report_id ON report_entitlements (report_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_re_lead_contact ON report_entitlements (lead_contact_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_re_status ON report_entitlements (status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_re_granted_at ON report_entitlements (granted_at DESC)`;

  await sql`CREATE TABLE IF NOT EXISTS report_drafts (
    draft_id TEXT PRIMARY KEY,
    property_key TEXT NOT NULL,
    valuation_version TEXT NOT NULL,
    snapshot_json JSONB NOT NULL,
    snapshot_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS idx_rd_expires ON report_drafts (expires_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_rd_consumed ON report_drafts (consumed_at) WHERE consumed_at IS NULL`;

  await sql`ALTER TABLE report_snapshots ADD COLUMN IF NOT EXISTS draft_id TEXT REFERENCES report_drafts(draft_id)`;

  // Full unique index (supports INSERT … ON CONFLICT (draft_id))
  // PostgreSQL UNIQUE allows multiple NULL rows.
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_rs_draft_id ON report_snapshots (draft_id)`;
  await sql`ALTER TABLE report_snapshots ADD COLUMN IF NOT EXISTS lead_contact_id BIGINT REFERENCES lead_contacts(id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_rs_lead_contact ON report_snapshots (lead_contact_id)`;

  await sql`CREATE TABLE IF NOT EXISTS stripe_webhook_events (
    stripe_event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    processing_status TEXT NOT NULL DEFAULT 'received'
        CHECK (processing_status IN ('received', 'processed', 'failed')),
    error_message TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
  )`;

  await sql`CREATE INDEX IF NOT EXISTS idx_swe_processing_status ON stripe_webhook_events (processing_status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_swe_event_type ON stripe_webhook_events (event_type)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_swe_received_at ON stripe_webhook_events (received_at DESC)`;

  reportPaymentInitialized = true;
}
