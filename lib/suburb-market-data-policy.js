const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_ANALYSIS_AS_OF = new Date().toISOString().slice(0, 10);
// Compatibility alias. This is an analysis boundary, not a claim that every
// source is current to the same date. Each metric carries its own asOf date.
export const TARGET_DATA_CUTOFF = DEFAULT_ANALYSIS_AS_OF;
export const METRIC_KINDS = Object.freeze(["fact", "derived_fact", "estimate", "signal", "score", "unavailable"]);
export const LEGACY_UNSAFE_PUBLIC_METRICS = Object.freeze([
  "vacancy_rate", "vacancy_rate_adjusted", "gross_yield", "median_rent_weekly",
  "growth_1y", "growth_3y", "growth_5y", "vgv_cagr_10y",
  "opportunity_score", "ai_summary_json", "crime_total_count", "crime_rank", "poi_score",
]);

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isoDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function clamp(value, lower, upper) { return Math.min(upper, Math.max(lower, value)); }
function round(value, places = 2) { const scale = 10 ** places; return Math.round(value * scale) / scale; }

export function buildMetric({ name, value = null, unit = null, kind, definition, geography, asOf,
  sourceKey = null, sourceUrl = null, modelVersion = null, sampleSize = null, confidence = null,
  range = null, limitations = [] }) {
  if (!METRIC_KINDS.includes(kind)) throw new Error(`Unsupported metric kind: ${kind}`);
  if (!name || !definition || !geography) throw new Error("Metric name, definition and geography are required");
  const normalizedAsOf = isoDate(asOf);
  if (kind !== "unavailable" && !normalizedAsOf) throw new Error("Available metrics require a valid asOf date");
  if (kind === "estimate" && !modelVersion) throw new Error("Estimated metrics require modelVersion");
  if (kind === "fact" && !sourceKey) throw new Error("Facts require sourceKey");
  if (kind === "unavailable" && value != null) throw new Error("Unavailable metrics cannot have a value");
  return { name, value: value == null ? null : finite(value), unit, kind, definition, geography,
    asOf: normalizedAsOf, sourceKey, sourceUrl, modelVersion,
    sampleSize: sampleSize == null ? null : Number(sampleSize), confidence, range,
    limitations: [...limitations] };
}

export function selectLatestEligibleObservation(observations, {
  cutoff = TARGET_DATA_CUTOFF, geography, propertyType = null, bedrooms = null,
} = {}) {
  const cutoffDate = isoDate(cutoff);
  return observations.filter((item) => {
    const asOf = isoDate(item.asOf);
    return asOf && asOf <= cutoffDate && (!geography || item.geography === geography)
      && (!propertyType || item.propertyType === propertyType)
      && (bedrooms == null || Number(item.bedrooms) === Number(bedrooms))
      && finite(item.value) != null;
  }).sort((a, b) => String(b.asOf).localeCompare(String(a.asOf)))[0] || null;
}

