#!/usr/bin/env node
/**
 * Step 1-3: VIF + Correlation Matrix + Variable Classification
 * 
 * Factors:
 *   Income — log(hhd_income_weekly)
 *   School — school_score
 *   Population — log(pop_2025)
 *   Employment — log(unemp_rate)
 *   CBD — cbd_distance_km
 *   Planning — residential_zone_pct, growth_zone_pct, high_constraint_pct
 *   Vacancy — vacancy_rate_adjusted
 *   Supply — log(supply_housing_per_capita)
 *
 * Plus optional: infraScore, popGrowth5yr
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { readFileSync } from 'fs';
const fs = require('fs');

const env = readFileSync('/Users/FrankAI/Documents/澳洲房地产评估系统/.env', 'utf8');
const m = env.match(/DATABASE_URL='([^']+)'/);
const { neon } = require('@neondatabase/serverless');
const sql = neon(m[1]);

function ols(X, y) {
  const n = X.length, p = X[0].length;
  function mul(A, B) {
    const m = A.length, n = A[0].length, p = B[0].length, C = Array.from({length:m},()=>Array(p).fill(0));
    for(let i=0;i<m;i++) for(let k=0;k<n;k++) if(A[i][k]!==0) for(let j=0;j<p;j++) C[i][j]+=A[i][k]*B[k][j]; return C;
  }
  function transp(A) { return A[0].map((_,j)=>A.map(r=>r[j])); }
  const Xt=transp(X),XtX=mul(Xt,X),Xty=mul(Xt,y.map(v=>[v])).map(r=>r[0]);
  const aug=XtX.map((row,i)=>[...row,Xty[i]]);
  for(let c=0;c<p;c++){let mr=c;for(let r=c+1;r<p;r++)if(Math.abs(aug[r][c])>Math.abs(aug[mr][c]))mr=r;[aug[c],aug[mr]]=[aug[c],aug[mr]];const piv=aug[c][c];if(Math.abs(piv)<1e-12)continue;for(let j=c;j<=p;j++)aug[c][j]/=piv;for(let r=0;r<p;r++){if(r===c)continue;const f=aug[r][c];for(let j=c;j<=p;j++)aug[r][j]-=f*aug[c][j];}}
  const beta=aug.map(r=>r[p]);
  const my=y.reduce((a,b)=>a+b,0)/n;
  const ssRes=y.reduce((s,yi,i)=>s+(yi-beta.reduce((sum,bj,j)=>sum+bj*X[i][j],0))**2,0);
  const ssTot=y.reduce((s,yi)=>s+(yi-my)**2,0);
  return{beta,r2:1-ssRes/ssTot,adjR2:1-(ssRes/(n-p))/(ssTot/(n-1)),n,p};
}

async function run() {
  // Load planning features
  const csvText = fs.readFileSync('/tmp/suburb_planning_features.csv', 'utf8');
  const lines = csvText.trim().split('\n');
  const planningMap = {};
  for(let i=1; i<lines.length; i++) {
    const vals = lines[i].split(',');
    planningMap[vals[0]] = {
      residential_pct: parseFloat(vals[1]),
      growth_pct: parseFloat(vals[2]),
      high_constraint_pct: parseFloat(vals[9]),
    };
  }

  const rows = await sql.query(`
    WITH sc AS (SELECT LOWER(cs.suburb)k,6371*2*ASIN(SQRT(POWER(SIN(RADIANS((-37.8136-AVG(cs.lat))/2)),2)+COS(RADIANS(-37.8136))*COS(RADIANS(AVG(cs.lat)))*POWER(SIN(RADIANS((144.9631-AVG(cs.lon))/2)),2)))cd FROM comparable_sales cs WHERE cs.lat IS NOT NULL AND cs.lat!=0 AND cs.lon IS NOT NULL AND cs.lon!=0 AND cs.state='VIC' GROUP BY LOWER(cs.suburb)),
    sp AS (SELECT LOWER(sm.suburb)k,e.year_2025 p25 FROM suburb_metrics sm LEFT JOIN suburb_sa2_map mp ON LOWER(mp.suburb)=LOWER(sm.suburb) AND mp.state='VIC' LEFT JOIN abs_erp_sa2 e ON e.sa2_code=mp.sa2_code WHERE sm.state='VIC' AND sm.median_house_price>0),
    su AS (SELECT LOWER(sm.suburb)k,sl.unemployment_rate::numeric ur FROM suburb_metrics sm LEFT JOIN suburb_sa2_map mp ON LOWER(mp.suburb)=LOWER(sm.suburb) AND mp.state='VIC' LEFT JOIN salm_sa2_data sl ON sl.sa2_code=mp.sa2_code WHERE sm.state='VIC' AND sm.median_house_price>0),
    si AS (SELECT LOWER(sm.suburb)k,(c.g02->>'Median_tot_hhd_inc_weekly')::numeric inc FROM suburb_metrics sm LEFT JOIN suburb_sa2_map mp ON LOWER(mp.suburb)=LOWER(sm.suburb) AND mp.state='VIC' LEFT JOIN census_sa2_data c ON c.sa2_code::text=mp.sa2_code WHERE sm.state='VIC' AND sm.median_house_price>0)
    SELECT DISTINCT ON (LOWER(sm.suburb)) LOWER(sm.suburb)sub,sm.median_combined_price cp,sm.median_house_price hp,sm.median_unit_price up,sm.dwelling_separate_house se,sm.school_score ss,sm.vacancy_rate_adjusted vr,sm.supply_housing_per_capita spc,
      sp.p25,si.inc,su.ur,sc.cd
    FROM suburb_metrics sm LEFT JOIN sc ON LOWER(sm.suburb)=sc.k LEFT JOIN sp ON LOWER(sm.suburb)=sp.k LEFT JOIN si ON LOWER(sm.suburb)=si.k LEFT JOIN su ON LOWER(sm.suburb)=su.k
    WHERE sm.state='VIC' AND sm.median_house_price>0
  `);

  const seen=new Set();const dd=rows.filter(r=>{const k=r.sub;if(seen.has(k))return false;seen.add(k);return true;});
  const usable=dd.map(r=>{
    const hp=Number(r.hp)||0,up=Number(r.up)||0,cp=Number(r.cp)||0;const sep=Number(r.se)/100;
    const bl=cp>0?cp:(up>0?hp*sep+up*(1-sep):hp);
    const inc=r.inc?Number(r.inc)*52:null;
    const plan=planningMap[r.sub];
    return{
      sub:r.sub,logPrice:Math.log(bl),
      logIncome:inc>0?Math.log(inc):null,
      school:r.ss!=null?Number(r.ss):null,
      logPop:r.p25>0?Math.log(Number(r.p25)):null,
      logUnemp:r.ur!=null?Math.log(Number(r.ur)):null,
      cbdDist:r.cd!=null?Number(r.cd):null,
      resPct:plan?plan.residential_pct:null,
      growthPct:plan?plan.growth_pct:null,
      highConPct:plan?plan.high_constraint_pct:null,
      vac:Number(r.vr)||null,
      logSupply:r.spc>0?Math.log(Number(r.spc)):null,
    };
  }).filter(r=>r.logPrice&&r.logIncome&&r.school!=null&&r.logPop&&r.logUnemp!=null&&r.cbdDist!=null
    &&r.resPct!=null&&r.growthPct!=null&&r.highConPct!=null&&r.vac!=null);

  console.log(`Usable: ${usable.length}\n`);

  // Define factors
  const varNames = ['logIncome','school','logPop','logUnemp','cbdDist','resPct','growthPct','highConPct','vac','logSupply'];
  // Exclude resPct for now (planning dimension -> use growthPct+highConPct)
  const factorNames = ['logIncome','school','logPop','logUnemp','cbdDist','growthPct','highConPct','vac','logSupply'];
  
  const X = usable.map(r => [1, r.logIncome, r.school, r.logPop, r.logUnemp, r.cbdDist, 
    r.growthPct, r.highConPct, r.vac, r.logSupply||0]);
  const y = usable.map(r => r.logPrice);

  // ========== Step 1: VIF ==========
  console.log('=== Step 1: VIF Analysis ===');
  // VIF = 1/(1-R²_j) for each var regressed on all others
  for(let v=0; v<factorNames.length; v++) {
    // X_j as DV, all other X (with intercept) as predictors
    const yj = usable.map(r => {
      const vals = [r.logIncome, r.school, r.logPop, r.logUnemp, r.cbdDist, r.growthPct, r.highConPct, r.vac, r.logSupply||0];
      return vals[v];
    });
    const Xj = usable.map(r => {
      const vals = [r.logIncome, r.school, r.logPop, r.logUnemp, r.cbdDist, r.growthPct, r.highConPct, r.vac, r.logSupply||0];
      return [1, ...vals.filter((_,vi)=>vi!==v)];
    });
    const res = ols(Xj, yj);
    const vif = res.r2 > 0.999 ? Infinity : 1/(1-res.r2);
    console.log(`  ${factorNames[v].padEnd(16)} R²₋ⱼ=${res.r2.toFixed(4)} VIF=${vif.toFixed(2)}${vif>10?' ⚠️ HIGH':vif>5?' ⚠️ MODERATE':''}`);
  }

  // ========== Step 2: Correlation Matrix ==========
  console.log('\n=== Step 2: Correlation Matrix ===');
  const vals = factorNames.map(f => usable.map(r => {
    const map = {logIncome:r.logIncome, school:r.school, logPop:r.logPop, logUnemp:r.logUnemp, 
      cbdDist:r.cbdDist, growthPct:r.growthPct, highConPct:r.highConPct, vac:r.vac, logSupply:r.logSupply||0};
    return map[f];
  }));
  const n = usable.length;
  
  // Correlation function
  function pearson(a,b) {
    const ma=a.reduce((s,v)=>s+v,0)/n, mb=b.reduce((s,v)=>s+v,0)/n;
    let num=0, da=0, db=0;
    for(let i=0; i<n; i++) { const d1=a[i]-ma, d2=b[i]-mb; num+=d1*d2; da+=d1*d1; db+=d2*d2; }
    return num/Math.sqrt(da*db);
  }

  // Print correlation matrix
  const header = factorNames.map(f => f.substring(0,8)).join('  ');
  console.log(' '.padEnd(12) + header);
  for(let i=0; i<factorNames.length; i++) {
    const row = factorNames[i].padEnd(12);
    const corrs = factorNames.map((_,j) => {
      const r2 = pearson(vals[i], vals[j]);
      return (r2>0?' ':'') + r2.toFixed(3);
    });
    console.log(row + corrs.join('  '));
  }

  // ========== Step 3: Variable Classification ==========
  console.log('\n=== Step 3: Variable Classification ===');
  console.log('Factor'.padEnd(16), 'VIF'.padEnd(8), 'HighCorr(r>0.6)'.padEnd(30), 'Classification');
  
  // Compute VIFs again
  for(let v=0; v<factorNames.length; v++) {
    const yj = usable.map(r => {
      const vals = [r.logIncome, r.school, r.logPop, r.logUnemp, r.cbdDist, r.growthPct, r.highConPct, r.vac, r.logSupply||0];
      return vals[v];
    });
    const Xj = usable.map(r => {
      const vals = [r.logIncome, r.school, r.logPop, r.logUnemp, r.cbdDist, r.growthPct, r.highConPct, r.vac, r.logSupply||0];
      return [1, ...vals.filter((_,vi)=>vi!==v)];
    });
    const res = ols(Xj, yj);
    const vif = res.r2 > 0.999 ? Infinity : 1/(1-res.r2);
    
    // Find high correlations
    const highCorr = [];
    for(let j=0; j<factorNames.length; j++) {
      if(j===v) continue;
      const cr = Math.abs(pearson(vals[v], vals[j]));
      if(cr > 0.5) highCorr.push(`${factorNames[j]}(${cr.toFixed(2)})`);
    }
    
    let classification;
    if(vif > 10) classification = 'High multicollinearity — consider removing or combining';
    else if(vif > 5) classification = 'Moderate multicollinearity — monitor';
    else classification = 'Independent — keep';
    if(highCorr.length > 0) classification += ' (correlated: '+highCorr.join(', ')+')';
    
    console.log(`  ${factorNames[v].padEnd(16)} ${vif.toFixed(2).padEnd(8)} ${(highCorr.length?highCorr.join(', '):'-').padEnd(30)} ${classification}`);
  }

  // ========== Bonus: Full OLS with clean labels ==========
  console.log('\n=== Bonus: Full OLS Results ===');
  const olsRes = ols(X, y);
  const allVars = ['Intercept', ...factorNames];
  console.log(`R²=${olsRes.r2.toFixed(4)}, AdjR²=${olsRes.adjR2.toFixed(4)}, n=${olsRes.n}, p=${olsRes.p}`);
  olsRes.beta.forEach((b,i) => {
    const dir = b>0?'+':'-';
    const expected = (i===4||i===6||i===8||i===9)?'-':'+';  // cbdDist(-), highCon(-), vac(-), logSupply(-)
    const expDir = expected === '-' ? '-' : '+';
    const ok = dir === expDir;
    console.log(`  ${allVars[i].padEnd(16)} ${b.toFixed(6)} (${dir})${ok?' ✅':' ❌'}`);
  });
}

run().catch(e=>{console.error(e);process.exit(1)});
