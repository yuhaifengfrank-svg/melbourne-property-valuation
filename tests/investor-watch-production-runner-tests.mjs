import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "scripts/run-migration-013-production.mjs"), "utf8");

test("Production runner never uses generic or Preview database variables", () => {
  assert.match(source, /process\.env\.PRODUCTION_DATABASE_URL/);
  assert.doesNotMatch(source, /process\.env\.DATABASE_URL\b/);
  assert.doesNotMatch(source, /process\.env\.PREVIEW_DATABASE_URL/);
});

test("Production runner requires an exact approved host and rejects Preview", () => {
  assert.match(source, /INVESTOR_WATCH_PRODUCTION_DB_HOST/);
  assert.match(source, /parsed\.hostname !== expectedHost/);
  assert.match(source, /Preview database is forbidden/);
});

test("Production writes require two explicit release confirmations", () => {
  assert.match(source, /ALLOW_IW_PRODUCTION_MIGRATION !== "apply-migration-013"/);
  assert.match(source, /PRODUCTION_RELEASE_CONFIRMATION !== "investor-watch-v1"/);
  assert.doesNotMatch(source, /--rollback/);
});

test("Production runner verifies real V1 dependencies and all seven tables", () => {
  for (const table of ["lead_contacts", "consent_records", "suburb_metrics"]) {
    assert.match(source, new RegExp(`\\b${table}\\b`));
  }
  assert.doesNotMatch(source, /membership_report_usage/);
  assert.match(source, /after\.length !== expectedTables\.length/);
});
