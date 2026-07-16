import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  appendPriceFilter,
  mapOpportunityRow,
} from "../api/opportunity.js";
import opportunityHandler from "../api/opportunity.js";
import { buildOpportunityPublicScore } from "../lib/opportunity-public-contract.js";

test("legacy suburb intelligence is routed through the opportunity aggregator", async () => {
  const response = {
    statusCode: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
  await opportunityHandler({ method: "GET", query: { action: "suburb-intelligence" } }, response);
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error, "Missing required parameter: suburb");
});
import {
  isSupportedFutureStrategy,
  normalizeStrategy,
} from "../lib/future-opportunity-outlook.js";

test("appendPriceFilter uses house median for house budget filters", () => {
  const where = [];
  const params = [];
  const { p } = appendPriceFilter({
    where,
    params,
    p: 0,
    propertyType: "house",
    minPrice: 700000,
    maxPrice: 1100000,
  });

  assert.equal(p, 2);
  assert.deepEqual(params, [700000, 1100000]);
  assert.equal(where.length, 1);
  assert.match(where[0], /median_house_price >= \$1/);
  assert.match(where[0], /median_house_price <= \$2/);
  assert.doesNotMatch(where[0], /median_unit_price/);
});

test("appendPriceFilter uses unit median for unit budget filters", () => {
  const where = [];
  const params = [];
  appendPriceFilter({
    where,
    params,
    p: 3,
    propertyType: "unit",
    minPrice: 450000,
    maxPrice: 720000,
  });

  assert.deepEqual(params, [450000, 720000]);
  assert.match(where[0], /median_unit_price >= \$4/);
  assert.match(where[0], /median_unit_price <= \$5/);
  assert.doesNotMatch(where[0], /median_house_price/);
});

test("appendPriceFilter allows either house or unit when property type is either", () => {
  const where = [];
  const params = [];
  const { p } = appendPriceFilter({
    where,
    params,
    p: 0,
    propertyType: "either",
    minPrice: 500000,
    maxPrice: 900000,
  });

  assert.equal(p, 4);
  assert.deepEqual(params, [500000, 900000, 500000, 900000]);
  assert.match(where[0], /median_house_price/);
  assert.match(where[0], /median_unit_price/);
  assert.match(where[0], / OR /);
});

test("mapOpportunityRow returns one canonical public score without legacy fields", () => {
  const row = {
    suburb: "Scoresby",
    state: "VIC",
    median_house_price: "1050000",
    median_unit_price: "720000",
    gross_yield: "3.4",
    vacancy_rate: "2.2",
    school_score: "62",
    supply_constraint_score: "68",
    infrastructure_score: "58",
    overall_confidence: "72",
    opportunity_score: "31",
    opportunity_type: "Growth Opportunity",
    updated_at: "2026-06-18T00:00:00.000Z",
  };

  const mapped = mapOpportunityRow(row, { strategy: "growth", propertyType: "unit" });

  assert.equal(mapped.suburb, "Scoresby");
  assert.equal(mapped.strategy, "growth");
  assert.equal(mapped.propertyType, "unit");
  assert.equal(mapped.selectedMedianPrice, 720000);
  assert.equal(mapped.selectedMedianPriceType, "unit");
  assert.equal(mapped.score.name, "Future Opportunity Index");
  assert.equal(mapped.score.value, mapped.futureOpportunityIndex);
  assert.equal(mapped.score.display, `${mapped.futureOpportunityIndex}/100`);
  assert.equal(mapped.score.scale, 100);
  assert.equal(mapped.score.modelVersion, "future_outlook_v1");
  assert.equal(mapped.score.horizon, "3-5 years");
  assert.equal(mapped.score.isPriceForecast, false);
  assert.equal("legacyOpportunityScore" in mapped, false);
  assert.equal("legacyOpportunityType" in mapped, false);
  assert.equal("opportunityScore" in mapped, false);
  assert.equal(mapped.predictionType, "future_opportunity_index_0_100");
  assert.equal(mapped.isPriceForecast, false);
  assert.ok(Array.isArray(mapped.why));
  assert.ok(Array.isArray(mapped.risks));
});

test("mapOpportunityRow changes ranking output by strategy", () => {
  const row = {
    suburb: "Incomeville",
    state: "VIC",
    median_house_price: "780000",
    median_unit_price: "520000",
    gross_yield: "5.1",
    vacancy_rate: "1.0",
    school_score: "42",
    supply_constraint_score: "48",
    infrastructure_score: "40",
    overall_confidence: "65",
    opportunity_score: "25",
    opportunity_type: "Balanced Opportunity",
  };

  const income = mapOpportunityRow(row, { strategy: "income", propertyType: "unit" });
  const school = mapOpportunityRow(row, { strategy: "school", propertyType: "unit" });

  assert.ok(income.futureOpportunityIndex > school.futureOpportunityIndex);
});

test("homepage Future Outlook snippet uses the real opportunity API endpoint", () => {
  const appJs = fs.readFileSync(path.resolve("public/app.js"), "utf8");

  assert.match(
    appJs,
    /fetch\('\/api\/opportunity\?maxResults=50&strategy=balanced'\)/
  );
  assert.doesNotMatch(appJs, /\/api\/future-opportunity/);
  assert.match(appJs, /data\.opportunities/);
});

test("canonical public score does not turn missing data into zero", () => {
  const score = buildOpportunityPublicScore({
    futureOpportunityIndex: null,
    modelVersion: "future_outlook_v1",
  });

  assert.equal(score.value, null);
  assert.equal(score.display, "Data unavailable");
});

test("homepage opportunity score uses the canonical /100 and missing-data displays", () => {
  const appJs = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(appJs, /score\.value/);
  assert.match(appJs, /'\/100'/);
  assert.match(appJs, /'Data unavailable'/);
  assert.doesNotMatch(appJs, /rawScore[^\n]+\+\s*'%'/);
});

test("strategy aliases support customer-facing funnel labels", () => {
  assert.equal(normalizeStrategy("Capital Growth"), "growth");
  assert.equal(normalizeStrategy("Rental Income"), "income");
  assert.equal(isSupportedFutureStrategy("Capital Growth"), true);
  assert.equal(isSupportedFutureStrategy("mystery goal"), false);
});
