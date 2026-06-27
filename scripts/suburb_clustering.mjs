#!/usr/bin/env node
/**
 * Phase 1: K-Means Suburb Clustering
 *
 * Cluster VIC suburbs into 3-5 segments using normalized factors:
 *   income, school, population, unemployment, cbd_distance, 
 *   supply_per_capita, growth_zone_pct, residential_zone_pct
 *
 * Output: per-suburb cluster assignment + cluster profiles
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { readFileSync } from 'fs';
const fs = require('fs');

const env = readFileSync('/Users/FrankAI/Documents/澳洲房地产评估系统/.env', 'utf8');
const m = env.match(/DATABASE_URL='([^']+)'/);
const { neon } = require('@neondatabase/serverless');
const sql = neon(m[1]);

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
    WITH sc AS (SELECT LOWER(cs.suburb)k,6371*2*ASIN(SQRT(POWER(SIN(RADIANS((-37.8136-AVG(cs.lat))/2)),2)+COS(RADIANS(-37.8136))*COS(RADIANS(AVG(cs.lat)))*POWER(SIN(RADIANS((144.9631-AVG(cs.lon))/2)),2)))cd,AVG(cs.lat)lat,AVG(cs.lon)lon FROM comparable_sales cs WHERE cs.lat IS NOT NULL AND cs.lat!=0 AND cs.lon IS NOT NULL AND cs.lon!=0 AND cs.state='VIC' GROUP BY LOWER(cs.suburb)),
    sp AS (SELECT LOWER(sm.suburb)k,e.year_2025 p25 FROM suburb_metrics sm LEFT JOIN suburb_sa2_map mp ON LOWER(mp.suburb)=LOWER(sm.suburb) AND mp.state='VIC' LEFT JOIN abs_erp_sa2 e ON e.sa2_code=mp.sa2_code WHERE sm.state='VIC' AND sm.median_house_price>0),
    su AS (SELECT LOWER(sm.suburb)k,sl.unemployment_rate::numeric ur FROM suburb_metrics sm LEFT JOIN suburb_sa2_map mp ON LOWER(mp.suburb)=LOWER(sm.suburb) AND mp.state='VIC' LEFT JOIN salm_sa2_data sl ON sl.sa2_code=mp.sa2_code WHERE sm.state='VIC' AND sm.median_house_price>0),
    si AS (SELECT LOWER(sm.suburb)k,(c.g02->>'Median_tot_hhd_inc_weekly')::numeric inc FROM suburb_metrics sm LEFT JOIN suburb_sa2_map mp ON LOWER(mp.suburb)=LOWER(sm.suburb) AND mp.state='VIC' LEFT JOIN census_sa2_data c ON c.sa2_code::text=mp.sa2_code WHERE sm.state='VIC' AND sm.median_house_price>0)
    SELECT DISTINCT ON (LOWER(sm.suburb)) LOWER(sm.suburb)sub,sm.suburb orig_suburb,sm.median_combined_price cp,sm.median_house_price hp,sm.median_unit_price up,sm.dwelling_separate_house se,sm.school_score ss,sm.vacancy_rate_adjusted vr,sm.supply_housing_per_capita spc,sm.infrastructure_score infra,
      sp.p25,si.inc,su.ur,sc.cd,sc.lat,sc.lon
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
      sub:r.sub, suburb: r.orig_suburb,logPrice:Math.log(bl), blendedPrice:bl,
      logIncome:inc>0?Math.log(inc):null, income:inc,
      school:r.ss!=null?Number(r.ss):null,
      logPop:r.p25>0?Math.log(Number(r.p25)):null,
      logUnemp:r.ur!=null?Math.log(Number(r.ur)):null,
      cbdDist:r.cd!=null?Number(r.cd):null,
      resPct:plan?plan.residential_pct:null,
      growthPct:plan?plan.growth_pct:null,
      highConPct:plan?plan.high_constraint_pct:null,
      vac:Number(r.vr)||null,
      logSupply:r.spc>0?Math.log(Number(r.spc)):null,
      infra: r.infra != null ? Number(r.infra) : null,
      lat: r.lat != null ? Number(r.lat) : null,
      lon: r.lon != null ? Number(r.lon) : null,
    };
  }).filter(r=>r.logPrice&&r.logIncome&&r.school!=null&&r.logPop&&r.logUnemp!=null&&r.cbdDist!=null
    &&r.resPct!=null&&r.growthPct!=null&&r.highConPct!=null);

  console.log(`Usable: ${usable.length}\n`);

  // Select clustering features (standardize to z-scores)
  const featureDefs = [
    ['logIncome', r=>r.logIncome],
    ['school', r=>r.school],
    ['logPop', r=>r.logPop],
    ['logUnemp', r=>r.logUnemp],
    ['cbdDist', r=>r.cbdDist],
    ['growthPct', r=>r.growthPct],
    ['highConPct', r=>r.highConPct],
    ['logSupply', r=>r.logSupply||0],
  ];

  const n = usable.length;
  const nFeat = featureDefs.length;
  const raw = usable.map(r => featureDefs.map(([_,fn]) => fn(r)));
  
  // Standardize (z-score)
  const means = Array(nFeat).fill(0);
  const stds = Array(nFeat).fill(1);
  for(let j=0; j<nFeat; j++) {
    means[j] = raw.reduce((s,r)=>s+r[j],0)/n;
    stds[j] = Math.sqrt(raw.reduce((s,r)=>s+(r[j]-means[j])**2,0)/n);
    if(stds[j] < 1e-10) stds[j] = 1;
  }
  const scaled = raw.map(r => r.map((v,j) => (v-means[j])/stds[j]));

  // K-Means
  function kmeans(data, k, maxIter=100) {
    const n = data.length, p = data[0].length;
    // Initialize centroids from random points
    let cents = [];
    const used = new Set();
    for(let i=0; i<k; i++) {
      let idx;
      do { idx = Math.floor(Math.random() * n); } while(used.has(idx));
      used.add(idx);
      cents.push([...data[idx]]);
    }
    
    let assign = Array(n).fill(0);
    for(let iter=0; iter<maxIter; iter++) {
      // Assign each point to nearest centroid
      let changed = false;
      for(let i=0; i<n; i++) {
        let minDist = Infinity, bestC = 0;
        for(let ci=0; ci<k; ci++) {
          let dist = 0;
          for(let j=0; j<p; j++) dist += (data[i][j] - cents[ci][j]) ** 2;
          if(dist < minDist) { minDist = dist; bestC = ci; }
        }
        if(assign[i] !== bestC) { assign[i] = bestC; changed = true; }
      }
      if(!changed) break;
      // Update centroids
      const sums = Array.from({length:k}, ()=>Array(p).fill(0));
      const counts = Array(k).fill(0);
      for(let i=0; i<n; i++) {
        for(let j=0; j<p; j++) sums[assign[i]][j] += data[i][j];
        counts[assign[i]]++;
      }
      for(let ci=0; ci<k; ci++) {
        if(counts[ci] > 0) {
          for(let j=0; j<p; j++) cents[ci][j] = sums[ci][j] / counts[ci];
        }
      }
    }
    // Within-cluster sum of squares
    const wcss = Array(k).fill(0);
    for(let i=0; i<n; i++) {
      let d=0; for(let j=0; j<p; j++) d += (data[i][j] - cents[assign[i]][j]) ** 2;
      wcss[assign[i]] += d;
    }
    return { assign, cents, wcss: wcss.reduce((a,b)=>a+b,0) };
  }

  // Run multiple seeds pick best for each k
  console.log('=== K-Means Results ===');
  for(let k=3; k<=5; k++) {
    let best = null, bestWcss = Infinity;
    for(let seed=0; seed<20; seed++) {
      const res = kmeans(scaled, k);
      if(res.wcss < bestWcss) { bestWcss = res.wcss; best = res; }
    }
    
    // Profile each cluster
    console.log(`\n--- K=${k} (WCSS=${bestWcss.toFixed(2)}) ---`);
    const clusters = Array.from({length:k}, ()=> {
      const indices = [];
      best.assign.forEach((a,i) => { if(a === indices.length) indices.push(i); });
      return indices;
    });
    // Rebuild properly
    const clustList = Array.from({length:k}, ()=>[]);
    for(let i=0; i<n; i++) clustList[best.assign[i]].push(i);
    
    clustList.forEach((members, ci) => {
      if(members.length === 0) { console.log(`  Cluster ${ci}: empty`); return; }
      const vals = featureDefs.map(([name,_],j) => {
        const mean = members.reduce((s,mi)=>s+raw[mi][j],0)/members.length;
        return mean;
      });
      // Price
      const avgPrice = members.reduce((s,mi)=>s+usable[mi].blendedPrice,0)/members.length;
      const avgIncome = members.reduce((s,mi)=>s+usable[mi].income,0)/members.length;
      
      // Sample suburbs
      const samples = members.slice(0,8).map(mi => usable[mi].suburb);
      
      console.log(`  Cluster ${ci} (n=${members.length}):`);
      console.log(`     Median Price: $${Math.round(avgPrice/1000)}K, Income: $${Math.round(avgIncome/1000)}K/yr`);
      console.log(`     Income: ${vals[0].toFixed(2)}, School: ${vals[1].toFixed(1)}, Pop: ${Math.exp(vals[2]).toFixed(0)}, Unemp: ${vals[3].toFixed(1)}%, CBD: ${vals[4].toFixed(1)}km, Growth: ${vals[5].toFixed(1)}%, HighCon: ${vals[6].toFixed(1)}%, Supply: ${vals[7].toFixed(2)}`);
      console.log(`     Examples: ${samples.join(', ')}`);
    });
  }

  // Output k=4 assignments for later use
  console.log('\n\n=== K=4 Final Assignment ===');
  const k4 = (() => {
    let best=null, bestW=Infinity;
    for(let s=0;s<50;s++) {
      const r=kmeans(scaled,4);
      if(r.wcss<bestW){bestW=r.wcss;best=r;}
    }
    return best;
  })();
  
  const clust4 = Array.from({length:4}, ()=>[]);
  for(let i=0; i<usable.length; i++) clust4[k4.assign[i]].push(usable[i]);
  
  clust4.forEach((members, ci) => {
    const samples = members.slice(0,12).map(m => m.suburb).join(', ');
    const avgPrice = members.reduce((s,m)=>s+m.blendedPrice,0)/members.length;
    const avgCBD = members.reduce((s,m)=>s+m.cbdDist,0)/members.length;
    const avgIncome = members.reduce((s,m)=>s+m.income,0)/members.length;
    const avgSchool = members.reduce((s,m)=>s+m.school,0)/members.length;
    console.log(`C${ci} (n=${members.length}) $${Math.round(avgPrice/1000)}K CBD=${avgCBD.toFixed(1)}km Inc=$${Math.round(avgIncome/1000)}K School=${avgSchool.toFixed(0)}`);
    console.log(`  Suburbs: ${samples}`);
    console.log(`  Suburb list: ${members.map(m=>m.suburb).join(',')}`);
  });
}

run().catch(e=>{console.error(e);process.exit(1)});
