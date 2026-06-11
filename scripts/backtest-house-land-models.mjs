#!/usr/bin/env node

import "dotenv/config";
import fs from "node:fs";
import { getSql } from "../api/_db.js";

const MIN_PRICE = 200_000;
const MAX_PRICE = 12_000_000;
const MIN_LAND = 80;
const MAX_LAND = 10_000;
const MIN_PRIOR_COMPS = 5;
const MAX_COMPS = 12;
const TRAIN_FRACTION = 0.7;
const DAY_MS = 86_400_000;

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function weightedMedian(rows, valueKey) {
  const sorted = [...rows]
    .filter((row) => Number.isFinite(row[valueKey]) && row.weight > 0)
    .sort((a, b) => a[valueKey] - b[valueKey]);
  const totalWeight = sorted.reduce((sum, row) => sum + row.weight, 0);
  let cumulativeWeight = 0;
  for (const row of sorted) {
    cumulativeWeight += row.weight;
    if (cumulativeWeight >= totalWeight / 2) return row[valueKey];
  }
  return sorted.at(-1)?.[valueKey] ?? null;
}

function haversineMeters(a, b) {
  if (![a.lat, a.lon, b.lat, b.lon].every(Number.isFinite)) return null;
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function difference(valueA, valueB, missingPenalty = 0.75) {
  return Number.isFinite(valueA) && Number.isFinite(valueB)
    ? Math.abs(valueA - valueB)
    : missingPenalty;
}

function comparableWeight(subject, comp, includeLandSimilarity = true) {
  const distance = haversineMeters(subject, comp);
  const ageDays = Math.max(0, (subject.date - comp.date) / DAY_MS);
  const distanceWeight = distance == null ? 0.55 : Math.exp(-distance / 2_000);
  const recencyWeight = Math.exp(-ageDays / 730);
  const bedroomWeight = Math.exp(-0.35 * difference(subject.bedrooms, comp.bedrooms));
  const bathroomWeight = Math.exp(-0.2 * difference(subject.bathrooms, comp.bathrooms));
  const landWeight = includeLandSimilarity
    ? Math.exp(-Math.abs(Math.log(subject.land / comp.land)) / 0.6)
    : 1;
  return Math.max(
    0.0001,
    distanceWeight * recencyWeight * bedroomWeight * bathroomWeight * landWeight
  );
}

function selectComparables(subject, trainingRows) {
  return trainingRows
    .filter((row) => row.suburb === subject.suburb && row.date < subject.date)
    .map((row) => ({
      ...row,
      distance: haversineMeters(subject, row),
      selectionWeight: comparableWeight(subject, row, true)
    }))
    .sort((a, b) => {
      if (a.distance != null && b.distance != null && a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      return b.selectionWeight - a.selectionWeight;
    })
    .slice(0, MAX_COMPS);
}

// Approximation of the production architecture: total-price anchor, then tightly
// capped land and bedroom adjustments.
function predictCurrentStyle(subject, comps) {
  const weighted = comps.map((comp) => ({
    ...comp,
    weight: comparableWeight(subject, comp, true),
    value: comp.price
  }));
  const anchor = weightedMedian(weighted, "value");
  const compLandMedian = median(comps.map((comp) => comp.land));
  const compBedMedian = median(comps.map((comp) => comp.bedrooms));
  const landAdjustment = Math.max(
    -0.05,
    Math.min(0.05, Math.log(subject.land / compLandMedian) * 0.08)
  );
  const bedroomAdjustment = Number.isFinite(compBedMedian)
    ? Math.max(-0.05, Math.min(0.05, (subject.bedrooms - compBedMedian) * 0.02))
    : 0;
  return anchor * (1 + landAdjustment + bedroomAdjustment);
}

// The literal proposal: treat the whole improved sale price as land value per sqm.
function predictNaiveLandUnit(subject, comps) {
  const weighted = comps.map((comp) => ({
    ...comp,
    weight: comparableWeight(subject, comp, false),
    value: comp.price / comp.land
  }));
  return weightedMedian(weighted, "value") * subject.land;
}

function solveLinearSystem(matrix, vector) {
  const n = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    if (Math.abs(augmented[column][column]) < 1e-10) return null;
    const divisor = augmented[column][column];
    for (let j = column; j <= n; j++) augmented[column][j] /= divisor;
    for (let row = 0; row < n; row++) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let j = column; j <= n; j++) augmented[row][j] -= factor * augmented[column][j];
    }
  }
  return augmented.map((row) => row[n]);
}