export function estimateHouseRent({ combinedAreaAnchor, localListingIndexAtAnchor,
  combinedListingIndexAtAnchor, localListingIndexAtCutoff, bedrooms, sampleSize,
  cutoff = TARGET_DATA_CUTOFF, suburb = "suburb" }) {
  if (![3, 4].includes(Number(bedrooms))) throw new Error("Only 3-bedroom and 4-bedroom houses are supported");
  const inputs = [combinedAreaAnchor, localListingIndexAtAnchor, combinedListingIndexAtAnchor, localListingIndexAtCutoff].map(finite);
  if (inputs.some((v) => v == null || v <= 0)) return buildMetric({
    name: `house_rent_${bedrooms}br`, value: null, unit: "AUD/week", kind: "unavailable",
    definition: `${bedrooms}-bedroom detached-house weekly rent`, geography: suburb, asOf: null,
    limitations: ["Required official anchor or local listing index is missing."],
  });
  const [anchor, localAnchor, combinedAnchor, localCutoff] = inputs;
  const value = anchor * (localAnchor / combinedAnchor) * (localCutoff / localAnchor);
  const n = Math.max(0, Number(sampleSize) || 0);
  if (n < 5) return buildMetric({
    name: `house_rent_${bedrooms}br`, value: null, unit: "AUD/week", kind: "unavailable",
    definition: `${bedrooms}-bedroom detached-house weekly rent`, geography: suburb, asOf: null,
    limitations: ["Fewer than five unique local rental observations."],
  });
  const confidence = n >= 30 ? "high" : n >= 15 ? "medium" : "low";
  const relativeError = n >= 30 ? 0.05 : n >= 15 ? 0.08 : 0.12;
  return buildMetric({
    name: `house_rent_${bedrooms}br`, value: round(value, 0), unit: "AUD/week", kind: "estimate",
    definition: `${bedrooms}-bedroom detached-house modelled weekly rent`, geography: suburb,
    asOf: cutoff, modelVersion: "house-rent-nowcast-v1", sampleSize: n, confidence,
    range: { low: round(value * (1 - relativeError), 0), high: round(value * (1 + relativeError), 0) },
    limitations: ["Calibrated from an official combined-area rental-bond anchor and local asking-rent indices."],
  });
}

export function estimateRentalStock({ rentedDwellings2021, dwellingStock2021, dwellingStock2025,
  rentalBondIndex2021 = 1, rentalBondIndex2025 = 1 }) {
  const values = [rentedDwellings2021, dwellingStock2021, dwellingStock2025, rentalBondIndex2021, rentalBondIndex2025].map(finite);
  if (values.some((v) => v == null || v <= 0)) return null;
  const [rented, stock21, stock25, bond21, bond25] = values;
  return rented * (stock25 / stock21) * (bond25 / bond21);
}

export function estimateRentalVacancy({ uniqueListings21Days, estimatedRentalStock,
  benchmarkObservedRate = null, benchmarkModelledRate = null,
  listingObservationDays = 21, shrinkageK = 30,
  cutoff = TARGET_DATA_CUTOFF, suburb = "suburb" }) {
  const vacancies = finite(uniqueListings21Days);
  const stock = finite(estimatedRentalStock);
  const observedDays = finite(listingObservationDays);
  if (vacancies == null || vacancies < 0 || stock == null || stock <= 0 || observedDays == null || observedDays < 21) return buildMetric({
    name: "rental_vacancy", value: null, unit: "%", kind: "unavailable",
    definition: "Long-term rental dwellings vacant and continuously advertised for at least 21 days",
    geography: suburb, asOf: null,
    limitations: ["Valid local rental stock and at least 21 days of deduplicated listing history are required."],
  });
  let rate = vacancies / stock;
  const observedBenchmark = finite(benchmarkObservedRate);
  const modelledBenchmark = finite(benchmarkModelledRate);
  if (observedBenchmark != null && observedBenchmark >= 0 && modelledBenchmark != null && modelledBenchmark > 0) {
    rate *= (observedBenchmark / 100) / (modelledBenchmark / 100);
  }
  const calibratedLocalRate = clamp(rate, 0, 1);
  const benchmarkRate = observedBenchmark != null && observedBenchmark >= 0
    ? clamp(observedBenchmark / 100, 0, 1) : null;
  const evidenceWeight = benchmarkRate == null ? 1
    : clamp(vacancies / (vacancies + Math.max(1, Number(shrinkageK) || 30)), 0, 1);
  rate = benchmarkRate == null ? calibratedLocalRate
    : evidenceWeight * calibratedLocalRate + (1 - evidenceWeight) * benchmarkRate;
  const samplingError = 1.96 * Math.sqrt(Math.max(rate * (1 - rate) / stock, 0));
  const stockError = 0.1 * rate;
  const error = Math.sqrt(samplingError ** 2 + stockError ** 2);
  return buildMetric({
    name: "rental_vacancy", value: round(rate * 100), unit: "%", kind: "estimate",
    definition: "Estimated share of long-term rental dwellings vacant and continuously advertised for at least 21 days",
    geography: suburb, asOf: cutoff, modelVersion: "rental-vacancy-v1", sampleSize: Math.round(stock),
    confidence: stock >= 500 && vacancies >= 10 && observedDays >= 28 ? "medium" : "low",
    range: { low: round(clamp(rate - error, 0, 1) * 100), high: round(clamp(rate + error, 0, 1) * 100) },
    limitations: [
      "Modelled from deduplicated listings and estimated rental stock; not the 2021 Census unoccupied-dwelling rate.",
      benchmarkRate == null ? "No external benchmark shrinkage was applied."
        : `Sparse local evidence is shrunk toward the approved benchmark (local weight ${round(evidenceWeight * 100, 0)}%).`,
    ],
  });
}

