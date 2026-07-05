/**
 * populate-poi-batch.mjs — Batch POI population wrapper
 *
 * Handles the main script execution with:
 *  - Environment loading (.env)
 *  - Checkpoint/resume support (skips already-done)
 *  - Better error reporting for Overpass failures
 *
 * Usage: node scripts/populate-poi-batch.mjs
 */

import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { fetchPoiCounts, computePoiScores } from '../lib/poi-service.js';

const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });

async function q(text, params) {
  if (params && params.length > 0) return sql.query(text, params);
  return sql.query(text, []);
}

const QUERY_DELAY_MS = 5000;     // base delay between queries
const BATCH_CHECKPOINT = 20;
const INITIAL_BACKOFF_MS = 10000; // after a 429, start backing off

async function main() {
  console.log(`[poi-batch] Starting at ${new Date().toISOString()}`);
  console.log(`[poi-batch] Database: connected`);

  // 1. Count current state
  const state = await q(`
    SELECT COUNT(*) as total,
           COUNT(*) FILTER (WHERE poi_total_count IS NOT NULL) as done,
           COUNT(*) FILTER (WHERE poi_total_count IS NULL) as pending
    FROM suburb_metrics WHERE state = 'VIC'
  `);
  console.log(`[poi-batch] State: ${state[0].total} total, ${state[0].done} done, ${state[0].pending} pending`);

  // 2. Get suburbs needing POI data (ordered alphabetically for deterministic resume)
  const suburbs = await q(`
    SELECT sm.suburb,
      (SELECT ROUND(AVG(latitude)::numeric, 5)
       FROM school_locations
       WHERE LOWER(suburb) = LOWER(sm.suburb) AND state = 'VIC' AND latitude IS NOT NULL) AS lat,
      (SELECT ROUND(AVG(longitude)::numeric, 5)
       FROM school_locations
       WHERE LOWER(suburb) = LOWER(sm.suburb) AND state = 'VIC' AND longitude IS NOT NULL) AS lon
    FROM suburb_metrics sm
    WHERE sm.state = 'VIC'
      AND sm.poi_total_count IS NULL
      AND EXISTS (
        SELECT 1 FROM school_locations
        WHERE LOWER(suburb) = LOWER(sm.suburb) AND state = 'VIC' AND latitude IS NOT NULL
      )
    ORDER BY sm.suburb
  `);

  console.log(`[poi-batch] ${suburbs.length} suburbs need POI data`);

  if (suburbs.length === 0) {
    console.log('[poi-batch] Nothing to do. Exiting.');
    process.exit(0);
  }

  let success = 0;
  let failed = 0;
  let totalPois = 0;
  let consecutive429 = 0;
  const startTime = Date.now();

  for (let i = 0; i < suburbs.length; i++) {
    const s = suburbs[i];
    const suburbName = s.suburb;
    const lat = parseFloat(s.lat);
    const lon = parseFloat(s.lon);

    try {
      const result = await fetchPoiCounts(lat, lon);
      const scored = computePoiScores(result.counts);

      await q(`
        UPDATE suburb_metrics SET
          poi_healthcare_score = $1,
          poi_shopping_score = $2,
          poi_recreation_score = $3,
          poi_dining_score = $4,
          poi_transit_score = $5,
          poi_education_score = $6,
          poi_fitness_score = $7,
          poi_public_services_score = $8,
          poi_composite_score = $9,
          poi_total_count = $10,
          updated_at = NOW()
        WHERE LOWER(suburb) = LOWER($11) AND state = 'VIC'
      `, [
        scored.scores.poi_healthcare_score,
        scored.scores.poi_shopping_score,
        scored.scores.poi_recreation_score,
        scored.scores.poi_dining_score,
        scored.scores.poi_transit_score,
        scored.scores.poi_education_score,
        scored.scores.poi_fitness_score,
        scored.scores.poi_public_services_score,
        scored.composite,
        result.total,
        suburbName
      ]);

      success++;
      totalPois += result.total;
      consecutive429 = 0;
      process.stdout.write('✓');
    } catch (err) {
      failed++;
      consecutive429++;
      process.stdout.write('✗');
      if (failed <= 5) {
        console.error(`\n[poi-batch] FAILED ${suburbName} (${lat},${lon}): ${err.message}`);
      } else if (failed === 6) {
        console.error(`\n[poi-batch] Further failures suppressed...`);
      }

      // Exponential backoff on 429s
      if (err.message.includes('429') && consecutive429 > 0) {
        const backoffMs = Math.min(INITIAL_BACKOFF_MS * (1 << (consecutive429 - 1)), 120000);
        console.log(`\n[poi-batch] 429 #${consecutive429}, backing off ${backoffMs}ms...`);
        await new Promise(r => setTimeout(r, backoffMs));
      }
    }

    // Print progress indicators
    if ((i + 1) % 20 === 0) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(` ${i + 1}/${suburbs.length} (${success} done, ${failed} fail) [${elapsed}s]`);
    }

    // Rate limiting delay
    if (i < suburbs.length - 1) {
      await new Promise(r => setTimeout(r, QUERY_DELAY_MS));
    }
  }

  // Final summary
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const elapsedMin = Math.round(elapsed / 60);

  console.log('');
  console.log('══════════════════════════════════════════');
  console.log(`[poi-batch] FINAL SUMMARY`);
  console.log(`  Suburbs processed: ${suburbs.length}`);
  console.log(`  Successfully populated: ${success}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total elapsed: ${elapsedMin}m ${elapsed % 60}s`);
  console.log(`  Avg time/suburb: ${success > 0 ? Math.round(elapsed / suburbs.length) : 'N/A'}s`);
  console.log(`  Avg POIs/suburb: ${success > 0 ? Math.round(totalPois / success) : 'N/A'}`);

  // 3. Final DB state check
  console.log('');
  console.log('[poi-batch] Verifying final DB state...');
  const finalState = await q(`
    SELECT COUNT(*) as total,
           COUNT(*) FILTER (WHERE poi_total_count IS NOT NULL) as with_poi,
           ROUND(AVG(poi_composite_score)::numeric, 1) as avg_score
    FROM suburb_metrics WHERE poi_total_count IS NOT NULL
  `);
  console.log(`  Total suburb_metrics rows with POI: ${finalState[0].with_poi}`);
  console.log(`  Average composite score: ${finalState[0].avg_score}`);
  console.log('');

  // Top 10 by score
  const top10 = await q(`
    SELECT suburb, poi_composite_score, poi_total_count
    FROM suburb_metrics WHERE poi_composite_score IS NOT NULL
    ORDER BY poi_composite_score DESC LIMIT 10
  `);
  console.log('Top 10 by POI composite:');
  for (const r of top10) {
    console.log(`  ${(r.suburb + '        ').slice(0, 20)} ${r.poi_composite_score?.toFixed(1) || 'N/A'}  (${r.poi_total_count} POIs)`);
  }

  console.log('');
  console.log(`[poi-batch] Done at ${new Date().toISOString()}`);
  process.exit(failed > 10 ? 1 : 0);
}

main().catch(err => {
  console.error('[poi-batch] Fatal:', err);
  process.exit(1);
});
