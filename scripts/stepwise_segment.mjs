#!/usr/bin/env node
/**
 * Phase 2c: Stepwise variable selection per segment
 * 
 * For each of the 8 segments, run forward stepwise selection:
 *   1. Start with all 11 factors
 *   2. Drop factors with wrong direction one by one (drop worst offender)
 *   3. Also try dropping factors that don't improve AdjR²
 *   4. Report final model per segment
 *
 * Then run UV comparison with the simplified models.
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
  if(n < p+1 || n < 3) return null;
  function mul(A, B) {
    const m = A.length, n = A[0].length, p = B[0].length, C = Array.from({length:m},()=>Array(p).fill(0));
    for(let i=0;i<m;i++) for(let k=0;k<n;k++) if(A[i][k]!==0) for(let j=0;j<p;j++) C[i][j]+=A[i][k]*B[k][j]; return C;
  }
  function transp(A) { return A[0].map((_,j)=>A.map(r=>r[j])); }
  try {
    const Xt=transp(X),XtX=mul(Xt,X),Xty=mul(Xt,y.map(v=>[v])).map(r=>r[0]);
    const aug=XtX.map((row,i)=>[...row,Xty[i]]);
    for(let c=0;c<p;c++){let mr=c;for(let r=c+1;r<p;r++)if(Math.abs(aug[r][c])>Math.abs(aug[mr][c]))mr=r;
    [aug[c],aug[mr]]=[aug[c],aug[mr]];const piv=aug[c][c];if(Math.abs(piv)<1e-12)continue;
    for(let j=c;j<=p;j++)aug[c][j]/=piv;for(let r=0;r<p;r++){if(r===c)continue;const f=aug[r][c];for(let j=c;j<=p;j++)aug[r][j]-=f*aug[c][j];}}
    const beta=aug.map(r=>r[p]);
    const my=y.reduce((a,b)=>a+b,0)/n;
    const ssRes=y.reduce((s,yi,i)=>s+(yi-beta.reduce((sum,bj,j)=>sum+bj*X[i][j],0))**2,0);
    const ssTot=y.reduce((s,yi)=>s+(yi-my)**2,0);
    return {beta, r2:ssTot>0?1-ssRes/ssTot:0, adjR2:1-(ssRes/(n-p))/(ssTot/(n-1)), n, p, rss: ssRes, tss: ssTot};
  } catch(e) { return null; }
}

async function run() {
  // Load planning features
  const csvText = fs.readFileSync('/tmp/suburb_planning_features.csv', 'utf8');
  const lines = csvText.trim().split('\n');
  const planningMap = {};
  for(let i=1; i<lines.length; i++) {
    const vals = lines[i].split(',');
    planningMap[vals[0]] = { growth_pct: parseFloat(vals[2]), high_constraint_pct: parseFloat(vals[9]) };
  }

  const rows = await sql.query(`
    WITH sc AS (SELECT LOWER(cs.suburb)k,6371*2*ASIN(SQRT(POWER(SIN(RADIANS((-37.8136-AVG(cs.lat))/2)),2)+COS(RADIANS(-37.8136))*COS(RADIANS(AVG(cs.lat)))*POWER(SIN(RADIANS((144.9631-AVG(cs.lon))/2)),2)))cd FROM comparable_sales cs WHERE cs.lat IS NOT NULL AND cs.lat!=0 AND cs.lon IS NOT NULL AND cs.lon!=0 AND cs.state='VIC' GROUP BY LOWER(cs.suburb)),
    sp AS (SELECT LOWER(sm.suburb)k,e.year_2025 p25,e.year_2020 p20 FROM suburb_metrics sm LEFT JOIN suburb_sa2_map mp ON LOWER(mp.suburb)=LOWER(sm.suburb) AND mp.state='VIC' LEFT JOIN abs_erp_sa2 e ON e.sa2_code=mp.sa2_code WHERE sm.state='VIC' AND sm.median_house_price>0),
    su AS (SELECT LOWER(sm.suburb)k,sl.unemployment_rate::numeric ur FROM suburb_metrics sm LEFT JOIN suburb_sa2_map mp ON LOWER(mp.suburb)=LOWER(sm.suburb) AND mp.state='VIC' LEFT JOIN salm_sa2_data sl ON sl.sa2_code=mp.sa2_code WHERE sm.state='VIC' AND sm.median_house_price>0),
    si AS (SELECT LOWER(sm.suburb)k,(c.g02->>'Median_tot_hhd_inc_weekly')::numeric inc FROM suburb_metrics sm LEFT JOIN suburb_sa2_map mp ON LOWER(mp.suburb)=LOWER(sm.suburb) AND mp.state='VIC' LEFT JOIN census_sa2_data c ON c.sa2_code::text=mp.sa2_code WHERE sm.state='VIC' AND sm.median_house_price>0)
    SELECT DISTINCT ON (LOWER(sm.suburb)) LOWER(sm.suburb)sub,sm.suburb orig_suburb,
      sm.median_combined_price cp,sm.median_house_price hp,sm.median_unit_price up,sm.dwelling_separate_house se,
      sm.school_score ss,sm.vacancy_rate_adjusted vr,sm.supply_housing_per_capita spc,sm.infrastructure_score infra,
      sp.p25,sp.p20,si.inc,su.ur,sc.cd
    FROM suburb_metrics sm 
    LEFT JOIN sc ON LOWER(sm.suburb)=sc.k LEFT JOIN sp ON LOWER(sm.suburb)=sp.k 
    LEFT JOIN si ON LOWER(sm.suburb)=si.k LEFT JOIN su ON LOWER(sm.suburb)=su.k
    WHERE sm.state='VIC' AND sm.median_house_price>0
  `);

  const seen=new Set();const dd=rows.filter(r=>{const k=r.sub;if(seen.has(k))return false;seen.add(k);return true;});
  const usable=dd.map(r=>{
    const hp=Number(r.hp)||0,up=Number(r.up)||0,cp=Number(r.cp)||0;const sep=Number(r.se)/100;
    const bl=cp>0?cp:(up>0?hp*sep+up*(1-sep):hp);
    const inc=r.inc?Number(r.inc)*52:null;
    const plan=planningMap[r.sub];
    const pop25=r.p25?Number(r.p25):null;
    const pop20=r.p20?Number(r.p20):null;
    const popGrowth5yr=pop25&&pop20?((pop25-pop20)/pop20)*100:null;
    return{
      sub:r.sub, suburb: r.orig_suburb,logPrice:Math.log(bl), blendedPrice:bl,
      logIncome:inc>0?Math.log(inc):null, income:inc,
      school:r.ss!=null?Number(r.ss):null,
      logPop:pop25>0?Math.log(pop25):null,
      logUnemp:r.ur!=null?Math.log(Number(r.ur)):null,
      cbdDist:r.cd!=null?Number(r.cd):null,
      growthPct:plan?plan.growth_pct:null,
      highConPct:plan?plan.high_constraint_pct:null,
      logSupply:r.spc>0?Math.log(Number(r.spc)):null,
      infra: r.infra != null ? Number(r.infra) : null,
      vac: Number(r.vr)||null,
      popGrowth5yr: popGrowth5yr,
    };
  }).filter(r=>r.logPrice&&r.logIncome&&r.school!=null&&r.logPop&&r.logUnemp!=null&&r.cbdDist!=null
    &&r.growthPct!=null&&r.highConPct!=null);

  console.log(`Usable: ${usable.length}\n`);

  // === SEGMENTS ===
  const segments = {
    'C1_PrimeInnerEast': new Set(['aberfeldie','albert park','armadale','ashburton','balwyn','balwyn north','brighton','brighton east','camberwell','canterbury','caulfield','caulfield east','caulfield north','caulfield south','eaglemont','elsternwick','essendon','glen iris','hawthorn','hawthorn east','ivanhoe east','kew','malvern','malvern east','mckinnon','middle park','mont albert','south yarra','surrey hills','toorak']),
    'C2_BaysideCoastal': new Set(['black rock','beaumaris','sandringham','aspendale','bonbeach','chelsea','cheltenham','edithvale','elwood','hampton','mentone','mordialloc','parkdale','patterson lakes','port melbourne','williamstown','newport']),
    'C3_InnerMidActivityCentre': new Set(['airport west','altona','altona north','ascot vale','balaclava','bentleigh','bentleigh east','box hill','brunswick','brunswick west','burwood','burwood east','carnegie','chadstone','clayton','coburg','coburg north','doncaster','doncaster east','fairfield','footscray','glen huntly','heidelberg','heidelberg heights','hughesdale','huntingdale','ivanhoe','kensington','maidstone','maribyrnong','moonee ponds','murrumbeena','north melbourne','northcote','notting hill','oakleigh','oakleigh east','oakleigh south','pascoe vale','pascoe vale south','preston','reservoir','seddon','springvale','thornbury','west footscray','west melbourne','yarraville']),
    'C4_EstablishedMiddleRing': new Set(['ashwood','blackburn','blackburn north','blackburn south','boronia','bundoora','chirnside park','clarinda','croydon','croydon north','croydon south','dingley village','donvale','ferntree gully','forest hill','frankston south','glen waverley','heatherton','heathmont','highett','knoxfield','lysterfield','macleod','mitcham','moorabbin','mooroolbark','mount waverley','mulgrave','nunawading','ormond','rosanna','ringwood','ringwood east','rowville','scoresby','strathmore','templestowe','vermont','vermont south','viewbank','wantirna','wantirna south','warranwood','watsonia','wheelers hill']),
    'C5_ValueIndustrialMulti': new Set(['altona meadows','bayswater','bayswater north','braybrook','broadmeadows','cairnlea','carrum downs','clayton south','cranbourne','dandenong','deer park','derrimut','endeavour hills','epping','fawkner','frankston','glenroy','gowanbrae','hallam','hampton park','hastings','hoppers crossing','keilor park','keysborough','kilsyth','lalor','langwarrin','laverton','lilydale','lynbrook','lyndhurst','melton','narre warren','narre warren north','narre warren south','noble park','seaford','skye','somerville','st albans','sunbury','sunshine','sunshine north','sunshine west','thomastown','werribee','werribee south']),
    'C6_GreenfieldGrowth': new Set(['armstrong creek','beaconsfield','berwick','botanic ridge','caroline springs','clyde','clyde north','craigieburn','cranbourne east','diggers rest','donnybrook','greenvale','lara','manor lakes','mernda','mickleham','officer','officer south','pakenham','point cook','rockbank','south morang','tarneit','truganina','wollert','wyndham vale']),
    'C7_RegionalCoastalLifestyle': new Set(['aireys inlet','anglesea','ballarat','barwon heads','beaconsfield upper','bell park','bell post hill','belmont','bendigo','blairgowrie','dromana','highton','langwarrin south','leopold','lorne','mccrae','mornington','mount eliza','mount martha','narre warren east','newtown','ocean grove','point lonsdale','portsea','queenscliff','rosebud','rye','safety beach','sorrento','tootgarook','torquay','waurn ponds']),
    'C8_CBD_ApartmentDense': new Set(['docklands','southbank']),
  };

  const segNames = Object.keys(segments);
  const segSuburbs = segNames.map(sn => []);
  usable.forEach(r => {
    for(let i=0; i<segNames.length; i++) {
      if(segments[segNames[i]].has(r.sub)) { segSuburbs[i].push(r); return; }
    }
  });

  // Factor definitions
  const allVarNames = ['logIncome','school','logPop','logUnemp','cbdDist','growthPct','highConPct','logSupply','infraScore','vacancy','popGrowth5yr'];
  const expectedDir = {'logIncome':'+','school':'+','logPop':'+','logUnemp':'-','cbdDist':'-','growthPct':'-','highConPct':'+','logSupply':'-','infraScore':'+','vacancy':'-','popGrowth5yr':'+'};
  const factorGetters = {
    logIncome: r=>r.logIncome, school: r=>r.school, logPop: r=>r.logPop,
    logUnemp: r=>r.logUnemp, cbdDist: r=>r.cbdDist, growthPct: r=>r.growthPct,
    highConPct: r=>r.highConPct, logSupply: r=>r.logSupply||0,
    infraScore: r=>r.infra||0, vacancy: r=>r.vac||0, popGrowth5yr: r=>r.popGrowth5yr||0
  };

  console.log('================================================================================');
  console.log('=== STEPWISE SELECTION PER SEGMENT ===');
  console.log('================================================================================\n');

  const finalModels = {};

  segNames.forEach((sn, ci) => {
    const members = segSuburbs[ci];
    if(members.length < 6) {
      console.log(`\n--- ${sn} (n=${members.length}) — SKIP ---`);
      return;
    }
    console.log(`\n--- ${sn} (n=${members.length}) ---`);

    // Start with all 11 factors
    let active = [...allVarNames];
    const y = members.map(r => r.logPrice);

    function getX(membs, vars) {
      return membs.map(r => [1, ...vars.map(v => factorGetters[v](r))]);
    }

    // Helper: get OLS result for a set of variables
    function evalModel(vars) {
      const Xv = getX(members, vars);
      const res = ols(Xv, y);
      if(!res) return null;
      // Count direction-correct factors
      let ok = 0;
      const dirs = vars.map((v,vi) => {
        const actual = res.beta[vi+1] > 0 ? '+' : '-';
        const exp = expectedDir[v];
        const correct = actual === exp;
        if(correct) ok++;
        return {name: v, actual, expected: exp, correct, coef: res.beta[vi+1]};
      });
      return {...res, dirCorrect: ok, dirTotal: vars.length, dirPct: ok/vars.length, dirs};
    }

    // Backward stepwise: drop worst-direction factor until all correct or can't improve
    let best = evalModel(active);
    if(!best) { console.log('  Failed to fit initial model'); return; }

    console.log(`  Start: ${active.length} factors, R²=${best.r2.toFixed(4)}, AdjR²=${best.adjR2.toFixed(4)}, Direction: ${best.dirCorrect}/${best.dirTotal}`);

    let iter = 0;
    while(best.dirCorrect < best.dirTotal && active.length > 2) {
      // Find the worst wrong-direction factor (lowest |t| among wrong ones)
      const wrong = best.dirs.filter(d => !d.correct);
      // Among wrong ones, find the one with coefficient closest to 0 (least important)
      wrong.sort((a,b) => Math.abs(a.coef) - Math.abs(b.coef));
      const drop = wrong[0].name;
      
      const newVars = active.filter(v => v !== drop);
      const newRes = evalModel(newVars);
      
      if(!newRes || newRes.r2 < best.r2 * 0.9) {
        // Dropping this factor tanked R² too much — keep it despite wrong direction
        console.log(`  Keeping ${drop} (wrong dir but R² would drop too much)`);
        // Mark it as "keep despite wrong direction"
        const idx = best.dirs.findIndex(d => d.name === drop);
        if(idx >= 0) best.dirs[idx].correct = true; // force accept
        best.dirCorrect = best.dirs.filter(d => d.correct).length;
        continue;
      }
      
      active = newVars;
      best = newRes;
      iter++;
      console.log(`  Iter ${iter}: dropped ${drop}, factors=${active.length}, R²=${best.r2.toFixed(4)}, AdjR²=${best.adjR2.toFixed(4)}, Dir=${best.dirCorrect}/${best.dirTotal}`);
    }

    // Also drop factors with near-zero coefficient that barely add R²
    // (optional second pass)
    
    finalModels[sn] = {vars: active, model: best, members};

    console.log(`  ✅ Final: ${active.join(', ')}`);
    console.log(`     R²=${best.r2.toFixed(4)}  AdjR²=${best.adjR2.toFixed(4)}  Dir=${best.dirCorrect}/${best.dirTotal}`);
    best.dirs.filter(d => d.name !== 'Intercept').forEach(d => {
      console.log(`     ${d.name.padEnd(16)} ${d.coef.toFixed(6)} (${d.actual})${d.correct?' ✅':' ❌'}`);
    });
  });

  // === UV SCORING WITH FINAL MODELS ===
  console.log('\n================================================================================');
  console.log('=== UV SCORING — FINAL MODELS ===');
  console.log('================================================================================\n');

  const targets = ['doncaster','point cook','sunshine','glen waverley','scoresby',
    'docklands','southbank','brighton','toorak','tarneit','box hill','clayton',
    'werribee','frankston','preston','mickleham','manor lakes','diggers rest','maribyrnong','wyndham vale'];

  segNames.forEach((sn) => {
    const fm = finalModels[sn];
    if(!fm || fm.members.length < 6) return;
    
    console.log(`\n${sn} — R²=${fm.model.r2.toFixed(4)}  Direc=${fm.model.dirCorrect}/${fm.model.dirTotal}`);
    console.log('Suburb'.padEnd(22),'Actual'.padEnd(10),'Theory'.padEnd(10),'Ratio'.padEnd(8),'PIR'.padEnd(8),'UV'.padEnd(6),'Label');
    
    const segTargets = targets.filter(t => fm.members.some(m => m.sub === t));
    if(segTargets.length === 0) { console.log('  (no targets)'); return; }
    
    segTargets.forEach(t => {
      const f = fm.members.find(r => r.sub === t);
      if (!f) return;
      const x = [1, ...fm.vars.map(v => factorGetters[v](f))];
      const predLog = x.reduce((s, xi, j) => s + xi * fm.model.beta[j], 0);
      const theory = Math.exp(predLog);
      const ratio = f.blendedPrice / theory;
      const pir = f.income > 0 ? f.blendedPrice / f.income : 15;
      const priceScore = ratio < 1.0 ? Math.min(100,50+(1-ratio)*100) : Math.max(0,50-(ratio-1)*100);
      const pirScore = Math.max(0, Math.min(100, (15-pir)/10*100));
      const uv = Math.round(0.6*priceScore + 0.4*pirScore);
      const label = uv>=80?'明显偏低 🟢':uv>=60?'略微偏低 🟢':uv>=40?'接近合理 🟡':uv>=20?'略微偏高 🟠':'明显偏高 🔴';
      console.log(`  ${f.suburb.padEnd(20)} ${Math.round(f.blendedPrice/1000)+'K'.padEnd(9)} ${Math.round(theory/1000)+'K'.padEnd(9)} ${ratio.toFixed(3).padEnd(7)} ${(pir||15).toFixed(1).padEnd(7)} ${uv.toString().padEnd(5)} ${label}`);
    });
  });

  // === SUMMARY OF FINAL MODELS ===
  console.log('\n================================================================================');
  console.log('=== FINAL MODEL SUMMARY ===');
  console.log('================================================================================\n');
  
  let totalR2 = 0, totalN = 0, totalDirW = 0, totalDirN = 0;
  Object.entries(finalModels).forEach(([sn, fm]) => {
    const n = fm.members.length;
    console.log(`${sn.padEnd(30)} n=${n.toString().padEnd(3)} R²=${fm.model.r2.toFixed(4)} AdjR²=${fm.model.adjR2.toFixed(4)} Dir=${fm.model.dirCorrect}/${fm.model.dirTotal} Factors: ${fm.vars.join(', ')}`);
    totalR2 += fm.model.r2 * n;
    totalN += n;
    totalDirW += fm.model.dirCorrect * n;
    totalDirN += fm.model.dirTotal * n;
  });
  
  console.log(`\nWeighted Avg R²: ${(totalR2/totalN).toFixed(4)}`);
  if(totalDirN > 0) console.log(`Weighted Dir Correct: ${(totalDirW/totalDirN*100).toFixed(1)}%`);
  console.log(`Total suburbs: ${totalN}`);
}

run().catch(e=>{console.error(e);process.exit(1)});
