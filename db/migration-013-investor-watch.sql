-- Investor Watch V1 foundation. Apply only after migrations 009, 010 and 012.
BEGIN;

CREATE TABLE IF NOT EXISTS member_login_tokens (
  id BIGSERIAL PRIMARY KEY,
  lead_contact_id BIGINT NOT NULL REFERENCES lead_contacts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  requested_ip_hash TEXT,
  requested_user_agent_hash TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_member_login_token_expiry CHECK (expires_at > created_at),
  CONSTRAINT chk_member_login_token_consumed CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);
CREATE INDEX IF NOT EXISTS idx_member_login_tokens_contact_created
  ON member_login_tokens (lead_contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_login_tokens_active_expiry
  ON member_login_tokens (expires_at) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS member_sessions (
  id BIGSERIAL PRIMARY KEY,
  lead_contact_id BIGINT NOT NULL REFERENCES lead_contacts(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_member_session_expiry CHECK (expires_at > created_at),
  CONSTRAINT chk_member_session_revoked CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
CREATE INDEX IF NOT EXISTS idx_member_sessions_contact_expiry
  ON member_sessions (lead_contact_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_sessions_active_expiry
  ON member_sessions (expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS investor_watch_memberships (
  id BIGSERIAL PRIMARY KEY,
  lead_contact_id BIGINT NOT NULL UNIQUE REFERENCES lead_contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'free',
  suburb_limit INTEGER NOT NULL DEFAULT 3,
  property_limit INTEGER NOT NULL DEFAULT 2,
  report_limit INTEGER NOT NULL DEFAULT 0,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_iw_membership_status CHECK (
    status IN ('free', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'expired')
  ),
  CONSTRAINT chk_iw_membership_limits CHECK (
    suburb_limit BETWEEN 0 AND 100 AND property_limit BETWEEN 0 AND 100 AND report_limit BETWEEN 0 AND 100
  ),
  CONSTRAINT chk_iw_membership_period CHECK (
    current_period_start IS NULL OR current_period_end IS NULL OR current_period_end > current_period_start
  )
);
CREATE INDEX IF NOT EXISTS idx_iw_memberships_status
  ON investor_watch_memberships (status);

CREATE TABLE IF NOT EXISTS investor_watch_items (
  id BIGSERIAL PRIMARY KEY,
  lead_contact_id BIGINT NOT NULL REFERENCES lead_contacts(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  canonical_item_key TEXT NOT NULL,
  suburb TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'VIC',
  postcode TEXT,
  property_key TEXT,
  display_address TEXT,
  investment_goal TEXT NOT NULL DEFAULT 'balanced',
  private_note TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_iw_item_type CHECK (item_type IN ('suburb', 'property')),
  CONSTRAINT chk_iw_item_status CHECK (status IN ('active', 'archived')),
  CONSTRAINT chk_iw_item_goal CHECK (investment_goal IN ('balanced', 'growth', 'income', 'school', 'value')),
  CONSTRAINT chk_iw_item_note CHECK (private_note IS NULL OR char_length(private_note) <= 1000),
  CONSTRAINT chk_iw_item_key CHECK (char_length(canonical_item_key) BETWEEN 3 AND 500),
  CONSTRAINT chk_iw_item_identity CHECK (
    (item_type = 'suburb' AND property_key IS NULL) OR
    (item_type = 'property' AND property_key IS NOT NULL AND display_address IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_iw_items_active_unique
  ON investor_watch_items (lead_contact_id, canonical_item_key) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_iw_items_contact_status
  ON investor_watch_items (lead_contact_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_iw_items_suburb_state
  ON investor_watch_items (suburb, state) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS investor_watch_score_history (
  id BIGSERIAL PRIMARY KEY,
  watch_item_id BIGINT NOT NULL REFERENCES investor_watch_items(id) ON DELETE CASCADE,
  future_opportunity_score NUMERIC(5,2) NOT NULL,
  confidence_score NUMERIC(5,2),
  component_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_version TEXT NOT NULL,
  data_as_of DATE NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_iw_history_score CHECK (future_opportunity_score BETWEEN 0 AND 100),
  CONSTRAINT chk_iw_history_confidence CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 100),
  CONSTRAINT uq_iw_history_version UNIQUE (watch_item_id, model_version, data_as_of)
);
CREATE INDEX IF NOT EXISTS idx_iw_history_item_captured
  ON investor_watch_score_history (watch_item_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS investor_watch_change_events (
  id BIGSERIAL PRIMARY KEY,
  watch_item_id BIGINT NOT NULL REFERENCES investor_watch_items(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_key TEXT NOT NULL UNIQUE,
  previous_value JSONB,
  current_value JSONB,
  source_data_as_of DATE,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_iw_change_type CHECK (
    event_type IN ('score_up', 'score_down', 'confidence_changed', 'planning_changed', 'data_refreshed', 'report_added')
  )
);
CREATE INDEX IF NOT EXISTS idx_iw_changes_item_created
  ON investor_watch_change_events (watch_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_iw_changes_unnotified
  ON investor_watch_change_events (created_at) WHERE notified_at IS NULL;

CREATE TABLE IF NOT EXISTS investor_watch_notification_preferences (
  lead_contact_id BIGINT PRIMARY KEY REFERENCES lead_contacts(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  weekly_digest BOOLEAN NOT NULL DEFAULT FALSE,
  planning_alerts BOOLEAN NOT NULL DEFAULT FALSE,
  score_change_threshold NUMERIC(5,2) NOT NULL DEFAULT 5,
  unsubscribe_token_hash TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_iw_notification_threshold CHECK (score_change_threshold BETWEEN 1 AND 100)
);

COMMIT;
