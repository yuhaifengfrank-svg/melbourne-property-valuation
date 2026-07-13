import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(path.join(root, "db/migration-013-investor-watch.sql"), "utf8");
const rollback = fs.readFileSync(path.join(root, "db/rollback-013-investor-watch.sql"), "utf8");
const tables = [
  "member_login_tokens",
  "member_sessions",
  "investor_watch_memberships",
  "investor_watch_items",
  "investor_watch_score_history",
  "investor_watch_change_events",
  "investor_watch_notification_preferences",
];

test("migration is transactional and creates every V1 table idempotently", () => {
  assert.match(migration, /^--[\s\S]*\bBEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
  for (const table of tables) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  }
});

test("member secrets are stored only as hashes", () => {
  assert.match(migration, /token_hash TEXT NOT NULL UNIQUE/);
  assert.match(migration, /session_token_hash TEXT NOT NULL UNIQUE/);
  assert.doesNotMatch(migration, /\braw_token\b|\bsession_token\s+TEXT/);
});

test("watch ownership, active uniqueness, quotas and history versioning are constrained", () => {
  assert.match(migration, /lead_contact_id BIGINT NOT NULL REFERENCES lead_contacts\(id\) ON DELETE CASCADE/);
  assert.match(migration, /idx_iw_items_active_unique/);
  assert.match(migration, /suburb_limit INTEGER NOT NULL DEFAULT 3/);
  assert.match(migration, /property_limit INTEGER NOT NULL DEFAULT 2/);
  assert.match(migration, /UNIQUE \(watch_item_id, model_version, data_as_of\)/);
  assert.match(migration, /CREATE TRIGGER trg_enforce_investor_watch_limit/);
  assert.match(migration, /FOR UPDATE/);
});

test("notifications are fail-closed in the MVP", () => {
  assert.match(migration, /email_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(migration, /weekly_digest BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(migration, /planning_alerts BOOLEAN NOT NULL DEFAULT FALSE/);
});

test("rollback removes only V1 tables in dependency order", () => {
  let previous = -1;
  for (const table of [...tables].reverse()) {
    const position = rollback.indexOf(`DROP TABLE IF EXISTS ${table}`);
    assert.ok(position > previous, `${table} must be dropped in dependency order`);
    previous = position;
  }
  assert.doesNotMatch(rollback, /DROP TABLE IF EXISTS (lead_contacts|report_|suburb_)/);
});
