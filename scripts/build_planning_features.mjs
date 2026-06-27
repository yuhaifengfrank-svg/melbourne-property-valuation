#!/usr/bin/env node
/**
 * Build planning features for each suburb from planning_cache
 * 
 * For each VIC suburb with comparable_sales coordinates:
 *   1. Compute bounding box (2x stddev radius from centroid)
 *   2. Count planning_cache points in the box per zone_category
 *   3. Compute constraint_level distribution
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { readFileSync } from 'fs';
const env = readFileSync('/Users/FrankAI/Documents/澳洲房地产评估系统/.env', 'utf8');
const m = env.match(/DATABASE_URL='([^']+)'/);
const { neon } = require('@neondatabase/serverless');
const sql = neon(m[1]);

async function run() {
  // 1. Get suburb centroids
  const subs = await sql.query(`
    WITH sub_coords AS (
      SELECT 
        LOWER(cs.suburb) as sub_name,
        AVG(cs.lat) as avg_lat,
        AVG(cs.lon) as avg_lon,
        STDDEV_POP(cs.lat) * 2.5 as lat_range,
        STDDEV_POP(cs.lon) * 2.5 as lon_range,
        COUNT(*) as sale_count
      FROM comparable_sales cs
      WHERE cs.lat IS NOT NULL AND cs.lat != 0 AND cs.lon IS NOT NULL AND cs.lon != 0
        AND cs.state = 'VIC'
      GROUP BY LOWER(cs.suburb)
      HAVING COUNT(*) >= 3
    )
    SELECT * FROM sub_coords ORDER BY sub_name
  `);

  console.log(`Suburbs with coordinates: ${subs.length}`);

  // 2. For each suburb, aggregate planning_cache
  const zoningSummaryCols = [
    'residential', 'public', 'rural', 'unknown', 'industrial', 
    'special', 'commercial', 'growth', 'mixed-use', 'null'
  ];

  let plotted = 0;
  const results = [];

  for (const sub of subs) {
    const avgLat = Number(sub.avg_lat);
    const avgLon = Number(sub.avg_lon);
    const latR = Math.max(Number(sub.lat_range || 0.005), 0.005);
    const lonR = Math.max(Number(sub.lon_range || 0.005), 0.005);
    
    // Only process VIC suburbs (Melbourne metro bounding box)
    if (avgLat < -38.8 || avgLat > -37.0 || avgLon < 143.0 || avgLon > 146.0) continue;

    const pc = await sql.query(`
      SELECT 
        COALESCE(zone_category, 'null') as zc,
        COUNT(*) as cnt,
        COUNT(*) FILTER(WHERE constraint_level = 'high') as high_constraint
      FROM planning_cache
      WHERE latitude::numeric BETWEEN $1 AND $2
        AND longitude::numeric BETWEEN $3 AND $4
      GROUP BY zone_category
    `, [
      (avgLat - latR).toFixed(4),
      (avgLat + latR).toFixed(4),
      (avgLon - lonR).toFixed(4),
      (avgLon + lonR).toFixed(4)
    ]);

    const total = pc.reduce((s, r) => s + parseInt(r.cnt), 0);
    if (total < 5) continue; // too few points = unreliable

    const highConstraintCount = pc.reduce((s, r) => s + parseInt(r.high_constraint), 0);

    const zonePct = {};
    for (const zc of zoningSummaryCols) {
      const f = pc.find(r => r.zc === zc);
      zonePct[zc] = f ? (parseInt(f.cnt) / total * 100).toFixed(1) : '0.0';
    }

    const residPct = parseFloat(zonePct['residential']);
    const growthPct = parseFloat(zonePct['growth']);
    const highConPct = (highConstraintCount / total * 100).toFixed(1);

    results.push({
      suburb: sub.sub_name,
      total_planning_points: total,
      residential_zone_pct: residPct,
      growth_zone_pct: growthPct,
      industrial_zone_pct: parseFloat(zonePct['industrial']),
      commercial_zone_pct: parseFloat(zonePct['commercial']),
      mixed_use_zone_pct: parseFloat(zonePct['mixed-use']),
      public_zone_pct: parseFloat(zonePct['public']),
      rural_zone_pct: parseFloat(zonePct['rural']),
      null_zone_pct: parseFloat(zonePct['null']),
      high_constraint_pct: parseFloat(highConPct),
    });

    plotted++;
    if (plotted % 50 === 0) console.log(`  processed ${plotted}/${subs.length}`);
  }

  console.log(`\nPlotted: ${plotted} suburbs`);

  // Show some results
  const sorted = [...results].sort((a,b) => b.residential_zone_pct - a.residential_zone_pct);
  console.log('\n=== Highest residential % ===');
  sorted.slice(0,10).forEach(r => console.log(
    r.suburb.padEnd(22), 'res:', r.residential_zone_pct.toFixed(1)+'%', 
    'growth:', r.growth_zone_pct.toFixed(1)+'%',
    'high_con:', r.high_constraint_pct.toFixed(1)+'%',
    'pts:', r.total_planning_points
  ));

  console.log('\n=== Highest growth zone % ===');
  sorted.sort((a,b) => b.growth_zone_pct - a.growth_zone_pct).slice(0,10).forEach(r => console.log(
    r.suburb.padEnd(22), 'growth:', r.growth_zone_pct.toFixed(1)+'%',
    'res:', r.residential_zone_pct.toFixed(1)+'%',
    'rural:', r.rural_zone_pct.toFixed(1)+'%',
    'pts:', r.total_planning_points
  ));

  console.log('\n=== High constraint ===');
  sorted.sort((a,b) => b.high_constraint_pct - a.high_constraint_pct).slice(0,10).forEach(r => console.log(
    r.suburb.padEnd(22), 'high_con:', r.high_constraint_pct.toFixed(1)+'%',
    'res:', r.residential_zone_pct.toFixed(1)+'%',
    'pts:', r.total_planning_points
  ));

  // Save to a temp CSV for reference
  const fs = await import('fs');
  const csv = ['suburb,residential_pct,growth_pct,industrial_pct,commercial_pct,mixed_use_pct,public_pct,rural_pct,null_zone_pct,high_constraint_pct,total_points'];
  results.forEach(r => csv.push(
    `${r.suburb},${r.residential_zone_pct},${r.growth_zone_pct},${r.industrial_zone_pct},${r.commercial_zone_pct},${r.mixed_use_zone_pct},${r.public_zone_pct},${r.rural_zone_pct},${r.null_zone_pct},${r.high_constraint_pct},${r.total_planning_points}`
  ));
  fs.writeFileSync('/tmp/suburb_planning_features.csv', csv.join('\n'));
  console.log(`\nSaved to /tmp/suburb_planning_features.csv (${results.length} rows)`);
}

run().catch(e => { console.error(e); process.exit(1); });