export function estimatePopulation({ population, sourceAsOf, annualRate, cutoff = TARGET_DATA_CUTOFF, suburb = "suburb" }) {
  const base = finite(population); const rate = finite(annualRate);
  const baseDate = isoDate(sourceAsOf); const cutoffDate = isoDate(cutoff);
  if (base == null || base <= 0 || rate == null || !baseDate || !cutoffDate || baseDate > cutoffDate) return null;
  const years = (new Date(`${cutoffDate}T00:00:00Z`) - new Date(`${baseDate}T00:00:00Z`)) / (365.25 * DAY_MS);
  const boundedRate = clamp(rate, -0.01, 0.04);
  const estimate = base * ((1 + boundedRate) ** years);
  return buildMetric({
    name: "population", value: round(estimate, 0), unit: "persons", kind: years < 0.02 ? "derived_fact" : "estimate",
    definition: "Estimated resident population", geography: suburb, asOf: cutoff,
    modelVersion: years < 0.02 ? null : "population-nowcast-v1", confidence: years <= 1.5 ? "high" : "medium",
    range: years < 0.02 ? null : {
      low: round(base * ((1 + clamp(boundedRate - 0.005, -0.01, 0.04)) ** years), 0),
      high: round(base * ((1 + clamp(boundedRate + 0.005, -0.01, 0.04)) ** years), 0),
    }, limitations: years < 0.02 ? [] : ["Projected from the latest population observation using population growth only; property-price growth is excluded."],
  });
}

export function publicationDecision(metric, { minimumConfidence = "low", maximumAgeDays = null,
  cutoff = TARGET_DATA_CUTOFF } = {}) {
  if (!metric || metric.kind === "unavailable" || metric.value == null) return { publish: false, reason: "unavailable" };
  const levels = { insufficient: 0, low: 1, medium: 2, high: 3 };
  if (metric.confidence && levels[metric.confidence] < levels[minimumConfidence]) return { publish: false, reason: "confidence" };
  if (maximumAgeDays != null && metric.asOf) {
    const age = (new Date(`${cutoff}T00:00:00Z`) - new Date(`${metric.asOf}T00:00:00Z`)) / DAY_MS;
    if (age > maximumAgeDays) return { publish: false, reason: "stale" };
  }
  return { publish: true, reason: null };
}

export function legacyMetricPublicationDecision(metricKey) {
  return LEGACY_UNSAFE_PUBLIC_METRICS.includes(metricKey)
    ? { publish: false, reason: "legacy_metric_without_publishable_lineage" }
    : { publish: true, reason: null };
}

export function createResearchTask({ suburb, metric, propertyType = null, bedrooms = null,
  targetAsOf = TARGET_DATA_CUTOFF }) {
  return { suburb, state: "VIC", metric, propertyType, bedrooms, targetAsOf,
    requiredGeography: "suburb", costConstraint: "free", status: "source_research_required", sourcesChecked: [] };
}
