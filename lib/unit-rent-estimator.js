/**
 * unit-rent-estimator.js — Fill median_unit_rent for all suburbs
 *
 * Strategy (multi-layer fallback):
 *   Tier 0: DIRECT — If median_unit_price + gross_yield available
 *     → unit_rent = yield × unit_price / 52
 *     → unit gross yield ≈ house yield + 0.5% (empirical adjustment)
 *   Tier 1: DFFH_PROXY — If median_rent_dffh available
 *     → unit_rent = DFFH rent (government benchmark for lower-quartile)
 *   Tier 2: HOUSE_RATIO — median_house_rent × 0.85
 *
 * Also fixes median_rent (the "combined" rent field):
 *   median_rent = weighted average of house/unit rent by dwelling mix
 */

import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log('[unit-rent] Loading metrics...');
  const { rows } = await pool.query(`
    SELECT LOWER(suburb) AS suburb_lower, state,
      median_house_price, median_unit_price,
      median_house_rent, median_unit_rent, median_rent, median_rent_dffh, median_rent_source,
      gross_yield, 
      dwelling_separate_house, dwelling_flat, dwelling_semi_detached
    FROM suburb_metrics
    WHERE state = 'VIC' OR state IS NULL
  `);
  console.log(`[unit-rent] Loaded ${rows.length} suburbs`);

  let tier0 = 0, tier1 = 0, tier2 = 0, skipped = 0;

  for (const r of rows) {
    let estRent = null;
    let estSource = null;

    // Tier 0: unit_price + yield → backward yield method
    // Gross yield = annual_rent / price * 100
    // weekly_rent = (yield / 100) * price / 52
    // Adjust: unit yield ≈ house yield + 0.75% (empirical, from market observation)
    if (r.median_unit_price != null && r.gross_yield != null && r.gross_yield > 0) {
      const unitYield = (Number(r.gross_yield) + 0.75) / 100;
      estRent = Math.round(unitYield * Number(r.median_unit_price) / 52);
      estSource = 'yield_estimate';
      tier0++;
    }
    // Tier 1: house rent ratio — unit rent ≈ 85% of house rent
    // DFFH is actually higher than house rent in most suburbs (covers all dwellings)
    // so we use this instead of DFFH proxy
    else if (r.median_house_rent != null) {
      estRent = Math.round(Number(r.median_house_rent) * 0.85);
      estSource = 'house_ratio_estimate';
      tier1++;
    } else {
      skipped++;
      continue;
    }

    // Compute combined median_rent as weighted average of house/unit rent
    const housePct = Number(r.dwelling_separate_house) || 50;
    const unitPct = (Number(r.dwelling_flat) || 0) + (Number(r.dwelling_semi_detached) || 0);
    const totalDwellingPct = housePct + unitPct || 100;

    const houseRent = Number(r.median_house_rent) || 0;
    const unitRent = estRent || 0;

    let combinedRent = null;
    if (houseRent > 0 && unitRent > 0) {
      combinedRent = Math.round(
        (houseRent * (housePct / totalDwellingPct))
        + (unitRent * (unitPct / totalDwellingPct))
      );
    } else if (houseRent > 0) {
      combinedRent = houseRent;
    } else if (unitRent > 0) {
      combinedRent = unitRent;
    }

    const sub = r.suburb_lower;
    const st = r.state || 'VIC';

    await pool.query(
      `UPDATE suburb_metrics SET
        median_unit_rent = $1,
        median_rent = COALESCE($2, median_rent),
        median_rent_source = COALESCE($3, median_rent_source),
        updated_at = NOW()
      WHERE LOWER(suburb) = $4 AND state = $5`,
      [estRent, combinedRent, estSource, sub, st]
    );
  }

  // Verify
  const { rows: stats } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE median_unit_rent IS NOT NULL) AS with_unit_rent,
      COUNT(*) FILTER (WHERE median_rent IS NOT NULL) AS with_combined_rent,
      COUNT(*) AS total
    FROM suburb_metrics
  `);
  console.log(`[unit-rent] Done`);
  console.log(`  Tier0 (yield): ${tier0} | Tier1 (DFFH): ${tier1} | Tier2 (ratio): ${tier2} | Skipped: ${skipped}`);
  console.log(`  Unit rent filled: ${stats[0].with_unit_rent} | Combined rent: ${stats[0].with_combined_rent}`);

  // Sample check
  const { rows: samples } = await pool.query(`
    SELECT LOWER(suburb) AS s, median_unit_price, gross_yield, median_unit_rent, median_rent, median_rent_source
    FROM suburb_metrics
    WHERE LOWER(suburb) = ANY($1::text[])
  `, [["doncaster", "brighton", "sunshine", "footscray", "tarneit"]]);
  console.log("\nSamples:");
  for (const s of samples) {
    console.log(`  ${s.s}: unit_rent=$${s.median_unit_rent}/wk (src=${s.median_rent_source}) | combined=$${s.median_rent}`);
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