// Fit elasticities after removing suburb means. This estimates how price changes
// with land and accommodation within the same suburb, instead of confusing cheap
// suburbs with small blocks.
function fitWithinSuburbElasticities(trainingRows) {
  const groups = Map.groupBy(trainingRows, (row) => row.suburb);
  const observations = [];
  for (const rows of groups.values()) {
    if (rows.length < MIN_PRIOR_COMPS) continue;
    const features = rows.map((row) => [
      Math.log(row.land),
      row.bedrooms,
      Number.isFinite(row.bathrooms) ? row.bathrooms : 1,
      row.date.getTime() / DAY_MS / 365.25
    ]);
    const targets = rows.map((row) => Math.log(row.price));
    const featureMeans = features[0].map((_, column) =>
      features.reduce((sum, row) => sum + row[column], 0) / features.length
    );
    const targetMean = targets.reduce((sum, value) => sum + value, 0) / targets.length;
    for (let i = 0; i < rows.length; i++) {
      observations.push({
        x: features[i].map((value, column) => value - featureMeans[column]),
        y: targets[i] - targetMean
      });
    }
  }

  const dimensions = 4;
  const xtx = Array.from({ length: dimensions }, () => Array(dimensions).fill(0));
  const xty = Array(dimensions).fill(0);
  for (const observation of observations) {
    for (let i = 0; i < dimensions; i++) {
      xty[i] += observation.x[i] * observation.y;
      for (let j = 0; j < dimensions; j++) {
        xtx[i][j] += observation.x[i] * observation.x[j];
      }
    }
  }
  const ridge = 0.01;
  for (let i = 0; i < dimensions; i++) xtx[i][i] += ridge;
  const beta = solveLinearSystem(xtx, xty);
  if (!beta) throw new Error("Could not fit land elasticities");
  return {
    land: Math.max(0, Math.min(1, beta[0])),
    bedroom: Math.max(-0.1, Math.min(0.3, beta[1])),
    bathroom: Math.max(-0.1, Math.min(0.3, beta[2])),
    annualTime: Math.max(-0.2, Math.min(0.2, beta[3])),
    observations: observations.length
  };
}

function predictElasticLand(subject, comps, beta) {
  const weighted = comps.map((comp) => {
    const yearDifference = (subject.date - comp.date) / DAY_MS / 365.25;
    const adjustedPrice = comp.price
      * (subject.land / comp.land) ** beta.land
      * Math.exp(beta.bedroom * (subject.bedrooms - comp.bedrooms))
      * Math.exp(beta.bathroom * (
        (Number.isFinite(subject.bathrooms) ? subject.bathrooms : 1)
        - (Number.isFinite(comp.bathrooms) ? comp.bathrooms : 1)
      ))
      * Math.exp(beta.annualTime * yearDifference);
    return {
      ...comp,
      weight: comparableWeight(subject, comp, false),
      value: adjustedPrice
    };
  });
  return weightedMedian(weighted, "value");
}

function summarise(predictions) {
  const valid = predictions.filter((row) => Number.isFinite(row.predicted) && row.predicted > 0);
  const errors = valid.map((row) => {
    const signed = (row.predicted - row.actual) / row.actual;
    return { ...row, signed, absolute: Math.abs(signed), squared: (row.predicted - row.actual) ** 2 };
  });
  return {
    n: errors.length,
    mapePct: errors.reduce((sum, row) => sum + row.absolute, 0) / errors.length * 100,
    medianApePct: median(errors.map((row) => row.absolute)) * 100,
    rmse: Math.sqrt(errors.reduce((sum, row) => sum + row.squared, 0) / errors.length),
    biasPct: errors.reduce((sum, row) => sum + row.signed, 0) / errors.length * 100,
    within10Pct: errors.filter((row) => row.absolute <= 0.10).length / errors.length * 100,
    within15Pct: errors.filter((row) => row.absolute <= 0.15).length / errors.length * 100,
    within20Pct: errors.filter((row) => row.absolute <= 0.20).length / errors.length * 100
  };
}

function summariseByLandQuartile(predictions) {
  const lands = predictions.map((row) => row.land).sort((a, b) => a - b);
  const cutoffs = [0.25, 0.5, 0.75].map((fraction) => lands[Math.floor(lands.length * fraction)]);
  const bucket = (land) => land <= cutoffs[0] ? "small"
    : land <= cutoffs[1] ? "medium-small"
      : land <= cutoffs[2] ? "medium-large"
        : "large";
  return Object.fromEntries(
    [...Map.groupBy(predictions, (row) => bucket(row.land))]
      .map(([name, rows]) => [name, summarise(rows)])
  );
}

async function loadRows() {
  const sql = getSql();
  const rows = await sql.query(`
    SELECT id, sale_address, suburb, sale_date, sale_price, bedrooms, bathrooms,
           land_size_sqm, lat, lon
    FROM comparable_sales
    WHERE property_type = 'House'
      AND sale_price BETWEEN $1 AND $2
      AND land_size_sqm BETWEEN $3 AND $4
      AND bedrooms BETWEEN 1 AND 8
      AND sale_date IS NOT NULL
    ORDER BY sale_date, id
  `, [MIN_PRICE, MAX_PRICE, MIN_LAND, MAX_LAND]);
  return rows.map((row) => ({
    id: row.id,
    address: row.sale_address,
    suburb: row.suburb,
    date: new Date(row.sale_date),
    price: Number(row.sale_price),
    bedrooms: Number(row.bedrooms),
    bathrooms: row.bathrooms == null ? null : Number(row.bathrooms),
    land: Number(row.land_size_sqm),
    lat: row.lat == null ? null : Number(row.lat),
    lon: row.lon == null ? null : Number(row.lon)
  }));
}

