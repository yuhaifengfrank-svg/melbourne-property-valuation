import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBuildingPermitRow, aggregateResidentialPermitSupply } from "../lib/building-permit-normalizer.js";

test("normalizes official-style field names without depending on column order", () => {
  const row = normalizeBuildingPermitRow({
    "Permit Number": "BP-1", Municipality: "Monash", Suburb: "Oakleigh", Postcode: "3166",
    "Issue Date": "2025-10-01", "Nature of Work": "Construct two new dwellings",
    "Number of Dwellings": "2", "Estimated Cost": "$800,000",
  });
  assert.equal(row.suburb, "OAKLEIGH");
  assert.equal(row.newDwellings, 2);
  assert.equal(row.estimatedCost, 800000);
  assert.equal(row.quality, "reported");
});

test("does not count a non-residential alteration as dwelling supply", () => {
  const result = aggregateResidentialPermitSupply([{ Council: "Monash", Suburb: "Oakleigh", "Issue Date": "2025-06-01", Description: "Alter office fitout" }], { suburb: "Oakleigh" });
  assert.equal(result.newDwellings, 0);
  assert.equal(result.excludedRows, 1);
});

test("keeps inferred dwelling counts visibly separate", () => {
  const result = aggregateResidentialPermitSupply([{ LGA: "Monash", Locality: "Oakleigh", "Date Issued": "2025-06-01", Description: "Construct new residential dwelling" }], { suburb: "Oakleigh" });
  assert.equal(result.newDwellings, 1);
  assert.equal(result.inferredDwellingRows, 1);
  assert.equal(result.reportedDwellingRows, 0);
});

test("filters by suburb and period", () => {
  const rows = [
    { LGA: "Monash", Suburb: "Oakleigh", "Issue Date": "2025-02-01", Description: "New dwelling", "New Dwellings": 1 },
    { LGA: "Monash", Suburb: "Clayton", "Issue Date": "2025-02-01", Description: "New dwelling", "New Dwellings": 4 },
    { LGA: "Monash", Suburb: "Oakleigh", "Issue Date": "2024-02-01", Description: "New dwelling", "New Dwellings": 3 },
  ];
  const result = aggregateResidentialPermitSupply(rows, { suburb: "Oakleigh", periodStart: "2025-01-01", periodEnd: "2025-12-31" });
  assert.equal(result.newDwellings, 1);
  assert.equal(result.permitCount, 1);
});
