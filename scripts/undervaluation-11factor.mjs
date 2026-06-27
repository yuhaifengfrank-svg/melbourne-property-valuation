#!/usr/bin/env node
/**
 * 11-Factor Undervaluation Regression Model
 * 
 * Factors:
 *   1. Income      — census_sa2_data.g02.Median_tot_hhd_inc_weekly → log()
 *   2. Population  — abs_erp_sa2.year_2025 → log() 
 *   3. School      — suburb_metrics.school_score
 *   4. Supply      — suburb_metrics.supply_housing_per_capita
 *   5. Infrastructure — suburb_metrics.infrastructure_score
 *   6. Employment  — salm_sa2_data.unemployment_rate (latest)
 *   7. Planning    — planning_cache aggregate (residential_pct, growth_pct, high_constraint_pct)
 *   8. Vacancy     — suburb_metrics.vacancy_rate_adjusted
 *   9. Interest Rate — macro_indicators (cash_rate: 4.35, same for all)
 *   10. Migration  — abs_erp_sa2 → population_growth_5yr pct
 *   11. CBD Distance — computed from comparable_sales coords
 *
 * Model: log(blendedPrice) ~ β0 + β1*log(income) + β2*log(pop) + β3*school 
 *       + β4*log(supply_per_cap) + β5*infra + β6*log(unemp) 
 *       + β7*residential_pct + β8*growth_pct + β9*high_constraint_pct
 *       + β10*vacancy + β11*cash_rate + β12*pop_growth_5yr + β13*cbd_dist
 *
 * Run: node scripts/undervaluation-11factor.mjs
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { readFileSync } from 'fs';
import { readFileSync as fsRead } from 'fs';

const env = readFileSync('/Users/FrankAI/Documents/澳洲房地产评估系统/.env', 'utf8');
const m = env.match(/DATABASE_URL='([^']+)'/);
const { neon } = require('@neondatabase/serverless');
const sql = neon(m[1]);

function ols(X, y) {
  const n = X.length, p = X[0].length;
  function mul(A, B) {
    const m = A.length, n = A[0].length, p = B[0].length, C = Array.from({length:m},()=>Array(p).fill(0));
    for(let i=0;i<m;i++) for(let k=0;k<n;k++) if(A[i][k]!==0) for(let j=0;j<p;j++) C[i][j]+=A[i][k]*B[k][j];
    return C;
  }
  function transp(A) { return A[0].map((_,j)=>A.map(r=>r[j])); }
  const Xt=transp(X), XtX=mul(Xt,X), Xty=mul(Xt,y.map(v=>[v])).map(r=>r[0]);
  const aug=XtX.map((row,i)=>[...row,Xty[i]]);
  for(let c=0;c<p;c++) {
    let mr=c; for(let r=c+1;r<p;r++) if(Math.abs(aug[r][c])>Math.abs(aug[mr][c])) mr=r;
    [aug[c],aug[mr]]=[aug[c],aug[mr]]; const piv=aug[c][c];
    if(Math.abs(piv)<1e-12) continue;
    for(let j=c;j<=p;j++) aug[c][j]/=piv;
    for(let r=0;r<p;r++) { if(r===c) continue; const f=aug[r][c]; for(let j=c;j<=p;j++) aug[r][j]-=f*aug[c][j]; }
  }
  const beta=aug.map(r=>r[p]);
  const meanY=y.reduce((a,b)=>a+b,0)/n;
  const ssRes=y.reduce((s,yi,i)=>s+(yi-beta.reduce((sum,bj,j)=>sum+bj*X[i][j],0))**2,0);
  const ssTot=y.reduce((s,yi)=>s+(yi-meanY)**2,0);
  return {beta, r2:1-ssRes/ssTot, adjR2:1-(ssRes/(n-p))/(ssTot/(n-1)), n, p};
}

// Ridge regression (L2)
function ridge(X, y, lambda) {
  const n = X.length, p = X[0].length;
  function mul(A, B) {
    const m = A.length, n = A[0].length, p = B[0].length, C = Array.from({length:m},()=>Array(p).fill(0));
    for(let i=0;i<m;i++) for(let k=0;k<n;k++) if(A[i][k]!==0) for(let j=0;j<p;j++) C[i][j]+=A[i][k]*B[k][j];
    return C;
  }
  function transp(A) { return A[0].map((_,j)=>A.map(r=>r[j])); }
  const Xt=transp(X), Xty=mul(Xt,y.map(v=>[v])).map(r=>r[0]);
  // XtX + lambda*I
  const XtX = mul(Xt, X);
  for(let i=0;i<p;i++) XtX[i][i] += lambda;
  const aug=XtX.map((row,i)=>[...row,Xty[i]]);
  for(let c=0;c<p;c++) {
    let mr=c; for(let r=c+1;r<p;r++) if(Math.abs(aug[r][c])>Math.abs(aug[mr][c])) mr=r;
    [aug[c],aug[mr]]=[aug[c],aug[mr]]; const piv=aug[c][c];
    if(Math.abs(piv)<1e-12) continue;
    for(let j=c;j<=p;j++) aug[c][j]/=piv;
    for(let r=0;r<p;r++) { if(r===c) continue; const f=aug[r][c]; for(let j=c;j<=p;j++) aug[r][j]-=f*aug[c][j]; }
  }
  const beta=aug.map(r=>r[p]);
  const meanY=y.reduce((a,b)=>a+b,0)/n;
  const ssRes=y.reduce((s,yi,i)=>s+(yi-beta.reduce((sum,bj,j)=>sum+bj*X[i][j],0))**2,0);
  const ssTot=y.reduce((s,yi)=>s+(yi-meanY)**2,0);
  return {beta, r2:1-ssRes/ssTot, adjR2:1-(ssRes/(n-p))/(ssTot/(n-1)), n, p};
}

async function run() {
  // Load planning features from CSV
  const csvText = readFileSync('/tmp/suburb_planning_features.csv', 'utf8');
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',');
  const planningMap = {};
  for(let i=1; i<lines.length; i++) {
    const vals = lines[i].split(',');
    const sub = vals[0];
    planningMap[sub] = {
      residential_pct: parseFloat(vals[1]),
      growth_pct: parseFloat(vals[2]),
      industrial_pct: parseFloat(vals[3]),
      commercial_pct: parseFloat(vals[4]),
      mixed_use_pct: parseFloat(vals[5]),
      public_pct: parseFloat(vals[6]),
      rural_pct: parseFloat(vals[7]),
      high_constraint_pct: parseFloat(vals[9]),
      total_pts: parseInt(vals[10])
    };
  }

  // Build 11-factor data
  const rows = await sql.query(`
    WITH sub_coords AS (
      SELECT 
        LOWER(cs.suburb) as sub_name,
        AVG(cs.lat) as avg_lat,
        AVG(cs.lon) as avg_lon,
        6371*2*ASIN(SQRT(POWER(SIN(RADIANS((-37.8136-AVG(cs.lat))/2)),2)+COS(RADIANS(-37.8136))*COS(RADIANS(AVG(cs.lat)))*POWER(SIN(RADIANS((144.9631-AVG(cs.lon))/2)),2))) as cbd_distance_km
      FROM comparable_sales cs
      WHERE cs.lat IS NOT NULL AND cs.lat != 0 AND cs.lon IS NOT NULL AND cs.lon != 0 AND cs.state = 'VIC'
      GROUP BY LOWER(cs.suburb)
    ),
    sub_pop AS (
      SELECT LOWER(sm.suburb) as sub_name, 
        e.year_2025 as pop_2025,
        e.year_2020 as pop_2020
      FROM suburb_metrics sm
      LEFT JOIN suburb_sa2_map mp ON LOWER(mp.suburb)=LOWER(sm.suburb) AND mp.state='VIC'
      LEFT JOIN abs_erp_sa2 e ON e.sa2_code=mp.sa2_code
      WHERE sm.state='VIC' AND sm.median_house_price>0
    ),
    sub_unemp AS (
      SELECT LOWER(sm.suburb) as sub_name,
        sl.unemployment_rate::numeric as unemp_rate
      FROM suburb_metrics sm
      LEFT JOIN suburb_sa2_map mp ON LOWER(mp.suburb)=LOWER(sm.suburb) AND mp.state='VIC'
      LEFT JOIN salm_sa2_data sl ON sl.sa2_code=mp.sa2_code
      WHERE sm.state='VIC' AND sm.median_house_price>0
    ),
    sub_income AS (
      SELECT LOWER(sm.suburb) as sub_name,
        (c.g02->>'Median_tot_hhd_inc_weekly')::numeric as hhd_income_weekly
      FROM suburb_metrics sm
      LEFT JOIN suburb_sa2_map mp ON LOWER(mp.suburb)=LOWER(sm.suburb) AND mp.state='VIC'
      LEFT JOIN census_sa2_data c ON c.sa2_code::text=mp.sa2_code
      WHERE sm.state='VIC' AND sm.median_house_price>0
    )
    SELECT DISTINCT ON (LOWER(sm.suburb))
      LOWER(sm.suburb) as suburb,
      sm.median_house_price, sm.median_unit_price, sm.median_combined_price,
      sm.dwelling_separate_house, sm.dwelling_occupancy_rate,
      sm.school_score, sm.infrastructure_score,
      sm.supply_housing_per_capita, sm.vacancy_rate_adjusted,
      pp.pop_2025, pp.pop_2020,
      ic.hhd_income_weekly,
      up.unemp_rate,
      sc.cbd_distance_km
    FROM suburb_metrics sm
    LEFT JOIN sub_pop pp ON LOWER(sm.suburb)=pp.sub_name
    LEFT JOIN sub_income ic ON LOWER(sm.suburb)=ic.sub_name
    LEFT JOIN sub_unemp up ON LOWER(sm.suburb)=up.sub_name
    LEFT JOIN sub_coords sc ON LOWER(sm.suburb)=sc.sub_name
    WHERE sm.state='VIC' AND sm.median_house_price>0
  `);

  const seen = new Set();
  const deduped = rows.filter(r => { const k=r.suburb; if(seen.has(k)) return false; seen.add(k); return true; });
  console.log(`Raw rows: ${rows.length}, deduped: ${deduped.length}\n`);

  // Check coverage per factor
  const covers = {};
  const fields = ['suburb','median_house_price','median_unit_price','median_combined_price',
    'dwelling_separate_house','school_score','infrastructure_score',
    'supply_housing_per_capita','vacancy_rate_adjusted',
    'pop_2025','pop_2020','hhd_income_weekly','unemp_rate','cbd_distance_km'];
  
  for (const f of fields) {
    const filled = deduped.filter(r => r[f] != null).length;
    covers[f] = `${filled}/${deduped.length}`;
  }
  console.log('Coverage:', JSON.stringify(covers, null, 2));

  // Build usable dataset
  const usable = deduped.map(r => {
    const hp = Number(r.median_house_price)||0, up = Number(r.median_unit_price)||0, cp = Number(r.median_combined_price)||0;
    const sep = Number(r.dwelling_separate_house)/100;
    const blend = cp > 0 ? cp : (up > 0 ? hp*sep+up*(1-sep) : hp);
    const inc = r.hhd_income_weekly ? Number(r.hhd_income_weekly)*52 : null;
    const pop25 = r.pop_2025 ? Number(r.pop_2025) : null;
    const pop20 = r.pop_2020 ? Number(r.pop_2020) : null;
    const popGrowth5yr = (pop25 && pop20) ? ((pop25-pop20)/pop20)*100 : null;
    const plan = planningMap[r.suburb] || null;
    
    return {
      suburb: r.suburb,
      logPrice: Math.log(blend),
      blendedPrice: blend,
      logIncome: inc > 0 ? Math.log(inc) : null,
      logPop: pop25 > 0 ? Math.log(pop25) : null,
      school: r.school_score != null ? Number(r.school_score) : null,
      logSupplyPCap: r.supply_housing_per_capita > 0 ? Math.log(Number(r.supply_housing_per_capita)) : null,
      infraScore: r.infrastructure_score != null ? Number(r.infrastructure_score) : null,
      unempRate: r.unemp_rate != null ? Number(r.unemp_rate) : null,
      logUnemp: r.unemp_rate != null ? Math.log(Number(r.unemp_rate)) : null,
      resPct: plan ? plan.residential_pct : null,
      growthPct: plan ? plan.growth_pct : null,
      highConPct: plan ? plan.high_constraint_pct : null,
      vacancy: r.vacancy_rate_adjusted != null ? Number(r.vacancy_rate_adjusted) : null,
      cashRate: 4.35,  // RBA latest — constant for all suburbs
      popGrowth5yr: popGrowth5yr,
      cbdDist: r.cbd_distance_km != null ? Number(r.cbd_distance_km) : null,
      // for PIR calc
      income: inc,
    };
  }).filter(r => {
    // All 11 (13 actually with breakdowns) must be present
    const base = r.logPrice && r.logIncome && r.logPop && r.school != null && r.vacancy != null && r.cbdDist != null;
    const extras = r.infraScore != null && r.logUnemp != null && r.resPct != null && r.growthPct != null && r.popGrowth5yr != null;
    return base && extras;
  });

  console.log(`\nUsable for regression: ${usable.length} suburbs\n`);

  // Build X matrix — 12 features (intercept + 11 factors, cash_rate is constant so omitted)
  const varNames = ['Intercept','logIncome','logPop','school','logSupplyPCap','infraScore','logUnemp',
    'resPct','growthPct','highConPct','vacancy','popGrowth5yr','cbdDist'];

  const X = usable.map(r => {
    // logSupplyPCap can be null for some — use 0 (mean impute)
    const supply = r.logSupplyPCap != null ? r.logSupplyPCap : 0;
    const hiCon = r.highConPct != null ? r.highConPct : 0;
    return [1, r.logIncome, r.logPop, r.school, supply, r.infraScore, r.logUnemp,
      r.resPct, r.growthPct, hiCon, r.vacancy, r.popGrowth5yr, r.cbdDist];
  });
  const y = usable.map(r => r.logPrice);

  // Standardize X for Ridge (scale to 0 mean, unit variance — except intercept)
  const n = usable.length;
  const p = varNames.length;
  const means = Array(p-1).fill(0);
  const stds = Array(p-1).fill(0);
  for(let j=1; j<p; j++) {
    for(let i=0; i<n; i++) means[j-1] += X[i][j];
    means[j-1] /= n;
  }
  for(let j=1; j<p; j++) {
    for(let i=0; i<n; i++) stds[j-1] += (X[i][j] - means[j-1])**2;
    stds[j-1] = Math.sqrt(stds[j-1]/n);
    if(stds[j-1] < 1e-10) stds[j-1] = 1;
    for(let i=0; i<n; i++) X[i][j] = (X[i][j] - means[j-1]) / stds[j-1];
  }

  // OLS
  console.log('=== OLS ===');
  const olsRes = ols(X, y);
  console.log(`R² = ${olsRes.r2.toFixed(4)}, Adj R² = ${olsRes.adjR2.toFixed(4)}, n=${olsRes.n}, p=${olsRes.p}`);
  console.log('Coefficients (standardized):');
  olsRes.beta.forEach((b, i) => {
    const dir = b>0 ? '+' : '-';
    const expected = ((i===6||i===9||i===10) ? '-' : '+'); // logUnemp-, highCon-, vacancy- expected
    const ok = (dir === expected);
    console.log(`  ${varNames[i].padEnd(16)} ${b.toFixed(6)} (${dir})${ok ? ' ✅' : ' ❌'}`);
  });

  // Ridge (try λ=0.1, 1, 10)
  console.log('\n=== Ridge Regression ===');
  for (const lambda of [0.1, 0.5, 1, 5, 10]) {
    const rr = ridge(X, y, lambda);
    const dirOk = varNames.map((n,i) => {
      if(i===0) return true; // intercept
      const expNeg = (i===6 || i===9 || i===10); // unemp, highCon, vacancy
      const expPos = !expNeg;
      return expNeg ? rr.beta[i]<0 : rr.beta[i]>0;
    });
    const allOK = dirOk.every(Boolean);
    console.log(`${lambda.toString().padEnd(6)} R²=${rr.r2.toFixed(4)} AdjR²=${rr.adjR2.toFixed(4)} AllOK=${allOK} Beta: ${rr.beta.map((b,i)=>varNames[i]+'='+b.toFixed(4)).join(' ')}`);
  }

  // UV Scoring with best model
  const bestLambda = 5;  // adjust after inspection
  const rr = ridge(X, y, bestLambda);
  
  console.log(`\n=== UV Scoring (λ=${bestLambda}, R²=${rr.r2.toFixed(4)}) ===`);
  
  // Calculate theory prices
  usable.forEach((r, i) => {
    const pred = rr.beta.reduce((s, bj, j) => s + bj * X[i][j], 0);
    r.theoryPrice = Math.exp(pred);
    r.ratio = r.blendedPrice / r.theoryPrice;
    r.pir = r.income > 0 ? r.blendedPrice / r.income : 15;
  });

  const targets = ['doncaster','point cook','sunshine','glen waverley','scoresby',
    'docklands','southbank','brighton','toorak','tarneit','box hill','clayton',
    'werribee','frankston','preston','mickleham','manor lakes','diggers rest','maribyrnong','wyndham vale'];

  console.log('Suburb'.padEnd(22),'Actual'.padEnd(10),'Theory'.padEnd(10),'Ratio'.padEnd(8),'PIR'.padEnd(8),'UV'.padEnd(6),'Label');
  targets.forEach(t => {
    const f = usable.find(r => r.suburb === t);
    if (!f) return;
    const priceScore = f.ratio < 1.0 ? Math.min(100,50+(1-f.ratio)*100) : Math.max(0,50-(f.ratio-1)*100);
    const pirScore = Math.max(0, Math.min(100, (15-(f.pir||15))/10*100));
    const uv = Math.round(0.6*priceScore + 0.4*pirScore);
    const label = uv>=80?'明显偏低 🟢':uv>=60?'略微偏低 🟢':uv>=40?'接近合理 🟡':uv>=20?'略微偏高 🟠':'明显偏高 🔴';
    console.log(f.suburb.padEnd(22), String(Math.round(f.blendedPrice/1000)+'K').padEnd(10),
      String(Math.round(f.theoryPrice/1000)+'K').padEnd(10), f.ratio.toFixed(3).padEnd(8),
      f.pir ? f.pir.toFixed(1).padEnd(8) : 'N/A'.padEnd(8), String(uv).padEnd(6), label);
  });

  // Distribution
  const allScores = usable.map((r,i) => {
    const ps = r.ratio<1 ? Math.min(100,50+(1-r.ratio)*100) : Math.max(0,50-(r.ratio-1)*100);
    const pirS = Math.max(0,Math.min(100,(15-(r.pir||15))/10*100));
    return Math.round(0.6*ps+0.4*pirS);
  });
  const green = allScores.filter(s=>s>=60).length;
  const yellow = allScores.filter(s=>s>=40&&s<60).length;
  const red = allScores.filter(s=>s<40).length;
  console.log(`\nDistribution: 🟢${green} 🟡${yellow} 🔴${red}`);
  console.log(`Avg UV: ${(allScores.reduce((a,b)=>a+b,0)/allScores.length).toFixed(1)}`);
}

run().catch(e => { console.error(e); process.exit(1); });
