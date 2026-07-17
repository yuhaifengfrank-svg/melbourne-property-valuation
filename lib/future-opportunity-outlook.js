/**
 * future-opportunity-outlook.js
 *
 * Versioned Future Opportunity Index model.
 *
 * This is a relative 0-100 opportunity index for 3-5 year screening.
 * It is not a price forecast and does not output expected growth returns.
 */

import { percentileScores, roundRelativeScore } from "./relative-score.js";

export const FUTURE_OUTLOOK_MODEL_VERSION = "future_outlook_v2";
export const FUTURE_OUTLOOK_HORIZON = "3-5 years";

const STRATEGY_WEIGHTS = Object.freeze({
  balanced: Object.freeze({
    affordability: 0.20,
    income: 0.18,
    demand: 0.18,
    supply: 0.16,
    infrastructure: 0.14,
    school: 0.10,
    confidence: 0.04,
  }),
  smart: Object.freeze({
    affordability: 0.20,
    income: 0.18,
    demand: 0.18,
    supply: 0.16,
    infrastructure: 0.14,
    school: 0.10,
    confidence: 0.04,
  }),
  growth: Object.freeze({
    affordability: 0.12,
    income: 0.10,
    demand: 0.24,
    supply: 0.22,
    infrastructure: 0.18,
    school: 0.10,
    confidence: 0.04,
  }),
  income: Object.freeze({
    affordability: 0.14,
    income: 0.32,
    demand: 0.20,
    supply: 0.12,
    infrastructure: 0.08,
    school: 0.08,
    confidence: 0.06,
  }),
  cashflow: Object.freeze({
    affordability: 0.14,
    income: 0.32,
    demand: 0.20,
    supply: 0.12,
    infrastructure: 0.08,
    school: 0.08,
    confidence: 0.06,
  }),
  school: Object.freeze({
    affordability: 0.12,
    income: 0.12,
    demand: 0.18,
    supply: 0.12,
    infrastructure: 0.10,
    school: 0.32,
    confidence: 0.04,
  }),
  value: Object.freeze({
    affordability: 0.32,
    income: 0.14,
    demand: 0.14,
    supply: 0.14,
    infrastructure: 0.10,
    school: 0.10,
    confidence: 0.06,
  }),
});

const VALID_STRATEGIES = Object.freeze(Object.keys(STRATEGY_WEIGHTS));
const STRATEGY_ALIASES = Object.freeze({
  "capital growth": "growth",
  capital_growth: "growth",
  growth_outlook: "growth",
  rental_income: "income",
  "rental income": "income",
  yield: "income",
  "rental yield": "income",
  school_zone: "school",
  "school zone": "school",
  education: "school",
  undervalued: "value",
  affordability: "value",
  smart_buy: "smart",
  "smart buy": "smart",
});
const HOUSE_TYPES = new Set(["house", "townhouse", "villa"]);
const UNIT_TYPES = new Set(["unit", "apartment", "flat"]);

export function supportedFutureStrategies() {
  return [...VALID_STRATEGIES];
}

export function normalizeStrategy(strategy) {
  const s = String(strategy || "balanced").toLowerCase().trim();
  const canonical = STRATEGY_ALIASES[s] || s;
  return STRATEGY_WEIGHTS[canonical] ? canonical : "balanced";
}

export function isSupportedFutureStrategy(strategy) {
  const s = String(strategy || "balanced").toLowerCase().trim();
  const canonical = STRATEGY_ALIASES[s] || s;
  return Boolean(STRATEGY_WEIGHTS[canonical]);
}

export function normalizePropertyType(propertyType) {
  const t = String(propertyType || "either").toLowerCase().trim();
  if (UNIT_TYPES.has(t)) return "unit";
  if (HOUSE_TYPES.has(t)) return "house";
  if (t === "either" || t === "any" || t === "all") return "either";
  return "either";
}

/**
 * Piecewise score where the "excellent" line maps to 80, keeping 100 rare.
 */
