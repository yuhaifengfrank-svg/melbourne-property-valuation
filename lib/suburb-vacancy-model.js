const WEIGHTS = Object.freeze({
  populationGrowth: 0.25,
  unemployment: 0.12,
  employmentGrowth: 0.08,
  incomeCapacity: 0.10,
  buildingPermitSupply: 0.25,
  planningPipeline: 0.15,
  apartmentShare: 0.05,
});

const DIRECTIONS = Object.freeze({
  populationGrowth: -1,
  unemployment: 1,
  employmentGrowth: -1,
  incomeCapacity: -1,
  buildingPermitSupply: 1,
  planningPipeline: 1,
  apartmentShare: 1,
});

export const MELBOURNE_VACANCY_BENCHMARK = Object.freeze({
  value: 1.6,
  unit: "%",
  geography: "Greater Melbourne",
  period: "2025-Q4",
  asOf: "2025-12-31",
  sourceKey: "cotality_quarterly_rental_review_q4_2025",
  sourceUrl: "https://discover.cotality.com/hubfs/441896203/Gated-Content/Cotality%20quarterly%20rental%20review%20-%20Q4%202025.pdf",
});

function clamp(value, low, high) { return Math.min(high, Math.max(low, value)); }
function round(value, places = 2) { const scale = 10 ** places; return Math.round(value * scale) / scale; }

function normalizeFeature(raw, key) {
  if (!raw || raw.percentile == null || !Number.isFinite(Number(raw.percentile))) return null;
  const percentile = clamp(Number(raw.percentile), 0, 1);
  const quality = clamp(Number.isFinite(Number(raw.quality)) ? Number(raw.quality) : 1, 0, 1);
  return {
    key,
    percentile,
    quality,
    sourceKey: raw.sourceKey || null,
    asOf: raw.asOf || null,
    geography: raw.geography || null,
  };
}

export function estimateBenchmarkAdjustedVacancy({
  suburb,
  lga,
  features = {},
  benchmark = MELBOURNE_VACANCY_BENCHMARK,
  sensitivity = 0.45,
} = {}) {
  if (!suburb || !lga) throw new Error("Suburb and LGA are required");
  if (!Number.isFinite(Number(benchmark?.value)) || Number(benchmark.value) <= 0) {
    throw new Error("A positive metropolitan vacancy benchmark is required");
  }

  const contributions = [];
  let score = 0;
  let coverage = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const feature = normalizeFeature(features[key], key);
    if (!feature) {
      contributions.push({ key, weight, status: "missing", contribution: 0 });
      continue;
    }
    const centered = 2 * (feature.percentile - 0.5);
    const contribution = weight * DIRECTIONS[key] * centered * feature.quality;
    score += contribution;
    coverage += weight * feature.quality;
    contributions.push({ ...feature, weight, direction: DIRECTIONS[key], status: "used", contribution: round(contribution, 4) });
  }

  if (coverage < 0.4) {
    return {
      name: "rental_vacancy", value: null, unit: "%", kind: "unavailable",
      definition: "Estimated share of long-term rental dwellings vacant in the suburb",
      geography: suburb, asOf: null, modelVersion: "benchmark-adjusted-vacancy-v1",
      confidence: "insufficient", coverage: round(coverage, 2), contributions,
      limitations: ["Less than 40% of the approved feature evidence is available."],
    };
  }

  // Missing evidence is neutral and the observed signal is shrunk toward the
  // metro benchmark. It is never reweighted to exaggerate the remaining data.
  const shrunkScore = score * coverage;
  const rawCoefficient = Math.exp(Number(sensitivity) * shrunkScore);
  const adjustmentCoefficient = clamp(rawCoefficient, 0.65, 1.6);
  const value = Number(benchmark.value) * adjustmentCoefficient;
  const confidence = coverage >= 0.85 ? "medium" : coverage >= 0.65 ? "low" : "low";
  const uncertainty = coverage >= 0.85 ? 0.3 : coverage >= 0.65 ? 0.45 : 0.6;

  return {
    name: "rental_vacancy", value: round(value), unit: "%", kind: "estimate",
    definition: "Benchmark-adjusted estimate of the share of long-term rental dwellings vacant in the suburb",
    geography: suburb, lga, asOf: benchmark.asOf,
    modelVersion: "benchmark-adjusted-vacancy-v1", confidence,
    range: { low: round(Math.max(0, value - uncertainty)), high: round(value + uncertainty) },
    benchmark: { ...benchmark }, coverage: round(coverage, 2),
    adjustmentCoefficient: round(adjustmentCoefficient, 4), contributions,
    limitations: [
      "This is a modelled suburb estimate anchored to the Greater Melbourne benchmark, not a directly observed suburb vacancy rate.",
      "Feature percentiles must be calculated across the approved Greater Melbourne suburb comparison set for the same period.",
      "RBA indicators may update the metropolitan benchmark over time but are not used to rank suburbs against each other.",
    ],
  };
}

export const VACANCY_MODEL_FEATURE_POLICY = Object.freeze({ weights: WEIGHTS, directions: DIRECTIONS });
