#!/usr/bin/env node

import "dotenv/config";
import fs from "node:fs";
import { getSql } from "../api/_db.js";
import {
  valueProperty,
  channelAEstimate,
  channelBEstimate,
  detectLargeLotMode,
  selectLargeLotComparables,
  largeLotConfidence
} from "../lib/valuation-engine.js";

// ── Config ──
const MIN_PRICE = 200_000;
const MAX_PRICE = 12_000_000;
const MIN_LAND = 80;
const MAX_LAND = 10_000;
const MIN_PRIOR_COMPS = 5;
const MAX_COMPS = 12;
const TRAIN_FRACTION = 0.7;
const DAY_MS = 86_400_000;
const LARGE_LOT_THRESHOLD = 2000;     // proxy for suburb P90
const PRODUCTION_MAP_MAX_COMPS = 8;

// ── Helpers ──
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

// ── Legacy models (keeping for baseline comparison) ──
function predictCurrentStyle(subject, comps) {
  const weighted = comps.map((comp) => ({
    ...comp, weight: comparableWeight(subject, comp, true), value: comp.price
  }));
  const anchor = weightedMedian(weighted, "value");
  const compLandMedian = median(comps.map((c) => c.land));
  const compBedMedian = median(comps.map((c) => c.bedrooms));
  const landAdjustment = Math.max(-0.05, Math.min(0.05, Math.log(subject.land / compLandMedian) * 0.08));
  const bedroomAdjustment = Number.isFinite(compBedMedian)
    ? Math.max(-0.05, Math.min(0.05, (subject.bedrooms - compBedMedian) * 0.02))
    : 0;
  return anchor * (1 + landAdjustment + bedroomAdjustment);
}

