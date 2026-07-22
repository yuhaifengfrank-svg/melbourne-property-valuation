import test from "node:test";
import assert from "node:assert/strict";
import { estimateBenchmarkAdjustedVacancy, MELBOURNE_VACANCY_BENCHMARK,
  VACANCY_MODEL_FEATURE_POLICY } from "../lib/suburb-vacancy-model.js";

const feature = (percentile, quality = 1) => ({ percentile, quality, sourceKey: "official_test", asOf: "2025-12-31", geography: "suburb" });

test("approved weights total one", () => {
  assert.equal(Object.values(VACANCY_MODEL_FEATURE_POLICY.weights).reduce((a, b) => a + b, 0), 1);
});

test("all median features reproduce the metro benchmark", () => {
  const features = Object.fromEntries(Object.keys(VACANCY_MODEL_FEATURE_POLICY.weights).map((key) => [key, feature(0.5)]));
  const result = estimateBenchmarkAdjustedVacancy({ suburb: "Oakleigh", lga: "Monash", features });
  assert.equal(result.value, 1.6);
  assert.equal(result.adjustmentCoefficient, 1);
  assert.equal(result.kind, "estimate");
  assert.equal(result.benchmark.period, "2025-Q4");
});

test("strong demand lowers and additional supply raises the estimate", () => {
  const baseline = { populationGrowth: feature(0.5), buildingPermitSupply: feature(0.5), planningPipeline: feature(0.5) };
  const demand = estimateBenchmarkAdjustedVacancy({ suburb: "A", lga: "Monash", features: { ...baseline, populationGrowth: feature(1) } });
  const supply = estimateBenchmarkAdjustedVacancy({ suburb: "A", lga: "Monash", features: { ...baseline, buildingPermitSupply: feature(1), planningPipeline: feature(1) } });
  assert.ok(demand.value < MELBOURNE_VACANCY_BENCHMARK.value);
  assert.ok(supply.value > MELBOURNE_VACANCY_BENCHMARK.value);
});

test("missing factors are neutral and reduce coverage rather than being reweighted", () => {
  const result = estimateBenchmarkAdjustedVacancy({
    suburb: "Oakleigh", lga: "Monash",
    features: { populationGrowth: feature(1), unemployment: feature(0.5), employmentGrowth: feature(0.5) },
  });
  assert.equal(result.coverage, 0.45);
  assert.equal(result.contributions.find((item) => item.key === "planningPipeline").status, "missing");
  assert.equal(result.contributions.find((item) => item.key === "planningPipeline").contribution, 0);
});

test("insufficient approved evidence fails closed", () => {
  const result = estimateBenchmarkAdjustedVacancy({ suburb: "Oakleigh", lga: "Monash", features: { unemployment: feature(0.5) } });
  assert.equal(result.kind, "unavailable");
  assert.equal(result.value, null);
  assert.equal(result.confidence, "insufficient");
});

test("quality discounts a weak geographic mapping", () => {
  const strong = estimateBenchmarkAdjustedVacancy({ suburb: "A", lga: "Monash", features: { populationGrowth: feature(1), unemployment: feature(0.5), employmentGrowth: feature(0.5) } });
  const weak = estimateBenchmarkAdjustedVacancy({ suburb: "A", lga: "Monash", features: { populationGrowth: feature(1, 0.5), unemployment: feature(0.5), employmentGrowth: feature(0.5), incomeCapacity: feature(0.5) } });
  assert.ok(weak.value > strong.value);
});

test("output never presents the estimate as a fact", () => {
  const features = Object.fromEntries(Object.keys(VACANCY_MODEL_FEATURE_POLICY.weights).map((key) => [key, feature(0.5)]));
  const result = estimateBenchmarkAdjustedVacancy({ suburb: "Oakleigh", lga: "Monash", features });
  assert.equal(result.kind, "estimate");
  assert.match(result.limitations[0], /not a directly observed suburb vacancy rate/i);
});