export function scoreLine(value, lines, options = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const {
    weak,
    market,
    excellent,
    exceptional,
    lowerIsBetter = false,
  } = lines;

  const v = lowerIsBetter ? -n : n;
  const w = lowerIsBetter ? -weak : weak;
  const m = lowerIsBetter ? -market : market;
  const e = lowerIsBetter ? -excellent : excellent;
  const x = lowerIsBetter ? -exceptional : exceptional;

  if (v <= w) return clamp(interpolate(v, w - Math.abs(m - w), w, 20, 40), 0, 40);
  if (v <= m) return interpolate(v, w, m, 40, 60);
  if (v <= e) return interpolate(v, m, e, 60, 80);
  if (v <= x) return interpolate(v, e, x, 80, 92);
  return clamp(92 + Math.min(8, (v - x) / Math.max(Math.abs(x - e), 1) * 8), 92, 100);
}

export function scoreFutureOpportunity(suburb, options = {}) {
  const strategy = normalizeStrategy(options.strategy);
  const propertyType = normalizePropertyType(options.propertyType);
  const weights = STRATEGY_WEIGHTS[strategy];

  const metrics = normaliseSuburbMetrics(suburb, propertyType);
  const rawComponentScores = {
    affordability: scoreAffordability(metrics.price),
    income: scoreIncome(metrics.yield),
    demand: scoreDemand(metrics.vacancy),
    supply: scoreSupply(metrics.supplyConstraintScore),
    infrastructure: scoreInfrastructure(metrics.infrastructureScore),
    school: scoreSchool(metrics.schoolScore),
    confidence: scoreConfidence(metrics),
  };
  const componentScores = Object.fromEntries(
    Object.entries(rawComponentScores).map(([key, value]) => [key, roundRelativeScore(value)]),
  );

  const missingData = [];
  for (const [key, value] of Object.entries(componentScores)) {
    if (value == null) missingData.push(key);
  }

  // Preserve continuous component precision for statewide ranking. Public
  // component and total scores are rounded only at the presentation boundary.
  const weighted = weightedAverage(rawComponentScores, weights);
  let score = weighted.score;
  let confidenceScore = computeConfidenceScore(metrics, weighted.availableWeight, missingData);
  const marketType = detectMarketType(suburb);
  const risks = [];

  if (marketType === "lifestyle") {
    risks.push("Seasonal or lifestyle-market demand may be less liquid than metropolitan family markets");
    if (confidenceScore < 70) {
      score -= 6;
    } else {
      score -= 3;
    }
    confidenceScore = Math.min(confidenceScore, 72);
  }

  addStandardRisks(risks, metrics);

  const rawFutureOpportunityIndex = clamp(score, 0, 100);
  score = roundRelativeScore(rawFutureOpportunityIndex);
  confidenceScore = Math.round(clamp(confidenceScore, 0, 100));

  return {
    modelVersion: FUTURE_OUTLOOK_MODEL_VERSION,
    predictionType: "future_opportunity_index_0_100",
    forecastHorizon: FUTURE_OUTLOOK_HORIZON,
    isPriceForecast: false,
    strategy,
    propertyType,
    suburb: suburb?.suburb || "",
    state: suburb?.state || "VIC",
    futureOpportunityIndex: score,
    _rawFutureOpportunityIndex: rawFutureOpportunityIndex,
    band: classifyBand(score, confidenceScore),
    opportunityType: classifyOpportunityType(componentScores, score),
    confidence: confidenceLabel(confidenceScore),
    confidenceScore,
    marketType,
    componentScores,
    _rawComponentScores: rawComponentScores,
    selectedMedianPrice: metrics.price,
    selectedMedianPriceType: metrics.priceType,
    why: buildReasons(componentScores, metrics, propertyType),
    risks,
    missingData,
    dataUpdated: suburb?.dataUpdated || suburb?.updated_at || "",
    disclaimer:
      "Future Opportunity Index is a relative 0-100 screening signal for 3-5 year opportunity. It is not a price forecast, financial advice, or a guaranteed return.",
  };
}

