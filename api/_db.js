import { neon } from "@neondatabase/serverless";

let initialized = false;

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
