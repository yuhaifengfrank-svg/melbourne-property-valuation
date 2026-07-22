import assert from "node:assert/strict";
import test from "node:test";
import { aggregateSalmRows, parseSalmFile } from "../lib/salm-data-parser.js";

const source = new URL("./fixtures/salm-mount-waverley-oakleigh.csv", import.meta.url);
const rows = parseSalmFile(source, "Dec-25");
const byCode = Object.fromEntries(rows.map((row) => [row.sa2_code, row]));

test("Oakleigh uses December 2025 SALM and computes true YoY employment growth", () => {
  const row = byCode["212051326"];
  assert.equal(row.labour_force, 15709);
  assert.equal(row.unemployed, 383);
  assert.equal(row.employment_count, 15326);
  assert.ok(Math.abs(row.employment_growth_yoy - 4.6715) < 0.001);
  assert.equal(row.employment_growth_base_quarter, "Dec-24");
});

test("Mount Waverley aggregates North and South rather than selecting one SA2", () => {
  const selected = [byCode["212051323"], byCode["212051324"]].map((row) => ({
    ...row,
    base_employment_count: row.historical_data["Dec-24"].lf - row.historical_data["Dec-24"].unemp,
  }));
  const result = aggregateSalmRows(selected);
  assert.deepEqual(result.sa2_codes, ["212051323", "212051324"]);
  assert.equal(result.labour_force, 21241);
  assert.equal(result.unemployed, 331);
  assert.equal(result.employment_count, 20910);
  assert.ok(Math.abs(result.unemployment_rate - 1.5583) < 0.001);
  assert.ok(Math.abs(result.employment_growth_yoy - 4.6809) < 0.001);
});

test("migration separates employment count and growth fields", async () => {
  const migration = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../db/migration-016-salm-employment-correction.sql", import.meta.url), "utf8"));
  assert.match(migration, /employment_count INTEGER/);
  assert.match(migration, /employment_growth_yoy NUMERIC/);
  assert.match(migration, /suburb_sa2_membership/);
});

test("services prefer verified multi-SA2 membership over LIMIT 1", async () => {
  const { readFile } = await import("node:fs/promises");
  const salmService = await readFile(new URL("../lib/salm-service.js", import.meta.url), "utf8");
  const censusService = await readFile(new URL("../lib/census-service.js", import.meta.url), "utf8");
  assert.match(salmService, /suburb_sa2_membership/);
  assert.match(censusService, /suburb_sa2_membership/);
  assert.match(censusService, /aggregateCensusSummaries/);
});