export function calibrateFutureOpportunityOutlooks(outlooks = []) {
  const scores = percentileScores(outlooks.map((outlook) =>
    outlook?._rawFutureOpportunityIndex ?? outlook?.futureOpportunityIndex));
  const componentKeys = ["affordability", "income", "demand", "supply", "infrastructure", "school"];
  const calibratedComponents = Object.fromEntries(componentKeys.map((key) => [
    key,
    percentileScores(outlooks.map((outlook) => outlook?._rawComponentScores?.[key])),
  ]));
  return outlooks.map((outlook, index) => {
    if (!outlook || scores[index] == null) return outlook;
    const futureOpportunityIndex = scores[index];
    const componentScores = {
      ...outlook.componentScores,
      ...Object.fromEntries(componentKeys.map((key) => [key, calibratedComponents[key][index]])),
    };
    return {
      ...outlook,
      futureOpportunityIndex,
      band: classifyBand(futureOpportunityIndex, outlook.confidenceScore),
      opportunityType: classifyOpportunityType(componentScores, futureOpportunityIndex),
      componentScores,
    };
  });
}

export function scorePropertyFutureOpportunity({ suburbOutlook, property = {} }) {
  const suburbScore = Number(suburbOutlook?.futureOpportunityIndex);
  const base = Number.isFinite(suburbScore) ? suburbScore : 0;
  const propertySpecificScore = scorePropertySpecific(property);
  const futureOpportunityIndex = roundRelativeScore(clamp(base * 0.70 + propertySpecificScore * 0.30, 0, 100));

  return {
    modelVersion: "property_future_outlook_v1",
    predictionType: "property_future_opportunity_index_0_100",
    forecastHorizon: FUTURE_OUTLOOK_HORIZON,
    isPriceForecast: false,
    futureOpportunityIndex,
    propertyFutureScore: futureOpportunityIndex,
    suburbFutureOutlookScore: Math.round(base),
    propertySpecificScore,
    formula:
      "property_future_score = suburb_future_outlook_score * 0.70 + property_specific_score * 0.30",
    confidence: suburbOutlook?.confidence || "Low",
    why: buildPropertyReasons(property, propertySpecificScore),
    risks: buildPropertyRisks(property),
    disclaimer:
      "Property Future Opportunity Score combines the suburb outlook with property-specific fit. It is not a price forecast.",
  };
}

function normaliseSuburbMetrics(suburb = {}, propertyType) {
  const housePrice = num(suburb.medianHousePrice ?? suburb.median_house_price);
  const unitPrice = num(suburb.medianUnitPrice ?? suburb.median_unit_price);
  let price = null;
  let priceType = "unavailable";

  if (propertyType === "unit") {
    price = unitPrice ?? housePrice;
    priceType = unitPrice != null ? "unit" : housePrice != null ? "house_proxy" : "unavailable";
  } else if (propertyType === "house") {
    price = housePrice ?? unitPrice;
    priceType = housePrice != null ? "house" : unitPrice != null ? "unit_proxy" : "unavailable";
  } else {
    const available = [housePrice, unitPrice].filter((v) => v != null && v > 0);
    price = available.length ? Math.min(...available) : null;
    priceType = housePrice != null && unitPrice != null ? "either_lowest" : housePrice != null ? "house" : unitPrice != null ? "unit" : "unavailable";
  }

  return {
    price,
    priceType,
    yield: num(suburb.rentalYield ?? suburb.grossYield ?? suburb.gross_yield),
    vacancy: num(suburb.vacancyRate ?? suburb.vacancy_rate),
    schoolScore: num(suburb.schoolScore ?? suburb.school_score),
    supplyConstraintScore: num(suburb.supplyConstraintScore ?? suburb.supply_constraint_score),
    infrastructureScore: num(suburb.infrastructureScore ?? suburb.infrastructure_score),
    overallConfidence: num(suburb.overallConfidence ?? suburb.overall_confidence),
  };
}

