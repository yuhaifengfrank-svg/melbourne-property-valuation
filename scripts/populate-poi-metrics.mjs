/**
 * scripts/populate-poi-metrics.mjs
 *
 * ETL: For each VIC suburb in suburb_metrics:
 *   1. Get centroid from school_locations
 *   2. Query Overpass API for POI counts (8 categories)
 *   3. Compute normalized scores (0-100)
 *   4. Store in suburb_metrics: poi_*_score, poi_composite_score, poi_total_count
 *
 * Run: node scripts/populate-poi-metrics.mjs
 * Time: ~(suburbs × query_time + 2s delay) for ~230 suburbs ≈ 75-90 min
 * Safety: Rate-limited with 2s delay between queries + 3 retries per suburb
 */

import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { fetchPoiCounts, computePoiScores } from '../lib/poi-service.js';

const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });

const BATCH_SIZE = 50;  // checkpoint every N suburbs
const QUERY_DELAY_MS = 2500; // 2.5s between queries (rate limit politeness)

async function q(text, params) {
  if (params && params.length > 0) return sql.query(text, params);
  return sql.query(text, []);
}

async function main() {
  console.log('[populate-poi] Starting POI metrics population...');
  console.log(`[populate-poi] Categories: ${Object.keys((await import('../lib/poi-service.js')).POI_CATEGORIES).join(', ')}`);
  console.log('');

  // Step 1: Get all VIC suburb_metrics with centroids
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
      AND EXISTS (
        SELECT 1 FROM school_locations
        WHERE LOWER(suburb) = LOWER(sm.suburb) AND state = 'VIC' AND latitude IS NOT NULL
      )
    ORDER BY sm.suburb
  `);

  console.log(`[populate-poi] Found ${suburbs.length} VIC suburbs with centroids`);

  let success = 0;
  let failed = 0;
  let skipped = 0;
  let totalPois = 0;
  let lastCheckpoint = 0;

  for (let i = 0; i < suburbs.length; i++) {
    const s = suburbs[i];
    const suburbName = s.suburb;
    const lat = parseFloat(s.lat);
    const lon = parseFloat(s.lon);

    // Skip if already populated (has poi_total_count)
    const existing = await q(
      `SELECT poi_total_count FROM suburb_metrics WHERE LOWER(suburb) = LOWER($1) AND state = 'VIC'`,
      [suburbName]
    );
    if (existing.length > 0 && existing[0].poi_total_count !== null) {
      skipped++;
      if ((i + 1) % 20 === 0) {
        process.stdout.write('.');
        if ((i + 1) % 100 === 0) console.log(` ${i + 1}/${suburbs.length}`);
      }
      continue;
    }

    try {
      const result = await fetchPoiCounts(lat, lon);
      const scored = computePoiScores(result.counts);

      // Write to DB
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

      process.stdout.write('✓');
      if ((i + 1) % 20 === 0) {
        console.log(` ${i + 1}/${suburbs.length} (${success} done, ${failed} fail, ${skipped} skip)`);
      }

      // Checkpoint: log summary every BATCH_SIZE new suburbs
      if (success > 0 && success % BATCH_SIZE === 0) {
        const avgPoi = Math.round(totalPois / success);
        console.log(`[checkpoint] ${success} suburbs done. Avg POIs/suburb: ${avgPoi}`);
        lastCheckpoint = success;
      }
    } catch (err) {
      failed++;
      process.stdout.write('✗');
      if (failed <= 3) {
        console.warn(`\n[populate-poi] Failed for ${suburbName} (${lat}, ${lon}): ${err.message}`);
      } else if (failed === 4) {
        console.warn(`\n[populate-poi] Additional failures suppressed...`);
      }
    }

    // Rate limiting delay between suburbs
    if (i < suburbs.length - 1) {
      await new Promise(r => setTimeout(r, QUERY_DELAY_MS));
    }
  }

  // Final summary
  console.log('');
  console.log('══════════════════════════════════════════');
  console.log(`[populate-poi] FINAL SUMMARY`);
  console.log(`  Total suburbs processed: ${suburbs.length}`);
  console.log(`  Successfully populated: ${success}`);
  console.log(`  Already had data (skipped): ${skipped}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Avg POIs/suburb: ${success > 0 ? Math.round(totalPois / success) : 'N/A'}`);
  console.log('══════════════════════════════════════════');

  // Show top 10 by composite POI score
  if (success > 0) {
    console.log('');
    console.log('Top 10 suburbs by POI composite:');
    const top10 = await q(`
      SELECT suburb, poi_composite_score, poi_total_count
      FROM suburb_metrics
      WHERE state = 'VIC' AND poi_composite_score IS NOT NULL
      ORDER BY poi_composite_score DESC
      LIMIT 10
    `);
    const pad = (s, n) => (s + '        ').slice(0, n);
    for (const r of top10) {
      console.log(`  ${pad(r.suburb, 20)} ${r.poi_composite_score?.toFixed(1) || 'N/A'}  (${r.poi_total_count} POIs)`);
    }

    console.log('');
    console.log('Bottom 10 suburbs by POI composite:');
    const bottom10 = await q(`
      SELECT suburb, poi_composite_score, poi_total_count
      FROM suburb_metrics
      WHERE state = 'VIC' AND poi_composite_score IS NOT NULL
      ORDER BY poi_composite_score ASC
      LIMIT 10
    `);
    for (const r of bottom10) {
      console.log(`  ${pad(r.suburb, 20)} ${r.poi_composite_score?.toFixed(1) || 'N/A'}  (${r.poi_total_count} POIs)`);
    }
  }

  console.log('');  
  console.log('[populate-poi] Done.');
  process.exit(failed > 10 ? 1 : 0);
}

main().catch(err => {
  console.error('[populate-poi] Fatal error:', err);
  process.exit(1);
});
