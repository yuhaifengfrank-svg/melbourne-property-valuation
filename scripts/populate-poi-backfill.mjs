/**
 * scripts/populate-poi-backfill.mjs
 *
 * Focused POI backfill for remaining suburbs without any POI data.
 * Handles both school_locations and Nominatim geocoding fallback.
 *
 * Run: node scripts/populate-poi-backfill.mjs
 * Time: ~(count × 3s query + 2.5s delay) ≈ 8-10 min for 57 suburbs
 */

import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { fetchPoiCounts, computePoiScores } from '../lib/poi-service.js';

const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
const QUERY_DELAY_MS = 2500;

// Suburbs without coords in school_locations — need Nominatim geocoding
const COORD_MAP = {
  'balaclava': [-37.8690, 144.9944],
  'blairgowrie': [-38.3600, 144.7600],
  'eaglemont': [-37.7640, 145.0650],
  'gowanbrae': [-37.7000, 144.9000],
  'heatherton': [-37.9630, 145.0780],
  'heidelberg heights': [-37.7460, 145.0530],
  'huntingdale': [-37.9070, 145.1040],
  'keilor park': [-37.7440, 144.8350],
  'mccrae': [-38.3520, 144.9300],
  'narre warren east': [-38.0100, 145.3300],
  'notting hill': [-37.9050, 145.1280],
  'officer south': [-38.1000, 145.4500],
  'portsea': [-38.3200, 144.7100],
  'safety beach': [-38.3200, 144.7300],
};

async function main() {
  console.log(`[poi-backfill] Starting at ${new Date().toISOString()}\n`);

  // Get suburbs with NO POI data at all
  const suburbs = await sql`
    SELECT sm.suburb,
      (SELECT ROUND(AVG(sl.latitude)::numeric, 5) FROM school_locations sl
       WHERE LOWER(TRIM(sl.suburb)) = LOWER(TRIM(sm.suburb)) AND sl.state='VIC' AND sl.latitude IS NOT NULL) AS lat,
      (SELECT ROUND(AVG(sl.longitude)::numeric, 6) FROM school_locations sl
       WHERE LOWER(TRIM(sl.suburb)) = LOWER(TRIM(sm.suburb)) AND sl.state='VIC' AND sl.longitude IS NOT NULL) AS lon
    FROM suburb_metrics sm
    WHERE sm.state='VIC' AND sm.poi_total_count IS NULL
    ORDER BY sm.suburb
  `;

  console.log(`[poi-backfill] ${suburbs.length} suburbs need POI data\n`);

  if (suburbs.length === 0) {
    console.log('[poi-backfill] Nothing to do. Exiting.');
    process.exit(0);
  }

  let success = 0;
  let failed = 0;
  let totalPois = 0;
  let nomUsed = 0;
  const startTime = Date.now();

  for (let i = 0; i < suburbs.length; i++) {
    const s = suburbs[i];
    const suburbName = s.suburb;
    const suburbKey = suburbName.toLowerCase();

    // Get coords — school_locations first, then manual map
    let lat = s.lat ? parseFloat(s.lat) : null;
    let lon = s.lon ? parseFloat(s.lon) : null;

    if (!lat || !lon) {
      // Try manual coord map
      const manualCoords = COORD_MAP[suburbKey];
      if (manualCoords) {
        // Use Nominatim-style geocoding instead
        const encoded = encodeURIComponent(suburbName + ', VIC, Australia');
        try {
          const resp = await fetch(`https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`, {
            headers: { 'User-Agent': 'AusHomeValue/1.0 (data-pipeline)' }
          });
          const data = await resp.json();
          if (data.length > 0) {
            lat = parseFloat(data[0].lat);
            lon = parseFloat(data[0].lon);
            nomUsed++;
            // Small delay for Nominatim rate limit
            await new Promise(r => setTimeout(r, 1000));
          } else {
            // Fallback to manual coordinates
            lat = manualCoords[0];
            lon = manualCoords[1];
          }
        } catch (e) {
          // Fallback
          lat = manualCoords[0];
          lon = manualCoords[1];
        }
      } else {
        // Try Nominatim
        try {
          const encoded = encodeURIComponent(suburbName + ', VIC, Australia');
          const resp = await fetch(`https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`, {
            headers: { 'User-Agent': 'AusHomeValue/1.0 (data-pipeline)' }
          });
          const data = await resp.json();
          if (data.length > 0) {
            lat = parseFloat(data[0].lat);
            lon = parseFloat(data[0].lon);
            nomUsed++;
            await new Promise(r => setTimeout(r, 1000));
          }
        } catch (e) {
          // Can't get coords, skip
        }
      }
    }

    if (!lat || !lon) {
      failed++;
      process.stdout.write('❓');
      continue;
    }

    try {
      const result = await fetchPoiCounts(lat, lon);
      const scored = computePoiScores(result.counts);

      const update = await sql`
        UPDATE suburb_metrics SET
          poi_healthcare_score = ${scored.scores.poi_healthcare_score},
          poi_shopping_score = ${scored.scores.poi_shopping_score},
          poi_recreation_score = ${scored.scores.poi_recreation_score},
          poi_dining_score = ${scored.scores.poi_dining_score},
          poi_transit_score = ${scored.scores.poi_transit_score},
          poi_education_score = ${scored.scores.poi_education_score},
          poi_fitness_score = ${scored.scores.poi_fitness_score},
          poi_public_services_score = ${scored.scores.poi_public_services_score},
          poi_composite_score = ${scored.composite},
          poi_total_count = ${result.total},
          updated_at = NOW()
        WHERE LOWER(suburb) = LOWER(${suburbName}) AND state = 'VIC'
      `;

      success++;
      totalPois += result.total;
      process.stdout.write('✓');
    } catch (err) {
      failed++;
      process.stdout.write('✗');
      if (failed <= 3) {
        console.log(`\n[poi-backfill] FAILED ${suburbName} (${lat}, ${lon}): ${err.message.substring(0, 80)}`);
      }
    }

    // Progress report
    if ((i + 1) % 20 === 0 || i === suburbs.length - 1) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(` ${i + 1}/${suburbs.length} (${success} ok, ${failed} fail, ${nomUsed} nom) [${elapsed}s]`);
    }

    // Rate limiting
    if (i < suburbs.length - 1) {
      await new Promise(r => setTimeout(r, QUERY_DELAY_MS));
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const elapsedMin = Math.round(elapsed / 60);

  console.log('\n' + '═'.repeat(50));
  console.log(`[poi-backfill] FINAL — ${success} done, ${failed} fail`);
  console.log(`  Time: ${elapsedMin}m ${elapsed % 60}s`);
  console.log(`  Nominatim geocodes: ${nomUsed}`);
  console.log(`  Avg POIs: ${success > 0 ? Math.round(totalPois / success) : 'N/A'}`);

  // Verify DB
  const state = await sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE poi_total_count IS NOT NULL) AS with_poi,
           COUNT(*) FILTER (WHERE poi_total_count IS NULL) AS no_poi,
           ROUND(AVG(poi_composite_score)::numeric, 1) AS avg_score
    FROM suburb_metrics WHERE state = 'VIC'
  `;
  console.log(`\n  Final DB state: ${state[0].with_poi}/${state[0].total} with POI, ${state[0].no_poi} missing`);
  console.log(`  Average composite score: ${state[0].avg_score}`);

  process.exit(failed > 10 ? 1 : 0);
}

main().catch(e => {
  console.error('[poi-backfill] Fatal:', e.message);
  process.exit(1);
});
