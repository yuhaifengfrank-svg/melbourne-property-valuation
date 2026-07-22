import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregatePlanningPipeline,
  extractDwellingYield,
  normalizePlanningApplication,
  planningStatusWeight,
} from "../lib/planning-application-normalizer.js";

test("extracts explicit dwelling quantities and replacement supply", () => {
  assert.deepEqual(extractDwellingYield("The construction of twelve (12) dwellings"), {
    newDwellings: 12, demolishedDwellings: 0, netDwellings: 12,
    quality: "description_extracted", warnings: [],
  });
  assert.equal(extractDwellingYield("Demolition of an existing dwelling and construction of a new dwelling").netDwellings, 0);
});

test("does not turn subdivisions or dwelling alterations into new supply", () => {
  assert.equal(extractDwellingYield("Two (2) lot subdivision").quality, "not_applicable");
  assert.equal(extractDwellingYield("Additions and alterations to an existing dwelling").newDwellings, 0);
});

test("marks unstated residential yield as unresolved", () => {
  const result = extractDwellingYield("Use and development of the land for a rooming house");
  assert.equal(result.newDwellings, null);
  assert.deepEqual(result.warnings, ["residential_yield_not_stated"]);
});

test("status weights fail closed for inactive applications", () => {
  assert.equal(planningStatusWeight({ status: "Application Lapsed" }), 0);
  assert.equal(planningStatusWeight({ status: "Appeal Lodged with VCAT", decision: "Notice of Decision" }), 0.5);
  assert.equal(planningStatusWeight({ decision: "Planning Permit to Issue" }), 1);
});

test("normalizes amendments and Australian dates", () => {
  const row = normalizePlanningApplication({
    application: "TPA/54711/A", lodged: "8/09/2025", type: "Dual Occupancy",
    location: "1205 North Road OAKLEIGH VIC 3166", suburb: "Oakleigh", postcode: 3166,
    description: "Construction of two (2) double storey dwellings", decision: "Amended Permit",
  });
  assert.equal(row.baseApplicationNumber, "TPA/54711");
  assert.equal(row.amendment, true);
  assert.equal(row.lodgedDate, "2025-09-08");
  assert.equal(row.newDwellings, 2);
});

test("deduplicates amendments and applies status-weighted dwelling supply", () => {
  const result = aggregatePlanningPipeline([
    { application: "TPA/1", lodged: "01/01/2025", suburb: "Oakleigh", postcode: 3166, description: "Construction of two dwellings", decision: "Planning Permit to Issue" },
    { application: "TPA/1/A", lodged: "01/06/2025", suburb: "Oakleigh", postcode: 3166, description: "Construction of three dwellings", decision: "Amended Permit" },
    { application: "TPA/2", lodged: "02/06/2025", suburb: "Oakleigh", postcode: 3166, description: "Construction of two dwellings", status: "Application Lapsed" },
    { application: "TPA/3", lodged: "02/06/2025", suburb: "Oakleigh South", postcode: 3167, description: "Construction of four dwellings", decision: "Planning Permit to Issue" },
  ], { suburb: "Oakleigh", postcode: "3166" });
  assert.equal(result.rawApplicationCount, 3);
  assert.equal(result.uniqueProjectCount, 2);
  assert.equal(result.grossProposedDwellings, 5);
  assert.equal(result.weightedNetPipeline, 3);
});