function scoreAffordability(price) {
  if (price == null || price <= 0) return null;
  return scoreLine(price, {
    weak: 1800000,
    market: 1200000,
    excellent: 750000,
    exceptional: 500000,
    lowerIsBetter: true,
  });
}

function scoreIncome(yieldPct) {
  if (yieldPct == null || yieldPct <= 0) return null;
  return scoreLine(yieldPct, {
    weak: 2.0,
    market: 3.0,
    excellent: 4.2,
    exceptional: 5.5,
  });
}

function scoreDemand(vacancyRate) {
  if (vacancyRate == null || vacancyRate < 0) return null;
  return scoreLine(vacancyRate, {
    weak: 5.0,
    market: 3.0,
    excellent: 1.5,
    exceptional: 0.8,
    lowerIsBetter: true,
  });
}

function scoreSupply(supplyConstraintScore) {
  if (supplyConstraintScore == null) return null;
  return clamp(supplyConstraintScore, 0, 100);
}

function scoreInfrastructure(infrastructureScore) {
  if (infrastructureScore == null) return null;
  return clamp(infrastructureScore, 0, 100);
}

function scoreSchool(schoolScore) {
  if (schoolScore == null) return null;
  return clamp(schoolScore, 0, 100);
}

function scoreConfidence(metrics) {
  if (metrics.overallConfidence == null) return null;
  return clamp(metrics.overallConfidence, 0, 100);
}

function computeConfidenceScore(metrics, availableWeight, missingData) {
  let score = availableWeight * 100;
  if (metrics.overallConfidence != null) {
    score = score * 0.65 + clamp(metrics.overallConfidence, 0, 100) * 0.35;
  }
  score -= missingData.length * 3;
  return score;
}

function classifyBand(score, confidenceScore) {
  if (confidenceScore < 35) return "Low confidence";
  if (score >= 80) return "Very strong";
  if (score >= 65) return "Strong";
  if (score >= 50) return "Balanced";
  if (score >= 35) return "Selective";
  return "Limited signal";
}

function classifyOpportunityType(componentScores, score) {
  const entries = Object.entries(componentScores)
    .filter(([, v]) => v != null)
    .sort((a, b) => b[1] - a[1]);
  const [top, second] = entries;
  const strongCount = entries.filter(([, v]) => v >= 70).length;

  if (score >= 68 && strongCount >= 2) return "Smart Buy";
  if (top?.[0] === "income" && top[1] >= 70) return "Income Opportunity";
  if ((top?.[0] === "demand" || top?.[0] === "supply" || top?.[0] === "infrastructure") && top[1] >= 70) return "Growth Opportunity";
  if (top?.[0] === "school" && top[1] >= 70) return "School Zone Opportunity";
  if (top?.[0] === "affordability" && top[1] >= 70) return "Value Opportunity";
  if (second && top && top[1] >= 60 && second[1] >= 55) return "Balanced Opportunity";
  return "Watchlist Opportunity";
}

function buildReasons(componentScores, metrics, propertyType) {
  const labels = {
    affordability: `Budget fit using ${metrics.priceType.replace("_", " ")} median`,
    income: "Rental income signal",
    demand: "Low vacancy demand signal",
    supply: "Supply constraint support",
    infrastructure: "Infrastructure access signal",
    school: "School catchment demand signal",
  };
  const reasons = Object.entries(componentScores)
    .filter(([key, value]) => key !== "confidence" && value != null && value >= 60)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([key]) => labels[key]);

  if (reasons.length === 0) {
    reasons.push(`Balanced ${propertyType === "either" ? "property" : propertyType} market fundamentals`);
  }
  return reasons;
}

