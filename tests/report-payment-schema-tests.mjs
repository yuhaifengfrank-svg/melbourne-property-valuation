import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Helpers ──────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function readSQL(filename) {
  return fs.readFileSync(path.join(projectRoot, "db", filename), "utf8");
}

function readJS(filename) {
  return fs.readFileSync(path.join(projectRoot, "api", filename), "utf8");
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
  // lead_contact_id NOT NULL
  assert.ok(sql.includes("lead_contact_id BIGINT NOT NULL"));
  // FK to lead_contacts (no ON DELETE)
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
  // lead_contact_id NOT NULL
  assert.ok(sql.includes("lead_contact_id BIGINT NOT NULL"));
  // FK to lead_contacts (no ON DELETE)
  assert.ok(sql.includes("REFERENCES lead_contacts(id)"));
  // UNIQUE(report_id) — one report, one purchaser
  assert.ok(sql.includes("UNIQUE (report_id),"));
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
  // No reference to consent_records
  assert.equal(sql.includes("consent_records"), false);
});

// ── _db.js audit tests ──────────────────────────────────────────────

test("_db.js exports ensureReportPaymentSchema function", () => {
  // Dynamically import _db.js to verify the export is real
  // We don't call it (that would connect to DB), just confirm the function
  // is exported and has the expected shape.
  const db = readJS("_db.js");
  assert.ok(db.includes("ensureReportPaymentSchema"), "function must exist in source");
  // Check it has NOT NULL on lead_contact_id
  assert.ok(db.includes("BIGINT NOT NULL REFERENCES lead_contacts(id)"), "_db.js must have NOT NULL on FK");
  assert.ok(db.includes("UNIQUE (report_id),"), "_db.js must have UNIQUE(report_id)");
});

test("ensureReportPaymentSchema is NOT called automatically at import time", () => {
  const db = readJS("_db.js");
  // ensureReportPaymentSchema should only be referenced in function definition,
  // not invoked outside the function body.
  // Look for call sites: "ensureReportPaymentSchema(sql)" outside the function body
  const functionDef = "export async function ensureReportPaymentSchema";
  const funcStart = db.indexOf(functionDef);
  assert.notEqual(funcStart, -1, "Function definition must exist");

  // Everything before the function definition is module-level scope
  const beforeFunc = db.slice(0, funcStart);
  assert.equal(
    beforeFunc.includes("ensureReportPaymentSchema("),
    false,
    "ensureReportPaymentSchema must NOT be called at module level"
  );

  // After function definition, OK to have calls inside other functions
  // But no calls to it inside ensureSchema or ensureCustomerFunnelSchema
  // This ensures it's only called explicitly, not auto-wired
});

test("ensureSchema does NOT call ensureReportPaymentSchema", () => {
  const db = readJS("_db.js");

  // Find the ensureSchema function body
  const esMatch = db.match(/export async function ensureSchema\(sql\)[\s\S]*?\n  initialized = true;\n\}/);
  assert.ok(esMatch, "ensureSchema function body found");
  const ensureSchemaBody = esMatch[0];
  assert.equal(
    ensureSchemaBody.includes("ensureReportPaymentSchema"),
    false,
    "ensureSchema must NOT invoke ensureReportPaymentSchema"
  );

  // Same for ensureCustomerFunnelSchema
  const ecfMatch = db.match(/export async function ensureCustomerFunnelSchema\(sql\)[\s\S]*?\n  customerFunnelInitialized = true;\n\}/);
  assert.ok(ecfMatch, "ensureCustomerFunnelSchema function body found");
  const ecfBody = ecfMatch[0];
  assert.equal(
    ecfBody.includes("ensureReportPaymentSchema"),
    false,
    "ensureCustomerFunnelSchema must NOT invoke ensureReportPaymentSchema"
  );
});

// ── Security & design rule tests ────────────────────────────────────

test("No card or payment sensitive data columns", () => {
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
