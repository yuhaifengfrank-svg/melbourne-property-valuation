import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const migrationPath = path.join(
  root,
  "db",
  "migration-013-investor-watch-foundation.sql"
);
const rollbackPath = path.join(
  root,
  "db",
  "rollback-013-investor-watch-foundation.sql"
);
const migration = fs.readFileSync(migrationPath, "utf8");
const rollback = fs.readFileSync(rollbackPath, "utf8");

const expectedTables = [
  "member_login_tokens",
  "member_sessions",
  "investor_watch_memberships",
  "investor_watch_items",
  "membership_report_usage",
];

test("migration and rollback files are substantive", () => {
  assert.ok(migration.length > 5000, "migration is unexpectedly short");
  assert.ok(rollback.length > 500, "rollback is unexpectedly short");
  assert.match(migration, /^-- ={20,}/);
  assert.match(rollback, /^-- ={20,}/);
});

test("migration is atomic", () => {
  assert.match(migration, /\bBEGIN;/);
  assert.match(migration, /\bCOMMIT;/);
  assert.ok(migration.indexOf("BEGIN;") < migration.indexOf("CREATE TABLE"));
  assert.ok(migration.lastIndexOf("COMMIT;") > migration.lastIndexOf("CREATE INDEX"));
});

test("migration creates exactly the five Phase 1 foundation tables", () => {
  const created = [
    ...migration.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/g),
  ].map((match) => match[1]);
  assert.deepEqual(created, expectedTables);
});

test("existing BIGINT contact identity is preserved", () => {
  const contactForeignKeys = migration.match(
    /lead_contact_id\s+BIGINT NOT NULL[^\n]*REFERENCES lead_contacts\(id\)/g
  );
  assert.equal(contactForeignKeys?.length, 4);
  assert.doesNotMatch(migration, /lead_contact_id\s+UUID/i);
});

test("existing TEXT report identity is preserved", () => {
  assert.match(
    migration,
    /report_id\s+TEXT NOT NULL REFERENCES report_snapshots\(report_id\)/
  );
  assert.doesNotMatch(migration, /report_id\s+UUID/i);
});

test("Magic Link tokens store hashes, expiry and one-time consumption", () => {
  assert.match(migration, /token_hash\s+TEXT NOT NULL UNIQUE/);
  assert.match(migration, /expires_at\s+TIMESTAMPTZ NOT NULL/);
  assert.match(migration, /consumed_at\s+TIMESTAMPTZ/);
  assert.match(migration, /WHERE consumed_at IS NULL/);
  assert.doesNotMatch(migration, /\bpassword(?:_hash)?\b/i);
  assert.doesNotMatch(migration, /\braw_token\b/i);
});

test("member sessions are revocable and store only token hashes", () => {
  assert.match(migration, /session_token_hash\s+TEXT NOT NULL UNIQUE/);
  assert.match(migration, /revoked_at\s+TIMESTAMPTZ/);
  assert.match(migration, /last_seen_at\s+TIMESTAMPTZ NOT NULL/);
  assert.doesNotMatch(migration, /\bsession_token\s+TEXT/i);
});

test("membership schema supports Preview and subscription lifecycle states", () => {
  for (const status of [
    "preview",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
  ]) {
    assert.ok(migration.includes(`'${status}'`), `missing status ${status}`);
  }
  assert.match(migration, /report_limit\s+INTEGER NOT NULL DEFAULT 10/);
  assert.match(migration, /lead_contact_id\s+BIGINT NOT NULL UNIQUE/);
  assert.match(migration, /stripe_subscription_id\s+TEXT UNIQUE/);
});

test("watch items enforce canonical active-item uniqueness", () => {
  assert.match(migration, /canonical_item_key\s+TEXT NOT NULL/);
  assert.match(
    migration,
    /ON investor_watch_items \(lead_contact_id, canonical_item_key\)\s+WHERE status = 'active'/
  );
  assert.match(migration, /item_type IN \('suburb', 'property'\)/);
  assert.match(migration, /item_type = 'suburb' AND property_key IS NULL/);
  assert.match(migration, /item_type = 'property' AND property_key IS NOT NULL/);
});

test("watch item user-controlled fields are bounded", () => {
  assert.match(migration, /char_length\(private_note\) <= 1000/);
  assert.match(migration, /char_length\(canonical_item_key\) BETWEEN 3 AND 500/);
  for (const goal of ["balanced", "growth", "income", "school", "value"]) {
    assert.ok(migration.includes(`'${goal}'`), `missing goal ${goal}`);
  }
});

test("report allowance ledger is idempotent across billing periods", () => {
  assert.match(migration, /idempotency_key\s+TEXT NOT NULL UNIQUE/);
  assert.match(
    migration,
    /UNIQUE \(membership_id, report_id\)/,
    "the same report must not consume membership allowance twice"
  );
  assert.match(
    migration,
    /ON membership_report_usage \(membership_id, billing_period_start, created_at\)/
  );
});

test("forward migration does not mutate or remove existing tables", () => {
  assert.doesNotMatch(migration, /\bALTER\s+TABLE\b/i);
  assert.doesNotMatch(migration, /\bDROP\s+(?:TABLE|COLUMN|INDEX)\b/i);
  assert.doesNotMatch(migration, /\bTRUNCATE\b/i);
  assert.doesNotMatch(migration, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(migration, /\bUPDATE\s+(?:lead_contacts|report_snapshots)\b/i);
});

test("schema stores no email, card or payment-secret fields", () => {
  for (const forbidden of [
    "card_number",
    "cardholder",
    "cvv",
    "cvc",
    "password_hash",
    "stripe_secret",
    "webhook_secret",
  ]) {
    assert.equal(
      migration.toLowerCase().includes(forbidden),
      false,
      `must not store ${forbidden}`
    );
  }
  assert.doesNotMatch(migration, /\bemail\s+TEXT/i);
});

test("migration contains no environment, network or deployment operations", () => {
  assert.doesNotMatch(migration, /DATABASE_URL|postgresql:\/\/|https?:\/\//i);
  assert.doesNotMatch(migration, /vercel|curl|fetch\(|stripe\.com/i);
});

test("rollback drops only the five new tables in reverse dependency order", () => {
  const dropped = [
    ...rollback.matchAll(/DROP TABLE IF EXISTS\s+([a-z_]+)/g),
  ].map((match) => match[1]);
  assert.deepEqual(dropped, [...expectedTables].reverse());
  assert.equal(dropped.includes("lead_contacts"), false);
  assert.equal(dropped.includes("report_snapshots"), false);
  assert.doesNotMatch(rollback, /\bCASCADE\b/i);
});

test("migration is not auto-applied by api/_db.js", () => {
  const dbSource = fs.readFileSync(path.join(root, "api", "_db.js"), "utf8");
  for (const table of expectedTables) {
    assert.equal(
      dbSource.includes(table),
      false,
      `${table} must not be auto-created during Phase 1 design/migration review`
    );
  }
});
