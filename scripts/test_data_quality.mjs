#!/usr/bin/env node
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { readFileSync } from 'fs';
const env = readFileSync('/Users/FrankAI/Documents/澳洲房地产评估系统/.env', 'utf8');
const m = env.match(/DATABASE_URL='([^']+)'/);
const { neon } = require('@neondatabase/serverless');
const sql = neon(m[1]);

async function main() {
  // Cross-tab de-dup join
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
      sm.median_house_price,
      sm.median_unit_price,
      sm.median_combined_price,
      sm.school_score,
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

  console.log(`Total rows: ${rows.length}`);

  // 1. How many have combined_price vs not?
  const withCombined = rows.filter(r => Number(r.median_combined_price) > 0).length;
  const withHouseUnit = rows.filter(r => Number(r.median_house_price) > 0 && Number(r.median_unit_price) > 0).length;
  const withSeparateRatio = rows.filter(r => r.dwelling_separate_house != null && r.dwelling_total > 0).length;
  const withIncome = rows.filter(r => r.hhd_income_weekly != null && r.hhd_income_weekly > 0).length;
  console.log(`With combined_price > 0: ${withCombined}`);
  console.log(`With both house & unit: ${withHouseUnit}`);
  console.log(`With separate_ratio: ${withSeparateRatio}`);
  console.log(`With income: ${withIncome}`);

  // 2. Income range for targets
  const tgt = rows.filter(r => ['doncaster','brighton','sunshine','point cook','scoresby','docklands'].includes(r.suburb.toLowerCase()));
  console.log('\nTarget suburbs raw:');
  tgt.forEach(r => {
    const combined = Number(r.median_combined_price) || 0;
    const house = Number(r.median_house_price) || 0;
    const unit = Number(r.median_unit_price) || 0;
    const sep = r.dwelling_separate_house != null ? Number(r.dwelling_separate_house) : null;
    const tot = r.dwelling_total != null ? Number(r.dwelling_total) : null;
    const ratio = sep != null && tot > 0 ? (sep/tot).toFixed(3) : 'NULL';
    const blended = combined > 0 ? combined : house * (sep/tot||0.5) + unit * (1-sep/tot||0.5);
    console.log(`${r.suburb.padEnd(20)} H=$${ (house/1000).toFixed(0)}K U=$${(unit/1000).toFixed(0)}K C=$${(combined/1000).toFixed(0)}K` +
      ` school=${r.school_score} sep=${ratio} occ=${r.dwelling_occupancy_rate} income=$${r.hhd_income_weekly} cbd=${r.cbd_distance_km?.toFixed(1)}km blended=$${(blended/1000).toFixed(0)}K`);
  });

  // 3. Check Manor Lakes and Mickleham (had UV=100 with blended price ~$19K vs theory $824K)
  const outliers = rows.filter(r => ['manor lakes','mickleham'].includes(r.suburb.toLowerCase()));
  outliers.forEach(r => {
    console.log(`\n=== ${r.suburb} ===`);
    console.log(JSON.stringify(r, null, 2));
  });

  // 4. Compare income between brighton and mickleham
  const incQuery = await sql.query(`
    SELECT LOWER(sm.suburb) as suburb,
      (c.g02->>'Median_tot_hhd_inc_weekly')::int as income,
      c.g02->>'Median_tot_hhd_inc_weekly' as raw_income,
      c.sa2_code
    FROM suburb_metrics sm
    LEFT JOIN school_locations sl ON LOWER(sm.suburb) = LOWER(sl.suburb) AND sl.state = 'VIC'
    LEFT JOIN census_sa2_data c ON c.sa2_code::text = sl.sa2_code
    WHERE LOWER(sm.suburb) IN ('mickleham', 'manor lakes', 'brighton', 'doncaster', 'diggers rest')
    ORDER BY sm.suburb
  `);
  console.log('\nIncome detail:');
  incQuery.forEach(r => console.log(JSON.stringify(r)));
}

main().catch(e => { console.error(e); process.exit(1); });
