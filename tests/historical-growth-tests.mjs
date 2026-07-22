import test from "node:test";
import assert from "node:assert/strict";
import { calculateCagr, deriveHistoricalGrowth } from "../lib/historical-growth.js";

test("CAGR uses actual elapsed years rather than a fixed root", () => {
  assert.equal(calculateCagr({ startValue: 801500, endValue: 1311000,
    startDate: "2014-12-31", endDate: "2024-12-31" }), 5.04);
});

test("Oakleigh official annual observations produce source-labelled growth", () => {
  const observations = [
    [2014, 801500], [2019, 1101000], [2021, 1388000], [2023, 1336500], [2024, 1311000],
  ].map(([year, value]) => ({ value, asOf: `${year}-12-31`, sourceKey: "vgv_property_values",
    propertyType: "house", geography: "Oakleigh" }));
  const result = deriveHistoricalGrowth(observations, { asOf: "2024-12-31" });
  assert.equal(result.metrics["10y"].value, 5.04);
  assert.equal(result.metrics["5y"].value, 3.55);
  assert.equal(result.metrics["3y"].value, -1.88);
  assert.equal(result.metrics["1y"].value, -1.9);
  assert.equal(result.metrics["10y"].sourceKey, "vgv_property_values");
});

test("missing historical anchor remains unavailable", () => {
  const result = deriveHistoricalGrowth([{ value: 100, asOf: "2024-12-31" }]);
  assert.equal(result.metrics["1y"], null);
  assert.equal(result.metrics["10y"], null);
});
