import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import opportunityHandler, {
  appendPriceFilter,
  appendStateFilter,
  mapOpportunityRow,
  normalizeStateFilter,
  publicOpportunityError,
  sanitizeOpportunityErrorForLog,
} from "../api/opportunity.js";
import {
  isSupportedFutureStrategy,
  normalizeStrategy,
} from "../lib/future-opportunity-outlook.js";

test("state filters are normalized and parameterized", () => {
  assert.equal(normalizeStateFilter("vic"), "VIC");
  assert.equal(normalizeStateFilter(" NSW "), "NSW");
  assert.equal(normalizeStateFilter("victoria"), null);
  assert.equal(normalizeStateFilter(""), null);

  const where = [];
  const params = ["existing"];
  const { p } = appendStateFilter({ where, params, p: 1, state: "VIC" });

  assert.equal(p, 2);
  assert.deepEqual(where, ["UPPER(s.state) = $2"]);
  assert.deepEqual(params, ["existing", "VIC"]);
});

test("Opportunity API rejects unsupported state filters before querying", async () => {
  const response = {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  await opportunityHandler(
    { method: "GET", query: { state: "victoria", strategy: "balanced" } },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.equal(response.payload.error, "unsupported_state");
  assert.deepEqual(response.payload.opportunities, []);
});

test("Opportunity API scores every eligible row before applying the result limit", () => {
  const source = fs.readFileSync(path.resolve("api/opportunity.js"), "utf8");

  assert.doesNotMatch(source, /candidateLimit/);
  assert.doesNotMatch(source, /ORDER BY s\.opportunity_score/);
  assert.match(source, /sort\(\(a, b\) => b\.futureOpportunityIndex - a\.futureOpportunityIndex\)/);
  assert.match(source, /slice\(0, maxResults\)/);
});

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

test("mapOpportunityRow returns Future Opportunity fields while preserving legacy score", () => {
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
  assert.equal(mapped.legacyOpportunityScore, 31);
  assert.equal(mapped.opportunityScore, mapped.futureOpportunityIndex);
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

test("strategy aliases support customer-facing funnel labels", () => {
  assert.equal(normalizeStrategy("Capital Growth"), "growth");
  assert.equal(normalizeStrategy("Rental Income"), "income");
  assert.equal(isSupportedFutureStrategy("Capital Growth"), true);
  assert.equal(isSupportedFutureStrategy("mystery goal"), false);
});

test("Opportunity API returns a fixed public error without internal details", () => {
  const payload = publicOpportunityError();
  const serialized = JSON.stringify(payload);

  assert.deepEqual(payload, {
    ok: false,
    error: "internal_server_error",
    message: "Opportunity data is temporarily unavailable. Please try again later.",
    opportunities: [],
  });
  assert.doesNotMatch(serialized, /postgres(?:ql)?:\/\//i);
  assert.doesNotMatch(serialized, /password/i);
  assert.doesNotMatch(serialized, /stack/i);
});

test("Opportunity API redacts database credentials from server logs", () => {
  const error = new Error(
    "Connection failed for postgresql://owner:secret-value@example.test/db?sslmode=require password=another-secret"
  );
  error.code = "DB_CONNECT_FAILED";

  const logEntry = sanitizeOpportunityErrorForLog(error);
  const serialized = JSON.stringify(logEntry);

  assert.equal(logEntry.code, "DB_CONNECT_FAILED");
  assert.match(logEntry.message, /\[REDACTED_DATABASE_URL\]/);
  assert.match(logEntry.message, /password=\[REDACTED\]/);
  assert.doesNotMatch(serialized, /secret-value/);
  assert.doesNotMatch(serialized, /another-secret/);
});