function predictNaiveLandUnit(subject, comps) {
  const weighted = comps.map((comp) => ({
    ...comp, weight: comparableWeight(subject, comp, false), value: comp.price / comp.land
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

function fitWithinSuburbElasticities(trainingRows) {
  const groups = Map.groupBy(trainingRows, (row) => row.suburb);
  const observations = [];
  for (const rows of groups.values()) {
    if (rows.length < MIN_PRIOR_COMPS) continue;
    const features = rows.map((row) => [
      Math.log(row.land), row.bedrooms,
      Number.isFinite(row.bathrooms) ? row.bathrooms : 1,
      row.date.getTime() / DAY_MS / 365.25
    ]);
    const targets = rows.map((row) => Math.log(row.price));
    const featureMeans = features[0].map((_, col) => features.reduce((s, r) => s + r[col], 0) / features.length);
    const targetMean = targets.reduce((s, v) => s + v, 0) / targets.length;
    for (let i = 0; i < rows.length; i++) {
      observations.push({
        x: features[i].map((v, col) => v - featureMeans[col]),
        y: targets[i] - targetMean
      });
    }
  }
  const dim = 4;
  const xtx = Array.from({ length: dim }, () => Array(dim).fill(0));
  const xty = Array(dim).fill(0);
  for (const obs of observations) {
    for (let i = 0; i < dim; i++) {
      xty[i] += obs.x[i] * obs.y;
      for (let j = 0; j < dim; j++) xtx[i][j] += obs.x[i] * obs.x[j];
    }
  }
  for (let i = 0; i < dim; i++) xtx[i][i] += 0.01;
  const beta = solveLinearSystem(xtx, xty);
  if (!beta) throw new Error("Could not fit elasticities");
  return { land: Math.max(0, Math.min(1, beta[0])),
    bedroom: Math.max(-0.1, Math.min(0.3, beta[1])),
    bathroom: Math.max(-0.1, Math.min(0.3, beta[2])),
    annualTime: Math.max(-0.2, Math.min(0.2, beta[3])),
    observations: observations.length };
}

function predictElasticLand(subject, comps, beta) {
  const weighted = comps.map((comp) => {
    const yrDiff = (subject.date - comp.date) / DAY_MS / 365.25;
    const ap = comp.price
      * (subject.land / comp.land) ** beta.land
      * Math.exp(beta.bedroom * (subject.bedrooms - comp.bedrooms))
      * Math.exp(beta.bathroom * (
        (Number.isFinite(subject.bathrooms) ? subject.bathrooms : 1)
        - (Number.isFinite(comp.bathrooms) ? comp.bathrooms : 1)
      ))
      * Math.exp(beta.annualTime * yrDiff);
    return { ...comp, weight: comparableWeight(subject, comp, false), value: ap };
  });
  return weightedMedian(weighted, "value");
}

// ── Production model wrapper ──
// Maps a backtest row into the valueProperty() input format and runs the engine.
function runProduction(subjectRow, compRows) {
  // Build comp format matching what db-comparable-source returns
  const comps = compRows.map((c) => ({
    id: c.id,
    address: c.address || "",
    suburb: c.suburb,
    saleDate: c.date.toISOString().slice(0, 10),
    salePrice: c.price,
    bedrooms: c.bedrooms,
    bathrooms: c.bathrooms,
    carSpaces: null,
    landSize: c.land,
    propertyType: "House",
    lat: c.lat,
    lon: c.lon,
    distanceMeters: c.distance
  }));

  // Convert backtest row to subject format.
  // The production valueProperty expects address/nominatim fields;
  // we supply what we have and let the engine work.
  const input = {
    address: subjectRow.address || `${subjectRow.suburb} VIC`,
    suburb: subjectRow.suburb,
    state: "VIC",
    propertyType: "House",
    bedrooms: String(subjectRow.bedrooms),
    bathrooms: subjectRow.bathrooms != null ? String(subjectRow.bathrooms) : undefined,
    landSize: String(subjectRow.land),
    coordinates: (subjectRow.lat != null && subjectRow.lon != null)
      ? { lat: subjectRow.lat, lon: subjectRow.lon }
      : undefined,
    fetch: false,
    useDatabaseFallback: true,
    mockCollectorComparables: comps
  };

  // Run the production engine
  const result = valueProperty({
    publicData: { absProfile: null, rbaRates: null, vicplan: null },
    subject: {
      address: input.address,
      propertyType: "House",
      bedrooms: parseInt(input.bedrooms) || null,
      bathrooms: input.bathrooms ? parseInt(input.bathrooms) : null,
      carSpaces: null,
      landSize: parseInt(input.landSize) || null,
      landSizeSource: "user",
      coordinates: input.coordinates || null
    },
    comparables: comps,
    factorOverrides: { educationFactor: 1.0, censusFactor: 1.0 },
    debug: false
  });

  return {
    predicted: result.valuation?.midpoint || null,
    valuationMode: result.valuationMode || "standard_house",
    channelAResult: result.largeLotResult?.channelAResult
      ? { adjustedPrice: result.largeLotResult.channelAResult.adjustedPrice }
      : null
  };
}

function summarise(predictions) {
  const valid = predictions.filter((p) => Number.isFinite(p.predicted) && p.predicted > 0);
  const errors = valid.map((p) => {
    const signed = (p.predicted - p.actual) / p.actual;
    return { ...p, signed, absolute: Math.abs(signed), squared: (p.predicted - p.actual) ** 2 };
  });
  return {
    n: errors.length,
    mapePct: errors.reduce((s, r) => s + r.absolute, 0) / errors.length * 100,
    medianApePct: median(errors.map((r) => r.absolute)) * 100,
    rmse: Math.sqrt(errors.reduce((s, r) => s + r.squared, 0) / errors.length),
    biasPct: errors.reduce((s, r) => s + r.signed, 0) / errors.length * 100,
    within10Pct: errors.filter((r) => r.absolute <= 0.10).length / errors.length * 100,
    within15Pct: errors.filter((r) => r.absolute <= 0.15).length / errors.length * 100,
    within20Pct: errors.filter((r) => r.absolute <= 0.20).length / errors.length * 100
  };
}

function summariseByLandQuartile(predictions) {
  const lands = predictions.map((p) => p.land).sort((a, b) => a - b);
  const cutoffs = [0.25, 0.5, 0.75].map((f) => lands[Math.floor(lands.length * f)]);
  const bucket = (l) => l <= cutoffs[0] ? "small"
    : l <= cutoffs[1] ? "medium-small"
      : l <= cutoffs[2] ? "medium-large" : "large";
  return Object.fromEntries(
    [...Map.groupBy(predictions, (p) => bucket(p.land))]
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
  const out = rows.map((row) => ({
    id: row.id, address: row.sale_address, suburb: row.suburb,
    date: new Date(row.sale_date), price: Number(row.sale_price),
    bedrooms: Number(row.bedrooms), bathrooms: row.bathrooms == null ? null : Number(row.bathrooms),
    land: Number(row.land_size_sqm), lat: row.lat == null ? null : Number(row.lat),
    lon: row.lon == null ? null : Number(row.lon)
  }));
  console.log(`[loadRows] loaded ${out.length} House records`);
  return out;
}

// ── Main ──
async function main() {
  const rows = await loadRows();
  const sorted = rows.map((r) => r.date.getTime()).sort((a, b) => a - b);
  const cutoff = new Date(sorted[Math.floor(sorted.length * TRAIN_FRACTION)]);
  const training = rows.filter((r) => r.date <= cutoff);
  const testRows = rows.filter((r) => r.date > cutoff);
  const beta = fitWithinSuburbElasticities(training);

  console.log(`[backtest] training=${training.length} test=${testRows.length} cutoff=${cutoff.toISOString().slice(0,10)}`);

  const predictions = { currentStyle: [], naiveLandUnit: [], elasticLand: [], production: [] };
  let skipped = 0, skippedProduction = 0;

  for (let i = 0; i < testRows.length; i++) {
    const sub = testRows[i];
    const comps = selectComparables(sub, training);
    if (comps.length < MIN_PRIOR_COMPS) {
      skipped++;
      continue;
    }
    const common = { id: sub.id, suburb: sub.suburb, date: sub.date.toISOString().slice(0, 10),
      actual: sub.price, land: sub.land, comparableCount: comps.length };

    predictions.currentStyle.push({ ...common, predicted: predictCurrentStyle(sub, comps) });
    predictions.naiveLandUnit.push({ ...common, predicted: predictNaiveLandUnit(sub, comps) });
    predictions.elasticLand.push({ ...common, predicted: predictElasticLand(sub, comps, beta) });

    try {
      const prod = runProduction(sub, comps);
      if (prod.predicted != null) {
        predictions.production.push({ ...common, predicted: prod.predicted, valuationMode: prod.valuationMode });
      } else {
        skippedProduction++;
      }
    } catch (err) {
      skippedProduction++;
      console.warn(`[production] skip row ${sub.id}: ${err.message}`);
    }

    if ((i + 1) % 500 === 0 || i === testRows.length - 1) {
      console.log(`[progress] ${i + 1}/${testRows.length} — legacy ${predictions.currentStyle.length} production ${predictions.production.length}`);
    }
  }

  // ── Summarise ──
  const largeLotLegacy = predictions.currentStyle.filter((p) => p.land >= LARGE_LOT_THRESHOLD);
  const largeLotProd = predictions.production.filter((p) => p.land >= LARGE_LOT_THRESHOLD);
  const largeLotProdCount = largeLotProd.length;

  const result = {
    generatedAt: new Date().toISOString(),
    methodology: {
      propertyType: "House only",
      split: "Chronological 70/30 holdout",
      cutoffDate: cutoff.toISOString().slice(0, 10),
      minimumPriorComparables: MIN_PRIOR_COMPS,
      maximumComparables: MAX_COMPS,
      note: "production model runs via valueProperty() from lib/valuation-engine.js — same code path as live API"
    },
    coverage: {
      eligibleRows: rows.length, trainingRows: training.length,
      testRows: testRows.length, evaluatedLegacy: predictions.currentStyle.length,
      evaluatedProduction: predictions.production.length,
      skippedForSparseHistory: skipped,
      skippedProductionErrors: skippedProduction
    },
    learnedElasticities: beta,
    largeLotCoverage: {
      legacy: { size2000Plus: largeLotLegacy.length },
      production: { size2000Plus: largeLotProdCount }
    },
    models: {
      currentStyle: {
        description: "Legacy: anchored median with capped land/bedroom adjustments (NOT the production engine)",
        metrics: summarise(predictions.currentStyle),
        byLandQuartile: summariseByLandQuartile(predictions.currentStyle),
        largeLot: {
          note: `Subset where subject.land >= ${LARGE_LOT_THRESHOLD}㎡ (proxy for large_lot_house mode)`,
          size2000Plus: largeLotLegacy.length ? summarise(largeLotLegacy) : null
        }
      },
      naiveLandUnit: {
        description: "Legacy: weighted median price/㎡ × subject land (NOT the production engine)",
        metrics: summarise(predictions.naiveLandUnit),
        byLandQuartile: summariseByLandQuartile(predictions.naiveLandUnit),
        largeLot: {
          size2000Plus: predictions.naiveLandUnit.filter((p) => p.land >= LARGE_LOT_THRESHOLD).length
            ? summarise(predictions.naiveLandUnit.filter((p) => p.land >= LARGE_LOT_THRESHOLD))
            : null
        }
      },
      elasticLand: {
        description: "Legacy: suburb-within elasticity model (NOT the production engine)",
        metrics: summarise(predictions.elasticLand),
        byLandQuartile: summariseByLandQuartile(predictions.elasticLand),
        largeLot: {
          size2000Plus: predictions.elasticLand.filter((p) => p.land >= LARGE_LOT_THRESHOLD).length
            ? summarise(predictions.elasticLand.filter((p) => p.land >= LARGE_LOT_THRESHOLD))
            : null
        }
      },
      productionValueProperty: {
        description: "PRODUCTION: runs valueProperty() direct — IDENTICAL to live API estimate path",
        metrics: summarise(predictions.production),
        byLandQuartile: summariseByLandQuartile(predictions.production),
        largeLot: {
          note: "These predictions use the same production detectLargeLotMode & channelAEstimate code as the live website",
          size2000Plus: largeLotProdCount
            ? summarise(largeLotProd)
            : {
                n: 0,
                mapePct: null, medianApePct: null, rmse: null, biasPct: null,
                within10Pct: null, within15Pct: null, within20Pct: null,
                _disclaimer: "样本不足，尚不能证明精度改善。 欢迎提供成交数据以改进模型。 Insufficient sample — cannot yet demonstrate accuracy improvement from the production large-lot mode."
              }
        }
      }
    }
  };

  const outputPath = "/tmp/aushomevalue-house-land-backtest.json";
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nBacktest written to ${outputPath}`);
  console.log(`Production large-lot sample: ${largeLotProdCount} entries`);
  if (largeLotProdCount < 10) {
    console.log("⚠️  样本过少，无法统计大块地模式的精度优势。");
    console.log("⚠️  当成交数积累到 ≥30 条时，MAPE/MedianAPE 对比才有统计意义。");
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