async function main() {
  const rows = await loadRows();
  const sortedDates = rows.map((row) => row.date.getTime()).sort((a, b) => a - b);
  const cutoff = new Date(sortedDates[Math.floor(sortedDates.length * TRAIN_FRACTION)]);
  const trainingRows = rows.filter((row) => row.date <= cutoff);
  const testRows = rows.filter((row) => row.date > cutoff);
  const beta = fitWithinSuburbElasticities(trainingRows);

  const predictions = {
    currentStyle: [],
    naiveLandUnit: [],
    elasticLand: []
  };
  let skippedForSparseHistory = 0;

  for (const subject of testRows) {
    const comps = selectComparables(subject, trainingRows);
    if (comps.length < MIN_PRIOR_COMPS) {
      skippedForSparseHistory++;
      continue;
    }
    const common = {
      id: subject.id,
      suburb: subject.suburb,
      date: subject.date.toISOString().slice(0, 10),
      actual: subject.price,
      land: subject.land,
      comparableCount: comps.length
    };
    predictions.currentStyle.push({
      ...common,
      predicted: predictCurrentStyle(subject, comps)
    });
    predictions.naiveLandUnit.push({
      ...common,
      predicted: predictNaiveLandUnit(subject, comps)
    });
    predictions.elasticLand.push({
      ...common,
      predicted: predictElasticLand(subject, comps, beta)
    });
  }

  // ── Large-Lot Group Reporting ──
  const largeLotPredictions = {
    currentStyle: predictions.currentStyle.filter(p => p.land >= 2000),
    naiveLandUnit: predictions.naiveLandUnit.filter(p => p.land >= 2000),
    elasticLand: predictions.elasticLand.filter(p => p.land >= 2000)
  };

  // Large-lot definitions:
  const largeLotTiers = {
    "size_2000plus": predictions.currentStyle.filter(p => p.land >= 2000),
    "size_3000plus": predictions.currentStyle.filter(p => p.land >= 3000),
    "size_4000plus": predictions.currentStyle.filter(p => p.land >= 4000),
  };

  const result = {
    generatedAt: new Date().toISOString(),
    methodology: {
      propertyType: "House only",
      split: "Chronological 70/30 holdout",
      cutoffDate: cutoff.toISOString().slice(0, 10),
      minimumPriorComparables: MIN_PRIOR_COMPS,
      maximumComparables: MAX_COMPS,
      leakageControl: "Every prediction uses only rows in the fixed training period"
    },
    coverage: {
      eligibleRows: rows.length,
      trainingRows: trainingRows.length,
      testRows: testRows.length,
      evaluatedRows: predictions.currentStyle.length,
      skippedForSparseHistory
    },
    learnedElasticities: beta,
    largeLotCoverage: {
      size2000Plus: largeLotPredictions.currentStyle.filter(p => p.land >= 2000).length,
      size3000Plus: largeLotPredictions.currentStyle.filter(p => p.land >= 3000).length,
      size4000Plus: largeLotPredictions.currentStyle.filter(p => p.land >= 4000).length,
    },
    models: {
      currentStyle: {
        description: "Total-price comparable anchor with capped land/bedroom adjustments",
        metrics: summarise(predictions.currentStyle),
        byLandQuartile: summariseByLandQuartile(predictions.currentStyle),
        largeLot: {
          describe: "Subset of test set where subject.land >= 2000㎡",
          size2000Plus: largeLotPredictions.currentStyle.length ? summarise(largeLotPredictions.currentStyle) : null,
          size3000Plus: largeLotTiers.size_3000plus.length ? summarise(largeLotTiers.size_3000plus) : null,
          size4000Plus: largeLotTiers.size_4000plus.length ? summarise(largeLotTiers.size_4000plus) : null
        }
      },
      naiveLandUnit: {
        description: "Weighted median improved-sale price per land sqm multiplied by subject land",
        metrics: summarise(predictions.naiveLandUnit),
        byLandQuartile: summariseByLandQuartile(predictions.naiveLandUnit),
        largeLot: {
          size2000Plus: largeLotPredictions.naiveLandUnit.length ? summarise(largeLotPredictions.naiveLandUnit) : null
        }
      },
      elasticLand: {
        description: "Distance/recency weighted comparable prices adjusted by learned nonlinear land elasticity",
        metrics: summarise(predictions.elasticLand),
        byLandQuartile: summariseByLandQuartile(predictions.elasticLand),
        largeLot: {
          size2000Plus: largeLotPredictions.elasticLand.length ? summarise(largeLotPredictions.elasticLand) : null
        }
      }
    }
  };

  const outputPath = "/tmp/aushomevalue-house-land-backtest.json";
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nFull result written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
