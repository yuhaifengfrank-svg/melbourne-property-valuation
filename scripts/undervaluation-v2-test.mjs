#!/usr/bin/env node
/**
 * Undervaluation Model V2 — Standalone Test
 *
 * OLS regression predicting blended price from:
 *   - school_score
 *   - log(hhd_income)
 *   - owner_occupancy_rate
 *   - cbd_distance_km
 *
 * Scoring: UV Score (0-100) combining price deviation + PIR affordability.
 *
 * Run: cd /Users/FrankAI/Documents/澳洲房地产评估系统 && node scripts/undervaluation-v2-test.mjs
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { readFileSync } from 'fs';

const env = readFileSync('/Users/FrankAI/Documents/澳洲房地产评估系统/.env', 'utf8');
const m = env.match(/DATABASE_URL='([^']+)'/);
const { neon } = require('@neondatabase/serverless');
if (!m) { throw new Error('DB URL not found'); }
const sql = neon(m[1]);

async function run() {
  // Step 1: Pull all suburb metrics with deduplicated SA2 join
  const rows = await sql.query(`
    WITH suburb_cbd_dist AS (
      SELECT
        LOWER(cs.suburb) AS suburb_key,
        6371 * 2 * ASIN(SQRT(
          POWER(SIN(RADIANS((-37.8136 - AVG(cs.lat)) / 2)), 2) +
          COS(RADIANS(-37.8136)) * COS(RADIANS(AVG(cs.lat))) *
          POWER(SIN(RADIANS((144.9631 - AVG(cs.lon)) / 2)), 2)
        )) AS cbd_distance_km
      FROM comparable_sales cs
      WHERE cs.lat IS NOT NULL AND cs.lat != 0 
        AND cs.lon IS NOT NULL AND cs.lon != 0
      GROUP BY LOWER(cs.suburb)
    ),
    first_sa2 AS (
      SELECT DISTINCT ON (LOWER(suburb))
        LOWER(suburb) AS suburb_key,
        sa2_code
      FROM school_locations
      WHERE state = 'VIC' AND sa2_code IS NOT NULL
      ORDER BY LOWER(suburb), calendar_year DESC NULLS LAST
    )
    SELECT DISTINCT ON (LOWER(sm.suburb))
      sm.suburb,
      sm.state,
      sm.median_house_price,
      sm.median_unit_price,
      sm.median_combined_price,
      sm.school_score,
      sm.median_rent,
      sm.vacancy_rate_adjusted AS vacancy_rate,
      sm.dwelling_separate_house,
      sm.dwelling_total,
      sm.dwelling_occupancy_rate,
      (c.g02->>'Median_tot_hhd_inc_weekly')::int AS hhd_income_weekly,
      sd.cbd_distance_km
    FROM suburb_metrics sm
    LEFT JOIN first_sa2 s2 ON LOWER(sm.suburb) = s2.suburb_key
    LEFT JOIN census_sa2_data c ON c.sa2_code::text = s2.sa2_code
    LEFT JOIN suburb_cbd_dist sd ON LOWER(sm.suburb) = sd.suburb_key
    WHERE sm.state = 'VIC'
      AND sm.median_house_price > 0
    ORDER BY LOWER(sm.suburb)
  `);

  console.log(`Loaded ${rows.length} unique VIC suburbs\n`);

  // Step 2: Compute blended price and filter usable rows
  const usable = rows.map(r => {
    const combinedPrice = Number(r.median_combined_price) || 0;
    const housePrice = Number(r.median_house_price) || 0;
    const unitPrice = Number(r.median_unit_price) || 0;
    const separateHouseNum = r.dwelling_separate_house != null ? Number(r.dwelling_separate_house) : null;
    const totalHousing = r.dwelling_total != null ? Number(r.dwelling_total) : null;
    const separateRatio = separateHouseNum != null && totalHousing > 0 ? separateHouseNum / totalHousing : 0.5;
    const blendedPrice = combinedPrice > 0 ? combinedPrice : housePrice * separateRatio + unitPrice * (1 - separateRatio);
    const income = r.hhd_income_weekly ? Number(r.hhd_income_weekly) * 52 : null;

    return {
      suburb: r.suburb,
      state: r.state,
      blendedPrice,
      income,
      occRate: r.dwelling_occupancy_rate != null ? Number(r.dwelling_occupancy_rate) : null,
      school: r.school_score != null ? Number(r.school_score) : null,
      cbdDist: r.cbd_distance_km != null ? Number(r.cbd_distance_km) : null,
      logPrice: blendedPrice > 0 ? Math.log(blendedPrice) : null,
      logIncome: income > 0 ? Math.log(income) : null,
      pir: income > 0 && blendedPrice > 0 ? blendedPrice / income : null,
    };
  }).filter(r => 
    r.blendedPrice > 0 && r.logPrice != null && 
    r.school != null && r.logIncome != null &&
    r.occRate != null && r.cbdDist != null
  );

  console.log(`Usable for regression: ${usable.length} suburbs\n`);

  if (usable.length < 20) {
    console.error('Too few usable suburbs');
    process.exit(1);
  }

  // Step 3: OLS regression
  const X = usable.map(r => [1, r.school, r.logIncome, r.occRate, r.cbdDist]);
  const y = usable.map(r => r.logPrice);
  const n = X.length;
  const p = X[0].length;

  function matMul(A, B) {
    const m = A.length, n = A[0].length, p = B[0].length;
    const C = Array.from({ length: m }, () => Array(p).fill(0));
    for (let i = 0; i < m; i++)
      for (let k = 0; k < n; k++)
        if (A[i][k] !== 0)
          for (let j = 0; j < p; j++)
            C[i][j] += A[i][k] * B[k][j];
    return C;
  }
  function matTranspose(A) {
    return A[0].map((_, j) => A.map(r => r[j]));
  }

  const Xt = matTranspose(X);
  const XtX = matMul(Xt, X);
  const Xty = matMul(Xt, y.map(v => [v])).map(r => r[0]);

  // Gaussian elimination
  function solveLinear(A, b) {
    const n = b.length;
    const aug = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
      let maxRow = col;
      for (let row = col + 1; row < n; row++)
        if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col]))
          maxRow = row;
      [aug[col], aug[maxRow]] = [aug[col], aug[maxRow]];
      const pivot = aug[col][col];
      if (Math.abs(pivot) < 1e-12) continue;
      for (let j = col; j <= n; j++) aug[col][j] /= pivot;
      for (let row = 0; row < n; row++) {
        if (row === col) continue;
        const factor = aug[row][col];
        for (let j = col; j <= n; j++)
          aug[row][j] -= factor * aug[col][j];
      }
    }
    return aug.map(r => r[n]);
  }

  const beta = solveLinear(XtX, Xty);

  const meanY = y.reduce((a, b) => a + b, 0) / n;
  const ssRes = y.reduce((s, yi, i) => {
    const pred = beta.reduce((sum, bj, j) => sum + bj * X[i][j], 0);
    return s + (yi - pred) ** 2;
  }, 0);
  const ssTot = y.reduce((s, yi) => s + (yi - meanY) ** 2, 0);
  const r2 = 1 - ssRes / ssTot;

  console.log('=== Regression Results ===');
  console.log(`R² = ${r2.toFixed(4)}`);
  console.log(`n = ${n}, p = ${p}\n`);
  console.log('Coefficients:');
  const varNames = ['Intercept', 'school_score', 'log(income)', 'occ_rate', 'cbd_distance_km'];
  beta.forEach((b, i) => console.log(`  ${varNames[i]}: ${b.toFixed(6)}`));

  // Step 4: Compute UV Scores
  console.log('\n=== Undervaluation Scores (sorted by UV Score) ===');
  console.log('Suburb'.padEnd(22), 'Actual'.padEnd(10), 'Theory'.padEnd(10), 'Ratio'.padEnd(8), 'PIR'.padEnd(8), 'UV'.padEnd(6), 'Label');

  const results = usable.map(r => {
    const pred = beta.reduce((sum, bj, j) => sum + bj * X[usable.indexOf(r)][j], 0);
    const theoryPrice = Math.exp(pred);
    const ratio = r.blendedPrice / theoryPrice;
    const pir = r.pir || 15;

    const priceScore = ratio < 1.0 
      ? Math.min(100, 50 + (1 - ratio) * 100)
      : Math.max(0, 50 - (ratio - 1) * 100);
    const pirScore = Math.max(0, Math.min(100, (15 - pir) / 10 * 100));
    const uvScore = Math.round(0.6 * priceScore + 0.4 * pirScore);
    const clamped = Math.max(0, Math.min(100, uvScore));

    let label;
    if (clamped >= 80) label = '明显偏低 🟢';
    else if (clamped >= 60) label = '略微偏低 🟢';
    else if (clamped >= 40) label = '接近合理 🟡';
    else if (clamped >= 20) label = '略微偏高 🟠';
    else label = '明显偏高 🔴';

    return {...r, theoryPrice, ratio, pir, uvScore: clamped, label };
  }).sort((a, b) => b.uvScore - a.uvScore);

  results.forEach(r => {
    console.log(
      r.suburb.padEnd(22),
      String(Math.round(r.blendedPrice/1000) + 'K').padEnd(10),
      String(Math.round(r.theoryPrice/1000) + 'K').padEnd(10),
      r.ratio.toFixed(3).padEnd(8),
      r.pir ? r.pir.toFixed(1).padEnd(8) : 'N/A'.padEnd(8),
      String(r.uvScore).padEnd(6),
      r.label
    );
  });

  // Summary stats
  const sorted = [...results].sort((a, b) => a.uvScore - b.uvScore);
  const avgUV = results.reduce((s, r) => s + r.uvScore, 0) / results.length;
  console.log(`\n=== Summary ===`);
  console.log(`R² = ${r2.toFixed(4)}`);
  console.log(`Suburbs: ${results.length}`);
  console.log(`Avg UV: ${avgUV.toFixed(1)}`);
  console.log(`Med UV: ${sorted[Math.floor(sorted.length/2)].uvScore}`);
  console.log(`Min: ${sorted[0].uvScore} (${sorted[0].suburb})`);
  console.log(`Max: ${sorted[sorted.length-1].uvScore} (${sorted[sorted.length-1].suburb})`);

  // Target suburbs
  const targets = ['doncaster', 'point cook', 'sunshine', 'glen waverley', 'scoresby',
    'docklands', 'southbank', 'brighton', 'toorak', 'tarneit',
    'box hill', 'clayton', 'werribee', 'frankston', 'preston'];
  console.log(`\n=== Target Suburbs ===`);
  targets.forEach(t => {
    const found = results.find(r => r.suburb.toLowerCase() === t);
    if (found) {
      console.log(
        found.suburb.padEnd(22),
        String(Math.round(found.blendedPrice/1000) + 'K').padEnd(10),
        String(Math.round(found.theoryPrice/1000) + 'K').padEnd(10),
        found.ratio.toFixed(3).padEnd(8),
        found.pir ? found.pir.toFixed(1).padEnd(8) : 'N/A'.padEnd(8),
        String(found.uvScore).padEnd(6),
        found.label
      );
    } else {
      console.log(`${t.padEnd(22)} NOT FOUND`);
    }
  });
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
