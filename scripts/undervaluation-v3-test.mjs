#!/usr/bin/env node
/**
 * Undervaluation Model V3 — Fully debugged
 *
 * Fixes over V2:
 *   - dwelling_separate_house is PERCENT (0-100), NOT count. Use /100 for ratio.
 *   - dwelling_occupancy_rate is PERCENT (0-100), kept as-is for regression.
 *   - Double DISTINCT ON to eliminate 20 duplicate suburbs from SA2 join.
 *   - Suburbs without combined_price AND without unit_price -> fallback to house_price only.
 *
 * Model: log(blendedPrice) = b0 + b1*school_score + b2*log(income) + b3*occ_rate + b4*cbdDist
 *       + optional b5*vacancy_rate + b6*log(rent)
 * 
 * Blended price: median_combined_price if available,
 *   else: house_price * separate_ratio + unit_price * (1-separate_ratio)
 *   else (no unit price): house_price (for rural/fringe suburbs)
 *
 * Run: node scripts/undervaluation-v3-test.mjs
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { readFileSync } from 'fs';

const env = readFileSync('/Users/FrankAI/Documents/澳洲房地产评估系统/.env', 'utf8');
const m = env.match(/DATABASE_URL='([^']+)'/);
const { neon } = require('@neondatabase/serverless');
if (!m) { throw new Error('DB URL not found'); }
const sql = neon(m[1]);

function ols(X, y) {
  const n = X.length, p = X[0].length;
  function mul(A, B) {
    const m = A.length, n = A[0].length, p = B[0].length, C = Array.from({ length: m }, () => Array(p).fill(0));
    for (let i = 0; i < m; i++) for (let k = 0; k < n; k++) if (A[i][k] !== 0) for (let j = 0; j < p; j++) C[i][j] += A[i][k] * B[k][j];
    return C;
  }
  function transp(A) { return A[0].map((_, j) => A.map(r => r[j])); }
  const Xt = transp(X);
  const XtX = mul(Xt, X);
  const Xty = mul(Xt, y.map(v => [v])).map(r => r[0]);
  
  // Gauss-Jordan
  const aug = XtX.map((row, i) => [...row, Xty[i]]);
  for (let col = 0; col < p; col++) {
    let mr = col;
    for (let r = col+1; r < p; r++) if (Math.abs(aug[r][col]) > Math.abs(aug[mr][col])) mr = r;
    [aug[col], aug[mr]] = [aug[col], aug[mr]];
    const piv = aug[col][col];
    if (Math.abs(piv) < 1e-12) continue;
    for (let j = col; j <= p; j++) aug[col][j] /= piv;
    for (let r = 0; r < p; r++) {
      if (r === col) continue;
      const f = aug[r][col];
      for (let j = col; j <= p; j++) aug[r][j] -= f * aug[col][j];
    }
  }
  const beta = aug.map(r => r[p]);

  const meanY = y.reduce((a,b) => a+b, 0) / n;
  const ssRes = y.reduce((s, yi, i) => {
    const pred = beta.reduce((sum, bj, j) => sum + bj * X[i][j], 0);
    return s + (yi - pred) ** 2;
  }, 0);
  const ssTot = y.reduce((s, yi) => s + (yi - meanY) ** 2, 0);
  const r2 = 1 - ssRes / ssTot;
  const adjR2 = 1 - (ssRes / (n - p)) / (ssTot / (n - 1));
  
  return { beta, r2, adjR2, n, p, ssRes, ssTot, meanY };
}

async function run() {
  // Rebuild query with double-dedupe
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
    SELECT
      sm.suburb,
      sm.median_house_price,
      sm.median_unit_price,
      sm.median_combined_price,
      sm.school_score,
      sm.dwelling_separate_house,
      sm.dwelling_occupancy_rate,
      sm.vacancy_rate_adjusted,
      sm.median_rent,
      (c.g02->>'Median_tot_hhd_inc_weekly')::int AS hhd_income_weekly,
      sd.cbd_distance_km
    FROM suburb_metrics sm
    LEFT JOIN first_sa2 s2 ON LOWER(sm.suburb) = s2.suburb_key
    LEFT JOIN census_sa2_data c ON c.sa2_code::text = s2.sa2_code
    LEFT JOIN suburb_cbd_dist sd ON LOWER(sm.suburb) = sd.suburb_key
    WHERE sm.state = 'VIC'
      AND sm.median_house_price > 0
  `);

  // Dedupe in JS (safer than SQL DISTINCT ON)
  const seen = new Set();
  const deduped = rows.filter(r => {
    const key = r.suburb.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`Loaded ${rows.length} raw rows, deduped to ${deduped.length} unique suburbs\n`);

  // Build blended price
  const usable = deduped.map(r => {
    const housePrice = Number(r.median_house_price) || 0;
    const unitPrice = Number(r.median_unit_price) || 0;
    const combinedPrice = Number(r.median_combined_price) || 0;
    
    // FIX 1: separate_house is PERCENT (0-100)
    const separateHousePct = r.dwelling_separate_house != null ? Number(r.dwelling_separate_house) : null;
    const separateRatio = separateHousePct != null ? separateHousePct / 100 : 0.5;
    
    // FIX 4: if no combined AND no unit price, fall back to house_price
    let blendedPrice;
    if (combinedPrice > 0) {
      blendedPrice = combinedPrice;
    } else if (unitPrice > 0) {
      blendedPrice = housePrice * separateRatio + unitPrice * (1 - separateRatio);
    } else {
      blendedPrice = housePrice;  // rural/fringe with no unit market
    }
    
    const income = r.hhd_income_weekly ? Number(r.hhd_income_weekly) * 52 : null;
    // FIX: occ_rate is also percent (0-100), confirmed 28.7-93.1 range
    const occRate = r.dwelling_occupancy_rate != null ? Number(r.dwelling_occupancy_rate) : null;
    const vacancyRate = r.vacancy_rate_adjusted != null ? Number(r.vacancy_rate_adjusted) : null;
    const medianRent = r.median_rent != null ? Number(r.median_rent) : null;

    return {
      suburb: r.suburb,
      housePrice,
      unitPrice,
      combinedPrice,
      separateRatio,
      blendedPrice,
      income,
      occRate,            // 0-100 percent, used directly in regression
      vacancyRate,
      medianRent,
      school: r.school_score != null ? Number(r.school_score) : null,
      cbdDist: r.cbd_distance_km != null ? Number(r.cbd_distance_km) : null,
      logPrice: blendedPrice > 0 ? Math.log(blendedPrice) : null,
      logIncome: income > 0 ? Math.log(income) : null,
      logRent: medianRent > 0 ? Math.log(medianRent) : null,
      pir: income > 0 && blendedPrice > 0 ? blendedPrice / income : null,
    };
  }).filter(r => 
    r.blendedPrice > 0 && r.logPrice != null && 
    r.school != null && r.logIncome != null &&
    r.occRate != null && r.cbdDist != null &&
    r.vacancyRate != null && r.logRent != null
  );

  console.log(`Usable for regression: ${usable.length} suburbs\n`);

  // OLS
  // OLS — 4-factor (baseline)
  const X4 = usable.map(r => [1, r.school, r.logIncome, r.occRate, r.cbdDist]);
  const y = usable.map(r => r.logPrice);
  const { beta: beta4, r2: r24, adjR2: adjR24, n: n4, p: p4 } = ols(X4, y);
  
  // OLS — 6-factor (add vacancy + rent)
  const X6 = usable.map(r => [1, r.school, r.logIncome, r.occRate, r.cbdDist, r.vacancyRate, r.logRent]);
  const { beta: beta6, r2: r26, adjR2: adjR26, n: n6, p: p6 } = ols(X6, y);

  console.log('=== 4-Factor Model (baseline) ===');
  console.log(`R² = ${r24.toFixed(4)}`);
  console.log(`Adj R² = ${adjR24.toFixed(4)}`);
  console.log(`n = ${n4}, p = ${p4}\n`);
  const varNames4 = ['Intercept', 'school_score', 'log(income)', 'occ_rate(%)', 'cbd_distance_km'];
  console.log('Coefficients:');
  beta4.forEach((b, i) => console.log(`  ${varNames4[i]}: ${b.toFixed(6)} (${b>0?'+':'-'})`));
  const sane4 = beta4[1]>0&&beta4[2]>0&&beta4[3]>0&&beta4[4]<0;
  console.log(`\n${sane4 ? '✅ All directions correct' : '❌ Issues found'}\n`);
  
  console.log('=== 6-Factor Model (vacancy + rent added) ===');
  console.log(`R² = ${r26.toFixed(4)}`);
  console.log(`Adj R² = ${adjR26.toFixed(4)}`);
  console.log(`n = ${n6}, p = ${p6}\n`);
  const varNames6 = ['Intercept', 'school_score', 'log(income)', 'occ_rate(%)', 'cbd_distance_km', 'vacancy_rate', 'log(rent)'];
  console.log('Coefficients:');
  beta6.forEach((b, i) => {
    const dir = b>0?'+':'-';
    let ok = true;
    if (i===5) ok = b<0; // vacancy -
    if (i===6) ok = b>0; // rent +
    console.log(`  ${varNames6[i]}: ${b.toFixed(6)} (${dir})${ok ? ' ✅' : ' ❌'}`);
  });
  const sane6 = beta6[1]>0 && beta6[2]>0 && beta6[3]>0 && beta6[4]<0 && beta6[5]<0 && beta6[6]>0;
  console.log(`\n${sane6 ? '✅ All directions correct' : '❌ Some directions wrong'}\n`);
  
  // Use 6-factor if R² improves by at least 0.01
  const useSix = r26 - r24 > 0.01;
  const beta = useSix ? beta6 : beta4;
  const X = useSix ? X6 : X4;
  const r2 = useSix ? r26 : r24;
  const p = useSix ? p6 : p4;
  const n = useSix ? n6 : n4;
  console.log(`Using ${useSix ? '6-factor' : '4-factor'} model for UV scoring\n`);

  // UV Scores
  const allResults = usable.map((r, i) => {
    const pred = beta.reduce((sum, bj, j) => sum + bj * X[i][j], 0);
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

    return {...r, theoryPrice, ratio, pir: r.pir, uvScore: clamped, label };
  });

  // Target suburbs
  const targets = ['doncaster', 'point cook', 'sunshine', 'glen waverley', 'scoresby',
    'docklands', 'southbank', 'brighton', 'toorak', 'tarneit',
    'box hill', 'clayton', 'werribee', 'frankston', 'preston',
    'mickleham', 'manor lakes', 'diggers rest', 'maribyrnong', 'wyndham vale'];
    
  console.log(`\n=== Target Suburbs (R²=${r2.toFixed(4)}) ===`);
  console.log('Suburb'.padEnd(22), 'Actual'.padEnd(10), 'Theory'.padEnd(10), 'Ratio'.padEnd(8), 'PIR'.padEnd(8), 'UV'.padEnd(6), 'Label');
  targets.forEach(t => {
    const f = allResults.find(r => r.suburb.toLowerCase() === t);
    if (f) console.log(
      f.suburb.padEnd(22),
      String(Math.round(f.blendedPrice/1000)+'K').padEnd(10),
      String(Math.round(f.theoryPrice/1000)+'K').padEnd(10),
      f.ratio.toFixed(3).padEnd(8),
      f.pir ? f.pir.toFixed(1).padEnd(8) : 'N/A'.padEnd(8),
      String(f.uvScore).padEnd(6), f.label
    );
  });

  // Top/Bottom 10
  const sorted = [...allResults].sort((a,b) => b.uvScore - a.uvScore);
  console.log(`\n=== Top 10 Undervalued ===`);
  sorted.slice(0,10).forEach(r => console.log(
    r.suburb.padEnd(22), String(Math.round(r.blendedPrice/1000)+'K').padEnd(10),
    String(Math.round(r.theoryPrice/1000)+'K').padEnd(10), r.ratio.toFixed(3).padEnd(8),
    r.pir ? r.pir.toFixed(1).padEnd(8) : 'N/A'.padEnd(8), String(r.uvScore).padEnd(6), r.label
  ));
  
  console.log(`\n=== Bottom 10 Overvalued ===`);
  sorted.slice(-10).reverse().forEach(r => console.log(
    r.suburb.padEnd(22), String(Math.round(r.blendedPrice/1000)+'K').padEnd(10),
    String(Math.round(r.theoryPrice/1000)+'K').padEnd(10), r.ratio.toFixed(3).padEnd(8),
    r.pir ? r.pir.toFixed(1).padEnd(8) : 'N/A'.padEnd(8), String(r.uvScore).padEnd(6), r.label
  ));

  const avgUV = allResults.reduce((s,r) => s+r.uvScore, 0) / allResults.length;
  console.log(`\n=== Summary ===`);
  console.log(`R² = ${r2.toFixed(4)}`);
  console.log(`Suburbs: ${allResults.length}`);
  console.log(`Avg UV: ${avgUV.toFixed(1)}`);
  
  const green = allResults.filter(r => r.uvScore >= 60).length;
  const yellow = allResults.filter(r => r.uvScore >= 40 && r.uvScore < 60).length;
  const red = allResults.filter(r => r.uvScore < 40).length;
  console.log(`Distribution: 🟢${green} 🟡${yellow} 🔴${red}`);
}

run().catch(e => { console.error(e); process.exit(1); });