function addStandardRisks(risks, metrics) {
  if (metrics.yield != null && metrics.yield < 2.5) risks.push("Lower rental yield may reduce income appeal");
  if (metrics.vacancy != null && metrics.vacancy > 5) risks.push("Elevated vacancy may indicate softer rental demand");
  if (metrics.supplyConstraintScore != null && metrics.supplyConstraintScore < 35) risks.push("New supply may compete with resale demand");
  if (metrics.price != null && metrics.price > 1600000) risks.push("High entry price may reduce buyer depth");
  if (risks.length === 0) risks.push("Standard market risk; validate property condition and micro-location");
}

function detectMarketType(suburb = {}) {
  const name = String(suburb.suburb || "").toLowerCase();
  const lifestyleNames = [
    "sorrento",
    "portsea",
    "lorne",
    "dromana",
    "point lonsdale",
    "barwon heads",
    "aireys inlet",
    "mount martha",
  ];
  if (suburb.isLifestyleMarket === true || suburb.isVacationMarket === true) return "lifestyle";
  if (lifestyleNames.some((n) => name.includes(n))) return "lifestyle";
  return "metro";
}

function scorePropertySpecific(property = {}) {
  let score = 55;
  const propertyType = normalizePropertyType(property.propertyType);
  const landSize = num(property.landSize ?? property.land_size_sqm);
  const bedrooms = num(property.bedrooms);
  const bathrooms = num(property.bathrooms);
  const carSpaces = num(property.carSpaces ?? property.car_spaces);
  const condition = String(property.condition || "").toLowerCase();

  if (propertyType === "house" && landSize != null) {
    if (landSize >= 800) score += 12;
    else if (landSize >= 600) score += 8;
    else if (landSize < 300) score -= 8;
  }
  if (propertyType === "unit" && landSize != null && landSize > 0) score += 2;
  if (bedrooms >= 3) score += 4;
  if (bathrooms >= 2) score += 3;
  if (carSpaces >= 2) score += 2;
  if (condition.includes("renovat")) score -= 5;
  if (condition.includes("excellent") || condition.includes("renovated")) score += 4;

  return Math.round(clamp(score, 0, 100));
}

function buildPropertyReasons(property, score) {
  const reasons = [];
  const landSize = num(property.landSize ?? property.land_size_sqm);
  if (landSize != null && landSize >= 600) reasons.push("Land size supports flexibility and buyer demand");
  if (num(property.bedrooms) >= 3) reasons.push("Family-compatible bedroom count");
  if (num(property.bathrooms) >= 2) reasons.push("Two-bathroom layout improves market appeal");
  if (reasons.length === 0) reasons.push(score >= 55 ? "Standard property-level fit" : "Property-specific details are limited");
  return reasons;
}

function buildPropertyRisks(property) {
  const risks = [];
  const landSize = num(property.landSize ?? property.land_size_sqm);
  if (landSize != null && landSize < 300) risks.push("Smaller land component may limit future flexibility");
  if (String(property.condition || "").toLowerCase().includes("renovat")) risks.push("Renovation or condition risk should be checked before purchase");
  if (risks.length === 0) risks.push("No unusual property-specific risk detected from supplied fields");
  return risks;
}

function weightedAverage(scores, weights) {
  let numerator = 0;
  let denominator = 0;
  let availableWeight = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const value = scores[key];
    denominator += weight;
    if (value != null) {
      numerator += value * weight;
      availableWeight += weight;
    }
  }
  if (availableWeight <= 0) return { score: 0, availableWeight: 0 };
  return {
    score: numerator / availableWeight,
    availableWeight: denominator > 0 ? availableWeight / denominator : 0,
  };
}

function confidenceLabel(score) {
  if (score >= 75) return "High";
  if (score >= 50) return "Medium";
  if (score >= 30) return "Low";
  return "Very Low";
}

function interpolate(value, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) return outMax;
  const t = (value - inMin) / (inMax - inMin);
  return outMin + clamp(t, 0, 1) * (outMax - outMin);
}

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
