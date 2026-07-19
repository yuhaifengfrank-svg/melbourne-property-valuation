import test from "node:test";
import assert from "node:assert/strict";

import {
  comparableDistancePolicy,
  isValidVictoriaCoordinatePair,
} from "../lib/db-comparable-source.js";
import { valueProperty } from "../lib/valuation-engine.js";

test("coordinate validation rejects NaN, zero, and coordinates outside Victoria", () => {
  assert.equal(isValidVictoriaCoordinatePair(-37.81, 145.08), true);
  assert.equal(isValidVictoriaCoordinatePair("NaN", 145.08), false);
  assert.equal(isValidVictoriaCoordinatePair(0, 0), false);
  assert.equal(isValidVictoriaCoordinatePair(-33.86, 151.21), false);
});

test("same-suburb comparable with invalid coordinates is retained with unknown distance", () => {
  const result = comparableDistancePolicy(
    { suburb: "Balwyn", coordinates: { lat: -37.81, lon: 145.08 } },
    { suburb: " balwyn ", lat: "NaN", lon: "NaN" },
  );
  assert.deepEqual(result, {
    keep: true,
    distanceMeters: null,
    status: "same_suburb_distance_unavailable",
  });
});

test("cross-suburb comparable is rejected unless both coordinate pairs are valid", () => {
  const invalid = comparableDistancePolicy(
    { suburb: "Balwyn", coordinates: { lat: -37.81, lon: 145.08 } },
    { suburb: "Kew", lat: "NaN", lon: "NaN" },
  );
  assert.equal(invalid.keep, false);

  const valid = comparableDistancePolicy(
    { suburb: "Balwyn", coordinates: { lat: -37.81, lon: 145.08 } },
    { suburb: "Kew", lat: -37.807, lon: 145.03 },
  );
  assert.equal(valid.keep, true);
  assert.equal(valid.status, "measured");
  assert.ok(valid.distanceMeters > 0);
});

function comp(i, distanceMeters) {
  return {
    address: `${i} Test Street, Balwyn VIC`,
    salePrice: 1000000 + i * 10000,
    saleDate: "2026-06-01",
    propertyType: "House",
    bedrooms: 3,
    bathrooms: 2,
    carSpaces: 2,
    landSize: 600,
    sourceUrl: `https://example.test/${i}`,
    sourceCount: 1,
    distanceMeters,
  };
}

test("unknown comparable distances reduce confidence and widen the estimate range", () => {
  const subject = {
    address: "Subject",
    suburb: "Balwyn",
    propertyType: "House",
    bedrooms: 3,
    bathrooms: 2,
    carSpaces: 2,
    landSize: 600,
  };
  const measured = valueProperty({
    subject,
    comparables: [comp(1, 200), comp(2, 400), comp(3, 600)],
    asOfDate: "2026-07-19",
  });
  const unknown = valueProperty({
    subject,
    comparables: [comp(1, null), comp(2, null), comp(3, null)],
    asOfDate: "2026-07-19",
  });

  assert.equal(measured.ok, true);
  assert.equal(unknown.ok, true);
  assert.ok(unknown.confidence.dataScore < measured.confidence.dataScore);
  assert.ok(unknown.estimate.sigma > measured.estimate.sigma);
  assert.ok(unknown.confidence.reasons.some(reason => reason.includes("unknown distance")));
});
