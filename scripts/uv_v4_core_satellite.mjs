#!/usr/bin/env node
/**
 * Undervaluation v4 — Core + Satellite Factor Architecture
 * 
 * Core factors (all segments):
 *   logIncome, logUnemp, logPop, logSupply, supplyCon, cashRate (4.35 global)
 *
 * Satellite factors (per segment):
 *   C1: school, cbdDist, occupancy
 *   C2: school, cbdDist
 *   C3: growthPct, cbdDist, school, vac
 *   C4: school, cbdDist, occupancy, popGrowth5yr
 *   C5: popGrowth5yr, vac, growthPct
 *   C6: growthPct, popGrowth5yr
 *   C7: cbdDist, popGrowth5yr, vac
 *   C8: vac, cbdDist
 *
 * Run: node scripts/uv_v4_core_satellite.mjs
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { readFileSync } from 'fs';

const env = readFileSync('/Users/FrankAI/Documents/澳洲房地产评估系统/.env', 'utf8');
const m = env.match(/DATABASE_URL='([^']+)'/);
const { neon } = require('@neondatabase/serverless');
const sql = neon(m[1]);
const CASH_RATE = 4.35;

function ols(X, y) {
  const n = X.length, p = X[0].length;
  if(n < p+1) return null;
  function mul(A, B) {
    const m = A.length, n = A[0].length, p = B[0].length, C = Array.from({length:m},()=>Array(p).fill(0));
    for(let i=0;i<m;i++) for(let k=0;k<n;k++) if(A[i][k]!==0) for(let j=0;j<p;j++) C[i][j]+=A[i][k]*B[k][j]; return C;
  }
  function transp(A){return A[0].map((_,j)=>A.map(r=>r[j]));}
  try{
    const Xt=transp(X),XtX=mul(Xt,X),Xty=mul(Xt,y.map(v=>[v])).map(r=>r[0]);
    const aug=XtX.map((row,i)=>[...row,Xty[i]]);
    for(let c=0;c<p;c++){let mr=c;for(let r=c+1;r<p;r++)if(Math.abs(aug[r][c])>Math.abs(aug[mr][c]))mr=r;
    [aug[c],aug[mr]]=[aug[c],aug[mr]];const piv=aug[c][c];if(Math.abs(piv)<1e-12)continue;
    for(let j=c;j<=p;j++)aug[c][j]/=piv;for(let r=0;r<p;r++){if(r===c)continue;const f=aug[r][c];for(let j=c;j<=p;j++)aug[r][j]-=f*aug[c][j];}}
    const beta=aug.map(r=>r[p]);
    const my=y.reduce((a,b)=>a+b,0)/n;
    const ssRes=y.reduce((s,yi,i)=>s+(yi-beta.reduce((sum,bj,j)=>sum+bj*X[i][j],0))**2,0);
    const ssTot=y.reduce((s,yi)=>s+(yi-my)**2,0);
    return {beta, r2:ssTot>0?1-ssRes/ssTot:0, adjR2:1-(ssRes/(n-p))/(ssTot/(n-1)), n, p, rss:ssRes};
  }catch(e){return null;}
}

// Direction checking removed — OLS coefficients are natural and segment-dependent

const segConfig = {
  'C1_PrimeInnerEast': {
    members: new Set(['aberfeldie','albert park','armadale','ashburton','balwyn','balwyn north','brighton','brighton east','camberwell','canterbury','caulfield','caulfield east','caulfield north','caulfield south','eaglemont','elsternwick','essendon','glen iris','hawthorn','hawthorn east','ivanhoe east','kew','malvern','malvern east','mckinnon','middle park','mont albert','south yarra','surrey hills','toorak']),
    core: ['logIncome','logUnemp','logPop','logSupply','supplyCon'],
    satellite: ['school','cbdDist','occupancy']
  },
  'C2_BaysideCoastal': {
    members: new Set(['black rock','beaumaris','sandringham','aspendale','bonbeach','chelsea','cheltenham','edithvale','elwood','hampton','mentone','mordialloc','parkdale','patterson lakes','port melbourne','williamstown','newport']),
    core: ['logIncome','logUnemp','logPop','logSupply','supplyCon'],
    satellite: ['school','cbdDist']
  },
  'C3_InnerMidActivityCentre': {
    members: new Set(['airport west','altona','altona north','ascot vale','balaclava','bentleigh','bentleigh east','box hill','brunswick','brunswick west','burwood','burwood east','carnegie','chadstone','clayton','coburg','coburg north','doncaster','doncaster east','fairfield','footscray','glen huntly','heidelberg','heidelberg heights','hughesdale','huntingdale','ivanhoe','kensington','maidstone','maribyrnong','moonee ponds','murrumbeena','north melbourne','northcote','notting hill','oakleigh','oakleigh east','oakleigh south','pascoe vale','pascoe vale south','preston','reservoir','seddon','springvale','thornbury','west footscray','west melbourne','yarraville']),
    core: ['logIncome','logUnemp','logPop','logSupply','supplyCon'],
    satellite: ['growthPct','cbdDist','school','vac']
  },
  'C4_EstablishedMiddleRing': {
    members: new Set(['ashwood','blackburn','blackburn north','blackburn south','boronia','bundoora','chirnside park','clarinda','croydon','croydon north','croydon south','dingley village','donvale','ferntree gully','forest hill','frankston south','glen waverley','heatherton','heathmont','highett','knoxfield','lysterfield','macleod','mitcham','moorabbin','mooroolbark','mount waverley','mulgrave','nunawading','ormond','rosanna','ringwood','ringwood east','rowville','scoresby','strathmore','templestowe','vermont','vermont south','viewbank','wantirna','wantirna south','warranwood','watsonia','wheelers hill']),
    core: ['logIncome','logUnemp','logPop','logSupply','supplyCon'],
    satellite: ['school','cbdDist','occupancy','popGrowth5yr']
  },
  'C5_ValueIndustrialMulti': {
    members: new Set(['altona meadows','bayswater','bayswater north','braybrook','broadmeadows','cairnlea','carrum downs','clayton south','cranbourne','dandenong','deer park','derrimut','endeavour hills','epping','fawkner','frankston','glenroy','gowanbrae','hallam','hampton park','hastings','hoppers crossing','keilor park','keysborough','kilsyth','lalor','langwarrin','laverton','lilydale','lynbrook','lyndhurst','melton','narre warren','narre warren north','narre warren south','noble park','seaford','skye','somerville','st albans','sunbury','sunshine','sunshine north','sunshine west','thomastown','werribee','werribee south']),
    core: ['logIncome','logUnemp','logPop','logSupply','supplyCon'],
    satellite: ['popGrowth5yr','vac','growthPct']
  },
  'C6_GreenfieldGrowth': {
    members: new Set(['armstrong creek','beaconsfield','berwick','botanic ridge','caroline springs','clyde','clyde north','craigieburn','cranbourne east','diggers rest','donnybrook','greenvale','lara','manor lakes','mernda','mickleham','officer','officer south','pakenham','point cook','rockbank','south morang','tarneit','truganina','wollert','wyndham vale']),
    core: ['logIncome','logUnemp','logPop','logSupply','supplyCon'],
    satellite: ['growthPct','popGrowth5yr']
  },
  'C7_RegionalCoastalLifestyle': {
    members: new Set(['aireys inlet','anglesea','ballarat','barwon heads','beaconsfield upper','bell park','bell post hill','belmont','bendigo','blairgowrie','dromana','highton','langwarrin south','leopold','lorne','mccrae','mornington','mount eliza','mount martha','narre warren east','newtown','ocean grove','point lonsdale','portsea','queenscliff','rosebud','rye','safety beach','sorrento','tootgarook','torquay','waurn ponds']),
    core: ['logIncome','logUnemp','logPop','logSupply','supplyCon'],
    satellite: ['cbdDist','popGrowth5yr','vac']
  },
  'C8_CBD_ApartmentDense': {
    members: new Set(['docklands','southbank']),
    core: ['logIncome','logUnemp','logPop','logSupply','supplyCon'],
    satellite: ['vac','cbdDist']
  }
};

async function run() {
  const csvText = readFileSync('/tmp/suburb_planning_features.csv', 'utf8');
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
      sm.dwelling_occupancy_rate occ, sm.supply_constraint_score scs,
      sp.p25,sp.p20,si.inc,su.ur,sc.cd
    FROM suburb_metrics sm 
    LEFT JOIN sc ON LOWER(sm.suburb)=sc.k LEFT JOIN sp ON LOWER(sm.suburb)=sp.k 
    LEFT JOIN si ON LOWER(sm.suburb)=si.k LEFT JOIN su ON LOWER(sm.suburb)=su.k
    WHERE sm.state='VIC' AND sm.median_house_price>0
  `);

  const seen=new Set();const dd=rows.filter(r=>{const k=r.sub;if(seen.has(k))return false;seen.add(k);return true;});

  // Build usable data map
  const dataMap = {};
  dd.forEach(r => {
    const hp=Number(r.hp)||0,up=Number(r.up)||0,cp=Number(r.cp)||0;const sep=Number(r.se)/100;
    const bl=cp>0?cp:(up>0?hp*sep+up*(1-sep):hp);
    const inc=r.inc?Number(r.inc)*52:null;
    const plan=planningMap[r.sub];
    const pop25=r.p25?Number(r.p25):null;
    const pop20=r.p20?Number(r.p20):null;
    const popGrowth5yr=pop25&&pop20?((pop25-pop20)/pop20)*100:null;
    
    const v = {
      logPrice:Math.log(bl), blendedPrice:bl, income:inc,
      logIncome:inc>0?Math.log(inc):null,
      logUnemp:r.ur!=null?Math.log(Number(r.ur)):null,
      logPop:pop25>0?Math.log(pop25):null,
      logSupply:r.spc>0?Math.log(Number(r.spc)):null,
      supplyCon:r.scs!=null?Number(r.scs)/100:null,
      school:r.ss!=null?Number(r.ss):null,
      cbdDist:r.cd!=null?Number(r.cd):null,
      occupancy:r.occ!=null?Number(r.occ)/100:null,
      vac:Number(r.vr)||null,
      popGrowth5yr:popGrowth5yr,
      growthPct:plan?plan.growth_pct:null,
    };
    Object.keys(v).forEach(k=>{if(v[k]==null||isNaN(v[k])||v[k]===Infinity||v[k]===-Infinity) v[k]=null});
    dataMap[r.sub] = v;
  });

  const factorGetters = {
    logIncome: d=>d.logIncome, logUnemp: d=>d.logUnemp, logPop: d=>d.logPop,
    logSupply: d=>d.logSupply, supplyCon: d=>d.supplyCon,
    school: d=>d.school, cbdDist: d=>d.cbdDist, occupancy: d=>d.occupancy,
    vac: d=>d.vac, popGrowth5yr: d=>d.popGrowth5yr, growthPct: d=>d.growthPct,
  };

  const segNames = Object.keys(segConfig);
  const targets = ['doncaster','point cook','sunshine','glen waverley','scoresby',
    'docklands','southbank','brighton','toorak','tarneit','box hill','clayton',
    'werribee','frankston','preston','mickleham','manor lakes','diggers rest','maribyrnong','wyndham vale'];

  console.log('================================================================================');
  console.log('=== UV V4 — Core + Satellite Factor Architecture ===');
  console.log('================================================================================\n');

  const results = {};

  segNames.forEach(sn => {
    const cfg = segConfig[sn];
    const members = [...cfg.members].filter(m => dataMap[m.toLowerCase()] && dataMap[m].logPrice != null).map(m => dataMap[m]);
    if(members.length < 5) {
      console.log(`\n--- ${sn} (n=${members.length}) — SKIP ---`);
      return;
    }

    // A factor is available if at least 80% of members have it (allow sparse data)
    const THRESH = 0.8;
    const availCore = cfg.core.filter(f => members.filter(m => m[f] != null).length / members.length >= THRESH);
    const availSat = cfg.satellite.filter(f => members.filter(m => m[f] != null).length / members.length >= THRESH);
    const allAvail = [...availCore, ...availSat];
    
    if(availCore.length < 2) {
      console.log(`\n--- ${sn} (n=${members.length}) — insufficient core data ${availCore.join(',')} ---`);
      return;
    }

    const y = members.map(m => m.logPrice);
    const Xcore = members.map(m => [1, ...availCore.map(f => m[f]), CASH_RATE]);
    const Xall = members.map(m => [1, ...allAvail.map(f => m[f]), CASH_RATE]);

    const mCore = ols(Xcore, y);
    const mAll = ols(Xall, y);

    const avgPrice = members.reduce((s,m)=>s+m.blendedPrice,0)/members.length;
    const avgCBD = members.reduce((s,m)=>s+m.cbdDist,0)/members.length;
    const avgSchool = members.reduce((s,m)=>s+m.school,0)/members.length;

    console.log(`\n--- ${sn} (n=${members.length}) ---`);
    console.log(`  Profile: $${Math.round(avgPrice/1000)}K CBD=${(avgCBD||'N/A').toFixed(1)}km Sch=${(avgSchool||'N/A').toFixed(0)}`);
    console.log(`  Core (${[...availCore,'cashRate'].join(',')}): R²=${mCore.r2.toFixed(4)} AdjR²=${mCore.adjR2.toFixed(4)}`);
    if(mAll) console.log(`  +Satellites (${[...allAvail,'cashRate'].join(',')}): R²=${mAll.r2.toFixed(4)} AdjR²=${mAll.adjR2.toFixed(4)}`);

    const finalModel = mAll || mCore;
    const finalVars = mAll ? allAvail : availCore;
    [...finalVars, 'cashRate'].forEach((fv,i) => {
      const dir = finalModel.beta[i+1]>0?'+':'-';
      if(fv === 'cashRate') {
        console.log(`    ${fv.padEnd(16)} ${finalModel.beta[i+1].toFixed(6)} (${dir}) — global constant`);
        return;
      }
      console.log(`    ${fv.padEnd(16)} ${finalModel.beta[i+1].toFixed(6)} (${dir})`);
    });

    // UV Scoring
    const model = finalModel;
    const vars = finalVars;

    console.log('\n  UV Scores:');
    console.log('  Target'.padEnd(22),'Actual'.padEnd(10),'Theory'.padEnd(10),'Rto'.padEnd(8),'PIR'.padEnd(8),'UV'.padEnd(6),'Label');
    
    const segTargets = targets.filter(t => cfg.members.has(t) && dataMap[t]);
    if(segTargets.length === 0) console.log('  (no target suburbs)');

    segTargets.forEach(t => {
      const m = dataMap[t.toLowerCase()];
      const x = [1, ...vars.map(f => m[f]), CASH_RATE];
      const predLog = x.reduce((s,xi,j) => s+xi*model.beta[j],0);
      const theory = Math.exp(predLog);
      const ratio = m.blendedPrice / theory;
      const pir = m.income > 0 ? m.blendedPrice / m.income : 15;
      const priceScore = ratio<1?Math.min(100,50+(1-ratio)*100):Math.max(0,50-(ratio-1)*100);
      const pirScore = Math.max(0,Math.min(100,(15-pir)/10*100));
      const uv = Math.round(0.7*priceScore+0.3*pirScore);
      const label = uv>=80?'明显偏低 🟢':uv>=60?'略微偏低 🟢':uv>=40?'接近合理 🟡':uv>=20?'略微偏高 🟠':'明显偏高 🔴';
      console.log(`  ${t.padEnd(22)} ${Math.round(m.blendedPrice/1000)+'K'.padEnd(9)} ${Math.round(theory/1000)+'K'.padEnd(9)} ${ratio.toFixed(3).padEnd(7)} ${(pir||15).toFixed(1).padEnd(7)} ${uv.toString().padEnd(5)} ${label}`);
    });

    results[sn] = {n: members.length, coreVars: availCore, satVars: availSat, allVars: vars, coreR2: mCore.r2, allR2: mAll?.r2};
  });

  // === SUMMARY ===
  console.log('\n================================================================================');
  console.log('=== SUMMARY ===');
  console.log('================================================================================\n');
  
  let coreR2w=0, allR2w=0, totalN=0;
  Object.entries(results).forEach(([sn, r]) => {
    const satStr = r.satVars.length > 0 ? ` +${r.satVars.join(',')}` : ' (no satellites)';
    console.log(`${sn.padEnd(30)} n=${r.n.toString().padEnd(3)} CoreR²=${r.coreR2.toFixed(4)} AllR²=${(r.allR2||r.coreR2).toFixed(4)}${satStr}`);
    coreR2w += r.coreR2 * r.n;
    allR2w += (r.allR2||r.coreR2) * r.n;
    totalN += r.n;
  });
  
  console.log(`\nWeighted Avg Core R²: ${(coreR2w/totalN).toFixed(4)}`);
  console.log(`Weighted Avg All R²: ${(allR2w/totalN).toFixed(4)}`);
  console.log(`Total suburbs: ${totalN}`);
  console.log(`\nWeighted Avg Core R²: ${(coreR2w/totalN).toFixed(4)}`);
  console.log(`Weighted Avg All R²: ${(allR2w/totalN).toFixed(4)}`);
  console.log(`Total suburbs: ${totalN}`);

  // === WRITE UV SCORES TO DB ===
  console.log('\n--- Writing UV scores to suburb_metrics... ---');

  const THRESH = 0.8;
  const uvRows = [];
  Object.entries(segConfig).forEach(([sn, cfg]) => {
    const rawNames = [...cfg.members].filter(m => dataMap[m.toLowerCase()] && dataMap[m.toLowerCase()].logPrice != null);
    const segMembers = rawNames.map(m => dataMap[m.toLowerCase()]);
    if (segMembers.length < 5) return;

    const aCore = cfg.core.filter(f => segMembers.filter(m => m[f] != null).length / segMembers.length >= THRESH);
    const aSat = cfg.satellite.filter(f => segMembers.filter(m => m[f] != null).length / segMembers.length >= THRESH);
    const allA = [...aCore, ...aSat];
    if (aCore.length < 2) return;

    const yy = segMembers.map(m => m.logPrice);
    const Xc = segMembers.map(m => [1, ...aCore.map(f => m[f]), CASH_RATE]);
    const Xa = segMembers.map(m => [1, ...allA.map(f => m[f]), CASH_RATE]);
    const mc = ols(Xc, yy);
    const ma = ols(Xa, yy);
    const model = ma || mc;
    const vv = ma ? allA : aCore;

    [...cfg.members].filter(m => dataMap[m.toLowerCase()] && dataMap[m].logPrice != null).forEach(t => {
      const m = dataMap[t.toLowerCase()];
      const x = [1, ...vv.map(f => m[f]), CASH_RATE];
      const pl = x.reduce((s, xi, j) => s + xi * model.beta[j], 0);
      const th = Math.exp(pl);
      const ratio = m.blendedPrice / th;
      const pir = m.income > 0 ? m.blendedPrice / m.income : 15;
      const ps = ratio < 1 ? Math.min(100, 50 + (1 - ratio) * 100) : Math.max(0, 50 - (ratio - 1) * 100);
      const pirs = Math.max(0, Math.min(100, (15 - pir) / 10 * 100));
      const uv = Math.round(0.7 * ps + 0.3 * pirs);
      const label = uv >= 80 ? '明显偏低' : uv >= 60 ? '略微偏低' : uv >= 40 ? '接近合理' : uv >= 20 ? '略微偏高' : '明显偏高';
      uvRows.push({ suburb: t, uv, label });
    });
  });

  const client = sql;
  let updated = 0;
  for (const r of uvRows) {
    await client.query(
      'UPDATE suburb_metrics SET uv_score_v4 = $1, uv_score_v4_label = $2, updated_at = NOW() WHERE LOWER(suburb) = LOWER($3) AND state = $4',
      [r.uv, r.label, r.suburb, 'VIC']
    );
    updated++;
  }
  console.log('Written UV scores for ' + updated + ' suburbs.');
}

run().catch(e=>{console.error(e);process.exit(1)});
