import test from "node:test";
import assert from "node:assert/strict";
import { parseDffhSheet } from "../scripts/loaders/parse-dffh-rents.mjs";

const rows = [
  ["Moving annual median rent by suburb and town"],
  [null, null, "Jun 2025", "Jun 2025", "Sep 2025", "Sep 2025"],
  [null, null, "Count", "Median", "Count", "Median"],
  ["region", "Doncaster East-Donvale", 203, 670, 194, 680],
  [null, "Balwyn", 40, 700, 42, 710],
  [null, "No data", "-", "-", "-", "-"],
];

test("DFFH parser dynamically locates period columns", () => {
  const result = parseDffhSheet(rows, { bedrooms: 3, targetPeriod: "2025-09-30" });
  assert.equal(result.length, 2);
  assert.equal(result[0].value, 680);
  assert.equal(result[0].sampleSize, 194);
});

test("combined DFFH geography is not publishable as a suburb fact", () => {
  const [combined, exact] = parseDffhSheet(rows, { bedrooms: 3, targetPeriod: "2025-09-30" });
  assert.equal(combined.geographyType, "combined_suburb");
  assert.equal(combined.publicationEligibleAsSuburbFact, false);
  assert.equal(exact.geographyType, "suburb");
  assert.equal(exact.publicationEligibleAsSuburbFact, true);
});

test("only 3 and 4 bedroom houses are accepted", () => {
  assert.throws(() => parseDffhSheet(rows, { bedrooms: 2 }));
});
