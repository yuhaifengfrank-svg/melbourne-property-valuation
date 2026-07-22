import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { TARGET_DATA_CUTOFF, buildMetric, createResearchTask, estimateHouseRent, estimatePopulation,
  estimateRentalStock, estimateRentalVacancy, publicationDecision, selectLatestEligibleObservation }
  from "../lib/suburb-market-data-policy.js";

test("cutoff is fixed at 2025 year end", () => assert.equal(TARGET_DATA_CUTOFF, "2025-12-31"));
test("facts require source and estimates require model version", () => {
  assert.throws(() => buildMetric({ name: "x", value: 1, kind: "fact", definition: "x", geography: "VIC", asOf: "2025-12-31" }));
  assert.throws(() => buildMetric({ name: "x", value: 1, kind: "estimate", definition: "x", geography: "VIC", asOf: "2025-12-31" }));
});
test("selection excludes post-cutoff and wrong-geography data", () => {
  const item = selectLatestEligibleObservation([
    { value: 600, asOf: "2025-09-30", geography: "Doncaster East", propertyType: "house", bedrooms: 3 },
    { value: 650, asOf: "2026-03-31", geography: "Doncaster East", propertyType: "house", bedrooms: 3 },
    { value: 620, asOf: "2025-12-31", geography: "Donvale", propertyType: "house", bedrooms: 3 },
  ], { geography: "Doncaster East", propertyType: "house", bedrooms: 3 });
  assert.equal(item.value, 600);
});
test("rent model only supports 3/4-bedroom houses", () => {
  const metric = estimateHouseRent({ combinedAreaAnchor: 670, localListingIndexAtAnchor: 690,
    combinedListingIndexAtAnchor: 680, localListingIndexAtCutoff: 710, bedrooms: 3, sampleSize: 32,
    suburb: "Doncaster East" });
  assert.equal(metric.kind, "estimate"); assert.equal(metric.confidence, "high"); assert.ok(metric.value > 670);
  assert.throws(() => estimateHouseRent({ bedrooms: 2 }));
});
test("rent is unavailable below five local observations", () => {
  const metric = estimateHouseRent({ combinedAreaAnchor: 820, localListingIndexAtAnchor: 820,
    combinedListingIndexAtAnchor: 810, localListingIndexAtCutoff: 830, bedrooms: 4, sampleSize: 4 });
  assert.equal(metric.kind, "unavailable");
});
test("rental stock uses dwelling and bond changes", () => {
  assert.equal(estimateRentalStock({ rentedDwellings2021: 1000, dwellingStock2021: 5000,
    dwellingStock2025: 5500, rentalBondIndex2021: 100, rentalBondIndex2025: 105 }), 1155);
});
test("vacancy uses 21-day listings and rental stock", () => {
  const metric = estimateRentalVacancy({ uniqueListings21Days: 20, estimatedRentalStock: 1000,
    benchmarkObservedRate: 2, benchmarkModelledRate: 2.5, suburb: "Doncaster East" });
  assert.equal(metric.kind, "estimate"); assert.equal(metric.value, 1.6);
  assert.match(metric.limitations[0], /not the 2021 Census/i);
});
test("vacancy fails closed without inputs", () => assert.equal(estimateRentalVacancy({ suburb: "X" }).kind, "unavailable"));
test("population rate is bounded", () => {
  const metric = estimatePopulation({ population: 10000, sourceAsOf: "2024-12-31", annualRate: 0.2, suburb: "Example" });
  assert.equal(metric.kind, "estimate"); assert.ok(metric.value <= 10410);
});
test("publication gate suppresses unavailable and insufficient confidence", () => {
  assert.equal(publicationDecision({ kind: "unavailable", value: null }).publish, false);
  assert.equal(publicationDecision({ kind: "estimate", value: 2, confidence: "low", asOf: "2025-12-31" }, { minimumConfidence: "medium" }).publish, false);
});
test("missing data creates free-source research task", () => {
  const task = createResearchTask({ suburb: "Balwyn", metric: "house_rent_3br", propertyType: "house", bedrooms: 3 });
  assert.equal(task.costConstraint, "free"); assert.equal(task.status, "source_research_required");
});
test("legacy refresh cannot repopulate known-invalid rental metrics", () => {
  const source = fs.readFileSync(new URL("../lib/refresh-suburb-metrics.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Unoccupied_PDs_Dwgs/);
  assert.doesNotMatch(source, /Filled unmapped suburb vacancies with global avg/);
  assert.doesNotMatch(source, /Median_rent_weekly/);
});

test("known-invalid legacy rental fields cannot reach public scoring or copy", () => {
  const opportunityApi = fs.readFileSync(new URL("../api/opportunity.js", import.meta.url), "utf8");
  const simpleReport = fs.readFileSync(new URL("../api/simple-report.js", import.meta.url), "utf8");
  const aiCopy = fs.readFileSync(new URL("../lib/opportunity-ai.js", import.meta.url), "utf8");
  const researchGenerator = fs.readFileSync(new URL("../scripts/generate-research-pages.cjs", import.meta.url), "utf8");
  const contentData = fs.readFileSync(new URL("../scripts/fetch-content-data2.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(opportunityApi, /toNumberOrNull\(r\.(?:vacancy_rate|gross_yield)\)/);
  assert.doesNotMatch(simpleReport, /Number\(sm\.vacancy_rate\)/);
  assert.doesNotMatch(aiCopy, /metrics\.vacancy_rate/);
  assert.doesNotMatch(researchGenerator, /Number\(r\.vacancy_rate\)/);
  assert.doesNotMatch(contentData, /ORDER BY vacancy_rate/);
});

test("observation migration is additive and cannot rewrite legacy metrics", () => {
  const migration = fs.readFileSync(new URL("../db/migration-014-suburb-market-observations.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS suburb_metric_observations/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS suburb_data_research_queue/);
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE|UPDATE|ALTER)\b/i);
  assert.match(migration, /metric_kind IN \('fact','derived_fact','estimate','signal','score','unavailable'\)/);
  assert.match(migration, /cost_constraint = 'free'/);
});

test("source registry never automates licence-blocked sources", () => {
  const registry = JSON.parse(fs.readFileSync(new URL("../data/free-source-registry.json", import.meta.url), "utf8"));
  assert.equal(registry.rules.cost, "free");
  assert.equal(registry.rules.bypassAccessControls, false);
  const blocked = registry.sources.filter((source) => source.kind === "licence_blocked");
  assert.ok(blocked.length > 0);
  assert.ok(blocked.every((source) => source.automationAllowed === false));
});
