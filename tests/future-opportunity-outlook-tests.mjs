import test from "node:test";
import assert from "node:assert/strict";

import {
  FUTURE_OUTLOOK_HORIZON,
  FUTURE_OUTLOOK_MODEL_VERSION,
  isSupportedFutureStrategy,
  normalizePropertyType,
  normalizeStrategy,
  scoreFutureOpportunity,
  scoreLine,
  scorePropertyFutureOpportunity,
  supportedFutureStrategies,
} from "../lib/future-opportunity-outlook.js";

const baseSuburb = {
  suburb: "Scoresby",
  state: "VIC",
  medianHousePrice: 1050000,
  medianUnitPrice: 720000,
  rentalYield: 3.4,
  vacancyRate: 2.2,
  schoolScore: 62,
  supplyConstraintScore: 68,
  infrastructureScore: 58,
  overallConfidence: 72,
  dataUpdated: "2026-06-18",
};

test("scoreLine maps excellent line to 80 instead of making common values 100", () => {
  const score = scoreLine(4.2, {
    weak: 2.0,
    market: 3.0,
    excellent: 4.2,
    exceptional: 5.5,
  });
  assert.equal(Math.round(score), 80);

  const exceptional = scoreLine(5.5, {
    weak: 2.0,
    market: 3.0,
    excellent: 4.2,
    exceptional: 5.5,
  });
  assert.equal(Math.round(exceptional), 92);
});

test("model exports versioned non-price-forecast metadata", () => {
  const result = scoreFutureOpportunity(baseSuburb, { strategy: "balanced" });
  assert.equal(result.modelVersion, FUTURE_OUTLOOK_MODEL_VERSION);
  assert.equal(result.forecastHorizon, FUTURE_OUTLOOK_HORIZON);
  assert.equal(result.predictionType, "future_opportunity_index_0_100");
  assert.equal(result.isPriceForecast, false);
  assert.match(result.disclaimer, /not a price forecast/i);
});

test("all funnel strategies are accepted and normalised", () => {
  const strategies = supportedFutureStrategies();
  for (const s of ["smart", "balanced", "growth", "income", "cashflow", "school", "value"]) {
    assert.ok(strategies.includes(s), `${s} strategy supported`);
    assert.equal(normalizeStrategy(s.toUpperCase()), s);
    assert.equal(isSupportedFutureStrategy(s), true);
  }
  assert.equal(normalizeStrategy("unknown"), "balanced");
  assert.equal(isSupportedFutureStrategy("unknown"), false);
  assert.equal(normalizeStrategy("Capital Growth"), "growth");
  assert.equal(normalizeStrategy("rental yield"), "income");
  assert.equal(normalizeStrategy("school zone"), "school");
  assert.equal(isSupportedFutureStrategy("Capital Growth"), true);
});

test("strategy changes scoring emphasis without changing the base data", () => {
  const incomeFriendly = {
    ...baseSuburb,
    rentalYield: 4.8,
    vacancyRate: 1.2,
    schoolScore: 45,
    infrastructureScore: 42,
  };
  const income = scoreFutureOpportunity(incomeFriendly, { strategy: "income" });
  const school = scoreFutureOpportunity(incomeFriendly, { strategy: "school" });

  assert.ok(income.futureOpportunityIndex > school.futureOpportunityIndex);
  assert.equal(income.strategy, "income");
});

test("property type selects the matching median price", () => {
  const house = scoreFutureOpportunity(baseSuburb, { propertyType: "house" });
  const unit = scoreFutureOpportunity(baseSuburb, { propertyType: "unit" });
  const either = scoreFutureOpportunity(baseSuburb, { propertyType: "either" });

  assert.equal(house.selectedMedianPrice, baseSuburb.medianHousePrice);
  assert.equal(house.selectedMedianPriceType, "house");
  assert.equal(unit.selectedMedianPrice, baseSuburb.medianUnitPrice);
  assert.equal(unit.selectedMedianPriceType, "unit");
  assert.equal(either.selectedMedianPrice, baseSuburb.medianUnitPrice);
  assert.equal(either.selectedMedianPriceType, "either_lowest");
  assert.equal(normalizePropertyType("Apartment"), "unit");
  assert.equal(normalizePropertyType("Villa"), "house");
});

test("classification avoids pushing everything into Balanced", () => {
  const value = scoreFutureOpportunity({
    ...baseSuburb,
    medianHousePrice: 560000,
    medianUnitPrice: 440000,
    rentalYield: 3.1,
  }, { strategy: "value", propertyType: "house" });

  const income = scoreFutureOpportunity({
    ...baseSuburb,
    rentalYield: 5.0,
    vacancyRate: 1.1,
    schoolScore: 48,
  }, { strategy: "income" });

  assert.notEqual(value.opportunityType, "Balanced Opportunity");
  assert.notEqual(income.opportunityType, "Balanced Opportunity");
});

test("lifestyle markets are not blindly promoted by yield and low vacancy", () => {
  const normal = scoreFutureOpportunity({
    ...baseSuburb,
    suburb: "Reservoir",
    rentalYield: 5.2,
    vacancyRate: 0.7,
    overallConfidence: 42,
  }, { strategy: "income" });

  const lifestyle = scoreFutureOpportunity({
    ...baseSuburb,
    suburb: "Sorrento",
    rentalYield: 5.2,
    vacancyRate: 0.7,
    overallConfidence: 42,
  }, { strategy: "income" });

  assert.equal(lifestyle.marketType, "lifestyle");
  assert.ok(lifestyle.futureOpportunityIndex < normal.futureOpportunityIndex);
  assert.ok(lifestyle.confidenceScore <= 72);
  assert.match(lifestyle.risks.join(" "), /seasonal|lifestyle/i);
});

test("missing data lowers confidence and is explicitly listed", () => {
  const sparse = scoreFutureOpportunity({
    suburb: "Sparseville",
    state: "VIC",
    medianHousePrice: 900000,
  });

  assert.ok(sparse.missingData.length >= 3);
  assert.match(["Low", "Very Low"].join("|"), new RegExp(sparse.confidence));
  assert.ok(sparse.confidenceScore < 60);
});

test("property future score follows the 70/30 formula exactly", () => {
  const result = scorePropertyFutureOpportunity({
    suburbOutlook: { futureOpportunityIndex: 70, confidence: "Medium" },
    property: { propertyType: "House", landSize: 820, bedrooms: 4, bathrooms: 2, carSpaces: 2 },
  });

  assert.equal(result.formula, "property_future_score = suburb_future_outlook_score * 0.70 + property_specific_score * 0.30");
  assert.equal(result.suburbFutureOutlookScore, 70);
  assert.ok(result.propertySpecificScore > 55);
  assert.equal(
    result.futureOpportunityIndex,
    Math.round(70 * 0.70 + result.propertySpecificScore * 0.30)
  );
  assert.equal(result.isPriceForecast, false);
});
