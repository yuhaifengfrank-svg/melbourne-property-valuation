-- Phase 1A: Report Payment Infrastructure — independent from existing lead/customer tables
-- Does not modify or drop any existing table.
-- Does not store card numbers, full email-to-log mappings, or payment sensitive data.

-- 1. Report Snapshots
-- Created at checkout initiation: when user clicks "Unlock Full Report", the service
-- locks the current valuation output into a snapshot. The snapshot is NOT created
-- on every free valuation.
CREATE TABLE IF NOT EXISTS report_snapshots (
    report_id TEXT PRIMARY KEY,
    property_key TEXT NOT NULL,
    valuation_version TEXT NOT NULL,
    snapshot_json JSONB NOT NULL,
    snapshot_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ     -- NULL = permanent access (current product decision)
);

CREATE INDEX IF NOT EXISTS idx_rs_property_key ON report_snapshots (property_key);
CREATE INDEX IF NOT EXISTS idx_rs_created_at ON report_snapshots (created_at DESC);

-- 2. Report Payments: one row per checkout attempt
-- lead_contact_id is NOT NULL: checkout requires a known lead_contact.
-- Anonymous payments are not permitted.
CREATE TABLE IF NOT EXISTS report_payments (
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
);

CREATE INDEX IF NOT EXISTS idx_rp_report_id ON report_payments (report_id);
CREATE INDEX IF NOT EXISTS idx_rp_lead_contact ON report_payments (lead_contact_id);
CREATE INDEX IF NOT EXISTS idx_rp_status ON report_payments (status);
CREATE INDEX IF NOT EXISTS idx_rp_stripe_customer ON report_payments (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_rp_created_at ON report_payments (created_at DESC);

-- 3. Report Entitlements: granted by webhook, revoked on refund
-- lead_contact_id is NOT NULL: every entitlement belongs to a known contact.
-- UNIQUE(report_id) ensures one report has exactly one valid purchaser.
CREATE TABLE IF NOT EXISTS report_entitlements (
    id BIGSERIAL PRIMARY KEY,
    report_id TEXT NOT NULL REFERENCES report_snapshots(report_id),
    lead_contact_id BIGINT NOT NULL REFERENCES lead_contacts(id),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'refunded', 'revoked', 'disputed')),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    UNIQUE (report_id),
    UNIQUE (report_id, lead_contact_id)
);

CREATE INDEX IF NOT EXISTS idx_re_report_id ON report_entitlements (report_id);
CREATE INDEX IF NOT EXISTS idx_re_lead_contact ON report_entitlements (lead_contact_id);
CREATE INDEX IF NOT EXISTS idx_re_status ON report_entitlements (status);
CREATE INDEX IF NOT EXISTS idx_re_granted_at ON report_entitlements (granted_at DESC);

-- 4. Report Drafts: temporary storage for free-valuation snapshots
-- Drafts are created on every free valuation. Their content is frozen at
-- purchase time into report_snapshots. Expired drafts are garbage-collected.
CREATE TABLE IF NOT EXISTS report_drafts (
    draft_id TEXT PRIMARY KEY,
    property_key TEXT NOT NULL,
    valuation_version TEXT NOT NULL,
    snapshot_json JSONB NOT NULL,
    snapshot_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rd_expires ON report_drafts (expires_at);
CREATE INDEX IF NOT EXISTS idx_rd_consumed ON report_drafts (consumed_at) WHERE consumed_at IS NULL;

-- Add draft_id FK to report_snapshots (Phase 1B)
ALTER TABLE report_snapshots ADD COLUMN IF NOT EXISTS draft_id TEXT REFERENCES report_drafts(draft_id);

-- 5. Stripe Webhook Events: idempotency audit log
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
    stripe_event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    processing_status TEXT NOT NULL DEFAULT 'received'
        CHECK (processing_status IN ('received', 'processed', 'failed')),
    error_message TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_swe_processing_status ON stripe_webhook_events (processing_status);
CREATE INDEX IF NOT EXISTS idx_swe_event_type ON stripe_webhook_events (event_type);
CREATE INDEX IF NOT EXISTS idx_swe_received_at ON stripe_webhook_events (received_at DESC);
