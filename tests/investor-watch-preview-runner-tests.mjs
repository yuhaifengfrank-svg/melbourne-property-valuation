import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "scripts/run-migration-013-preview.mjs"), "utf8");

test("Preview runner never falls back to DATABASE_URL", () => {
  assert.match(source, /process\.env\.PREVIEW_DATABASE_URL/);
  assert.doesNotMatch(source, /process\.env\.DATABASE_URL\b/);
});

test("Preview runner requires exact host allowlisting and rejects production", () => {
  assert.match(source, /INVESTOR_WATCH_PREVIEW_DB_HOST/);
  assert.match(source, /parsed\.hostname !== expectedHost/);
  assert.match(source, /Production database is forbidden/);
});

test("writes require an explicit one-purpose switch while verify remains read-only", () => {
  assert.match(source, /mode !== "--verify"/);
  assert.match(source, /ALLOW_IW_PREVIEW_MIGRATION !== "yes"/);
  assert.match(source, /--apply/);
  assert.match(source, /--rollback/);
});

test("Preview runner verifies every table used by member and watch services", () => {
  for (const table of [
    "lead_contacts", "consent_records", "suburb_metrics",
  ]) {
    assert.match(source, new RegExp(`\\b${table}\\b`));
  }
  assert.doesNotMatch(source, /\breport_snapshots\b/);
  assert.doesNotMatch(source, /\bmembership_report_usage\b/);
});
