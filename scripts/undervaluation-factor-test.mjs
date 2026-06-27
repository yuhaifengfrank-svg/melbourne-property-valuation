#!/usr/bin/env node
/**
 * Step 1: Test each factor's individual R² vs log(price)
 * Step 2: Build weighted multi-factor scoring
 * Step 3: Compare total R² against OLS baseline (0.56)
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { readFileSync } from 'fs';

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
    for(let r=0;r<p;r++){if(r===c)continue;const f=aug[r][c];for(let j=c;j<=p;j++)aug[r][j]-=f*aug[c][j];}
  }
  const beta=aug.map(r=>r[p]);
  const meanY=y.reduce((a,b)=>a+b,0)/n;
  const ssRes=y.reduce((s,yi,i)=>(s+(yi-beta.reduce((sum,bj,j)=>sum+bj*X[i][j],0))**2),0);
  const ssTot=y.reduce((s,yi)=>s+(yi-meanY)**2,0);
  return {beta, r2:1-ssRes/ssTot, adjR2:1-(ssRes/(n-p))/(ssTot/(n-1)), n, p};
}

async function run() {
  const rows = await sql.query(`
    WITH suburb_cbd_dist AS (
      SELECT LOWER(cs.suburb) AS suburb_key,
        6371*2*ASIN(SQRT(POWER(SIN(RADIANS((-37.8136-AVG(cs.lat))/2)),2)+COS(RADIANS(-37.8136))*COS(RADIANS(AVG(cs.lat)))*POWER(SIN(RADIANS((144.9631-AVG(cs.lon))/2)),2))) AS cbd_distance_km
      FROM comparable_sales cs WHERE cs.lat IS NOT NULL AND cs.lat!=0 AND cs.lon IS NOT NULL AND cs.lon!=0
      GROUP BY LOWER(cs.suburb)
    ),
    first_sa2 AS (
      SELECT DISTINCT ON (LOWER(suburb)) LOWER(suburb) AS suburb_key, sa2_code
      FROM school_locations WHERE state='VIC' AND sa2_code IS NOT NULL
      ORDER BY LOWER(suburb), calendar_year DESC NULLS LAST
    )
    SELECT
      sm.suburb, sm.median_house_price, sm.median_unit_price, sm.median_combined_price,
      sm.school_score, sm.dwelling_separate_house, sm.dwelling_occupancy_rate,
      sm.vacancy_rate_adjusted, sm.median_rent,
      (c.g02->>'Median_tot_hhd_inc_weekly')::int AS hhd_income_weekly, sd.cbd_distance_km
    FROM suburb_metrics sm
    LEFT JOIN first_sa2 s2 ON LOWER(sm.suburb)=s2.suburb_key
    LEFT JOIN census_sa2_data c ON c.sa2_code::text=s2.sa2_code
    LEFT JOIN suburb_cbd_dist sd ON LOWER(sm.suburb)=sd.suburb_key
    WHERE sm.state='VIC' AND sm.median_house_price>0
  `);

  const seen=new Set();
  const deduped=rows.filter(r=>{const k=r.suburb.toLowerCase();if(seen.has(k))return false;seen.add(k);return true;});

  const usable = deduped.map(r => {
    const hp=Number(r.median_house_price)||0, up=Number(r.median_unit_price)||0, cp=Number(r.median_combined_price)||0;
    const sep=Number(r.dwelling_separate_house)/100;
    let blend=cp>0?cp:(up>0?hp*sep+up*(1-sep):hp);
    const inc=r.hhd_income_weekly?Number(r.hhd_income_weekly)*52:null;
    const occ=Number(r.dwelling_occupancy_rate)||null;
    const vac=Number(r.vacancy_rate_adjusted)||null;
    const rent=Number(r.median_rent)||null;
    return {
      suburb:r.suburb, logPrice:Math.log(blend),
      school:r.school_score, logIncome:inc?Math.log(inc):null, occ,
      cbdDist:r.cbd_distance_km, vac, logRent:rent?Math.log(rent):null
    };
  }).filter(r => r.logPrice && r.school && r.logIncome && r.occ && r.cbdDist!=null && r.vac!=null && r.logRent);
  
  console.log(`Usable: ${usable.length}\n`);
  const y=usable.map(r=>r.logPrice);
  
  // 1. Individual factor R²
  console.log('=== Single Factor R² ===');
  const factors = [
    ['school_score', r=>[1,r.school]],
    ['log(income)', r=>[1,r.logIncome]],
    ['occ_rate(%)', r=>[1,r.occ]],
    ['cbd_distance_km', r=>[1,r.cbdDist]],
    ['vacancy_rate', r=>[1,r.vac]],
    ['log(rent)', r=>[1,r.logRent]]
  ];
  
  const r2s = {};
  factors.forEach(([name, fn]) => {
    const X = usable.map(fn);
    const res = ols(X, y);
    r2s[name] = res.r2;
    console.log(`  ${name.padEnd(20)} R² = ${res.r2.toFixed(4)}`);
  });

  // 2. Normalize each factor to 0-100 score, then OLS on scores
  console.log('\n=== Building Normalized Scores ===');
  
  // For each factor, compute percentile-based 0-100 score
  function computeScores(arr) {
    const sorted = [...arr].sort((a,b)=>a-b);
    return arr.map(v => {
      // Find percentile: (rank+1)/(n+1) * 100
      let rank=0; for(let i=0;i<sorted.length;i++){if(sorted[i]<=v)rank=i+1;else break;}
      return (rank/(sorted.length+1))*100;
    });
  }

  // For factors like cbd (further=cheaper) and vacancy (higher=cheaper), invert scoring
  function computeScoresInverted(arr) {
    return computeScores(arr.map(v => -v));
  }

  const schoolScores = computeScores(usable.map(r=>r.school));
  const incomeScores = computeScores(usable.map(r=>r.logIncome));
  const occScores = computeScores(usable.map(r=>r.occ));
  const cbdScores = computeScoresInverted(usable.map(r=>r.cbdDist)); // far from CBD = lower score
  const vacScores = computeScoresInverted(usable.map(r=>r.vac));     // high vacancy = lower score
  const rentScores = computeScores(usable.map(r=>r.logRent));

  // 3. Try different weight combinations, test R² of weighted score against log(price)
  console.log('=== Weight Combinations vs OLS baseline (R²=0.56) ===');
  const weightOpts = [
    {name:'OLS R² weight', school:0.28, income:0.18, occ:0.20, cbd:0.17, vac:0.00, rent:0.17},
    {name:'Equal weight', school:0.25, income:0.25, occ:0.25, cbd:0.25, vac:0.00, rent:0.00},
    {name:'School+Occ+CBD only', school:0.35, income:0, occ:0.35, cbd:0.30, vac:0, rent:0},
    {name:'School+Income+Rent', school:0.25, income:0.25, occ:0, cbd:0, vac:0, rent:0.50},
    {name:'All 6 factors', school:0.20, income:0.15, occ:0.15, cbd:0.15, vac:0.10, rent:0.25},
    {name:'School+Income+Occ+CBD', school:0.30, income:0.20, occ:0.25, cbd:0.25, vac:0, rent:0},
    {name:'School+Occ+CBD+Rent', school:0.25, income:0, occ:0.20, cbd:0.20, vac:0, rent:0.35},
    {name:'School+Income+Rent+CBD', school:0.25, income:0.15, occ:0, cbd:0.20, vac:0, rent:0.40},
  ];

  let best=0, bestConfig='';
  weightOpts.forEach(({name, school, income, occ, cbd, vac, rent}) => {
    const sum = school+income+occ+cbd+vac+rent;
    if (Math.abs(sum-1)>0.01) return;
    const scores = usable.map((r,i) => 
      school*schoolScores[i] + income*incomeScores[i] + occ*occScores[i] + 
      cbd*cbdScores[i] + vac*vacScores[i] + rent*rentScores[i]
    );
    const X = scores.map(s => [1, s]);
    const res = ols(X, y);
    const s = scores.reduce((a,b)=>a+b,0)/scores.length;
    if (res.r2 > best) { best = res.r2; bestConfig = name; }
    console.log(`  ${name.padEnd(28)} R²=${res.r2.toFixed(4)} ${res.r2>=0.56?'✅':''}`);
  });

  // 4. Run the best config with target suburb results
  const cfg = weightOpts.find(w => w.name === bestConfig);
  if (!cfg) return;
  const {school, income, occ, cbd, vac, rent} = cfg;
  const scores = usable.map((r,i) => 
    school*schoolScores[i] + income*incomeScores[i] + occ*occScores[i] + 
    cbd*cbdScores[i] + vac*vacScores[i] + rent*rentScores[i]
  );
  
  // OLS on composite score -> assess ability to predict log(price)
  const Xbest = scores.map(s => [1, s]);
  const resBest = ols(Xbest, y);
  const predPrices = scores.map(s => {
    const pred = resBest.beta[0] + resBest.beta[1] * s;
    return Math.exp(pred);
  });

  console.log(`\n=== Best: ${bestConfig} (R²=${best.toFixed(4)}) ===`);
  console.log('Suburb'.padEnd(22),'Actual'.padEnd(10),'Theory'.padEnd(10),'Score'.padEnd(8),'UV'.padEnd(6),'Label');

  const targets = ['doncaster','point cook','sunshine','glen waverley','scoresby',
    'docklands','southbank','brighton','toorak','tarneit','box hill','clayton',
    'werribee','frankston','preston','mickleham','manor lakes','diggers rest','maribyrnong','wyndham vale'];

  // Calculate UV from composite score: higher score = higher theory price
  usable.forEach((r,i) => {
    const blended = Math.exp(r.logPrice);
    const theory = predPrices[i];
    const ratio = blended / theory;
    const score = scores[i];
    r.blendedPrice = blended;
    r.theoryPrice = theory;
    r.ratio = ratio;
    r.compositeScore = score;
  });

  targets.forEach(t => {
    const f = usable.find(r => r.suburb.toLowerCase() === t);
    if (!f) return;
    // UV Score (0-100) from ratio, but we can also use composite score directly
    const ratioUV = Math.round(Math.max(0, Math.min(100, 50*(1 - f.ratio) + 50)));
    const priceScore = f.ratio < 1.0 ? Math.min(100, 50+(1-f.ratio)*100) : Math.max(0, 50-(f.ratio-1)*100);
    const label = priceScore>=80?'明显偏低 🟢':priceScore>=60?'略微偏低 🟢':priceScore>=40?'接近合理 🟡':priceScore>=20?'略微偏高 🟠':'明显偏高 🔴';
    console.log(
      f.suburb.padEnd(22), String(Math.round(f.blendedPrice/1000)+'K').padEnd(10),
      String(Math.round(f.theoryPrice/1000)+'K').padEnd(10),
      f.compositeScore.toFixed(0).padEnd(8), String(Math.round(priceScore)).padEnd(6), label
    );
  });
}

run().catch(e=>{console.error(e);process.exit(1)});
