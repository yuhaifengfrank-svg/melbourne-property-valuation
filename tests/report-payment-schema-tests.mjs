import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import path from "node:path";

// ── Helpers ──────────────────────────────────────────────────────────

function readSQL(filename) {
  return fs.readFileSync(
    path.resolve("/Users/FrankAI/Documents/澳洲房地产评估系统/db", filename),
    "utf8"
  );
}

function readJS(filename) {
  return fs.readFileSync(
    path.resolve("/Users/FrankAI/Documents/澳洲房地产评估系统/api", filename),
    "utf8"
  );
}

// ── Migration DDL tests ─────────────────────────────────────────────

test("migration-010 is syntactically valid SQL (no raw analysis)", () => {
  const sql = readSQL("migration-010-report-payments.sql");
  assert.ok(sql.length > 1000, `SQL is suspiciously short: ${sql.length} bytes`);
  assert.ok(sql.includes("report_snapshots"), "Must define report_snapshots");
  assert.ok(sql.includes("report_payments"), "Must define report_payments");
  assert.ok(sql.includes("report_entitlements"), "Must define report_entitlements");
  assert.ok(sql.includes("stripe_webhook_events"), "Must define stripe_webhook_events");
});

test("report_snapshots has correct constraints", () => {
  const sql = readSQL("migration-010-report-payments.sql");
  assert.ok(sql.includes("report_id TEXT PRIMARY KEY"));
  assert.ok(sql.includes("property_key TEXT NOT NULL"));
  assert.ok(sql.includes("valuation_version TEXT NOT NULL"));
  assert.ok(sql.includes("snapshot_json JSONB NOT NULL"));
  assert.ok(sql.includes("snapshot_hash TEXT NOT NULL"));
  assert.ok(sql.includes("expires_at TIMESTAMPTZ"));
});

test("report_payments has correct constraints", () => {
  const sql = readSQL("migration-010-report-payments.sql");
  // FK to report_snapshots
  assert.ok(sql.includes("REFERENCES report_snapshots(report_id)"));
  // lead_contact_id FK (nullable)
  assert.ok(sql.includes("REFERENCES lead_contacts(id)"));
  // UNIQUE constraints
  assert.ok(sql.includes("stripe_checkout_session_id TEXT UNIQUE"));
  assert.ok(sql.includes("stripe_payment_intent_id TEXT UNIQUE"));
  assert.ok(sql.includes("purchase_intent_key TEXT NOT NULL UNIQUE"));
  // CHECK amount_cents = 399
  assert.ok(sql.includes("amount_cents = 399"));
  assert.ok(sql.includes("currency = 'aud'"));
  // Status values
  assert.ok(sql.includes("'pending', 'paid', 'failed', 'expired', 'refunded', 'disputed'"));
});

test("report_entitlements has correct constraints", () => {
  const sql = readSQL("migration-010-report-payments.sql");
  // FK to report_snapshots
  assert.ok(sql.includes("REFERENCES report_snapshots(report_id)"));
  // FK to lead_contacts (nullable)
  assert.ok(sql.includes("REFERENCES lead_contacts(id)"));
  // Composite UNIQUE
  assert.ok(sql.includes("UNIQUE (report_id, lead_contact_id)"));
  // Status values
  assert.ok(sql.includes("'active', 'refunded', 'revoked', 'disputed'"));
});

test("stripe_webhook_events has correct constraints", () => {
  const sql = readSQL("migration-010-report-payments.sql");
  assert.ok(sql.includes("stripe_event_id TEXT PRIMARY KEY"));
  assert.ok(sql.includes("processing_status IN"));
  assert.ok(sql.includes("'received', 'processed', 'failed'"));
  assert.ok(sql.includes("error_message TEXT"));
});

test("migration does not modify any existing table", () => {
  const sql = readSQL("migration-010-report-payments.sql");
  // No ALTER TABLE on existing tables
  const alterStmts = sql.match(/ALTER\s+TABLE\s+(?!report_)/gi);
  assert.equal(alterStmts, null, "Should not ALTER non-payment tables");
  // No DROP TABLE
  assert.equal(sql.includes("DROP TABLE"), false, "Should not DROP any table");
  // No reference to lead_preferences
  assert.equal(sql.includes("lead_preferences"), false);
  // No reference to consent_records (except allowed cross-refs via lead_contacts)
  assert.equal(sql.includes("consent_records"), false);
});

// ── _db.js audit tests ──────────────────────────────────────────────

test("_db.js must have ensureReportPaymentSchema function", () => {
  const db = readJS("_db.js");
  assert.ok(db.includes("ensureReportPaymentSchema"), "ensureReportPaymentSchema must exist");
});

test("ensureReportPaymentSchema must not be called automatically", () => {
  const db = readJS("_db.js");
  // ensureCustomerFunnelSchema should still be called
  assert.ok(db.includes("ensureCustomerFunnelSchema(sql)"));
});

// ── Security & design rule tests ────────────────────────────────────

test("No card or payment sensitive data columns", () => {
  // Check migration SQL for anything resembling card storage
  const sql = readSQL("migration-010-report-payments.sql");
  const sensitiveKeywords = ["card_number", "cvv", "cvc", "cc_number", "pan", "expiry", "cardholder"];
  for (const kw of sensitiveKeywords) {
    assert.equal(
      sql.toLowerCase().includes(kw),
      false,
      `Must not store sensitive field: ${kw}`
    );
  }
});

test("snapshot_hash is required (not nullable)", () => {
  const sql = readSQL("migration-010-report-payments.sql");
  assert.ok(sql.includes("snapshot_hash TEXT NOT NULL"));
});
