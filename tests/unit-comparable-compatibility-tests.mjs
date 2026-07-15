import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbSource = fs.readFileSync(path.join(root, "lib/db-comparable-source.js"), "utf8");
const engine = fs.readFileSync(path.join(root, "lib/valuation-engine.js"), "utf8");

test("Unit DB lookup includes Unit, Townhouse and Villa but excludes Apartment", () => {
  assert.match(dbSource, /Unit:\s*new Set\(\['Unit', 'Townhouse', 'Villa'\]\)/);
  assert.doesNotMatch(dbSource, /Unit:\s*new Set\(\[[^\]]*'Apartment'/);
});

test("valuation engine rejects Apartment as a Unit comparable", () => {
  assert.match(engine, /Unit:\s*new Set\(\["Unit", "Villa", "Townhouse"\]\)/);
  assert.doesNotMatch(engine, /Unit:\s*new Set\(\[[^\]]*"Apartment"/);
});

test("Apartment keeps its separate compatibility rule", () => {
  assert.match(dbSource, /Apartment:\s*new Set\(\['Apartment', 'Unit'\]\)/);
  assert.match(engine, /Apartment:\s*new Set\(\["Apartment", "Unit"\]\)/);
});
