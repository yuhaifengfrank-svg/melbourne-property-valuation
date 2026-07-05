/**
 * scripts/populate-poi-fast.mjs
 *
 * Fast POI backfill for remaining suburbs — reduced delay to 1.2s,
 * fewer retries, concurrent processing in batches of 3.
 *
 * Run: node scripts/populate-poi-fast.mjs
 * Time target: ~5 min for 26 suburbs
 */

import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { fetchPoiCounts, computePoiScores } from '../lib/poi-service.js';

const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
const DELAY_MS = 1200;

const COORD_MAP = {
  'officer south': [-38.100, 145.450],
  'portsea': [-38.320, 144.710],
  'safety beach': [-38.320, 144.730],
};

async function getMissingCoords(sql) {
  return await sql`
    SELECT sm.suburb,
      (SELECT ROUND(AVG(sl.latitude)::numeric, 5) FROM school_locations sl
       WHERE LOWER(TRIM(sl.suburb)) = LOWER(TRIM(sm.suburb)) AND sl.state='VIC' AND sl.latitude IS NOT NULL) AS lat,
      (SELECT ROUND(AVG(sl.longitude)::numeric, 6) FROM school_locations sl
       WHERE LOWER(TRIM(sl.suburb)) = LOWER(TRIM(sm.suburb)) AND sl.state='VIC' AND sl.longitude IS NOT NULL) AS lon
    FROM suburb_metrics sm
    WHERE sm.state='VIC' AND sm.poi_total_count IS NULL
    ORDER BY sm.suburb
  `;
}

async function geocodeFallback(suburbName) {
  const key = suburbName.toLowerCase();
  const manual = COORD_MAP[key];
  if (manual) return manual;
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(suburbName + ', VIC, Australia')}&format=json&limit=1`,
      { headers: { 'User-Agent': 'AusHomeValue/1.0 (data-pipeline)' } }
    );
    const data = await resp.json();
    if (data.length > 0) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
  } catch (e) {}
  return null;
}

async function main() {
  console.log(`[poi-fast] Starting at ${new Date().toISOString()}`);

  let suburbs = await getMissingCoords(sql);
  if (suburbs.length === 0) {
    console.log('[poi-fast] Nothing to do.');
    process.exit(0);
  }

  console.log(`[poi-fast] ${suburbs.length} suburbs need POI data`);
  
  const MAX_CONCURRENT = 3;
  const results = [];

  for (let i = 0; i < suburbs.length; i += MAX_CONCURRENT) {
    const batch = suburbs.slice(i, i + MAX_CONCURRENT);
    const tasks = batch.map(async (s) => {
      let lat = s.lat ? parseFloat(s.lat) : null;
      let lon = s.lon ? parseFloat(s.lon) : null;
      
      if (!lat || !lon) {
        const coords = await geocodeFallback(s.suburb);
        if (coords) { lat = coords[0]; lon = coords[1]; }
      }
      
      if (!lat || !lon) return { suburb: s.suburb, ok: false, error: 'NO_COORDS' };
      
      // Retry with short backoff for 429s
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await fetchPoiCounts(lat, lon, { retries: 0 });
          const scored = computePoiScores(result.counts);
          
          await sql`
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
            WHERE LOWER(suburb) = LOWER(${s.suburb}) AND state = 'VIC'
          `;
          
          return { suburb: s.suburb, ok: true, total: result.total, score: scored.composite };
        } catch (err) {
          if (err.message.includes('429') && attempt < 2) {
            await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
            continue;
          }
          return { suburb: s.suburb, ok: false, error: err.message.substring(0, 60) };
        }
      }
      return { suburb: s.suburb, ok: false, error: 'MAX_RETRIES' };
    });
    
    const batchResults = await Promise.all(tasks);
    results.push(...batchResults);
    
    const batchOk = batchResults.filter(r => r.ok).length;
    const batchFail = batchResults.filter(r => !r.ok).length;
    const done = results.filter(r => r.ok).length;
    process.stdout.write(`[${i + batch.length}/${suburbs.length}] ${done} ok, ${batchFail} fail\n`);
    
    if (i + MAX_CONCURRENT < suburbs.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  const success = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  const totalPois = results.filter(r => r.ok).reduce((s, r) => s + r.total, 0);
  
  console.log('\n' + '═'.repeat(50));
  console.log(`[poi-fast] FINAL — ${success} ok, ${failed} fail`);
  console.log(`  Avg POIs: ${success > 0 ? Math.round(totalPois / success) : 'N/A'}`);

  const state = await sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE poi_total_count IS NOT NULL) AS with_poi,
           COUNT(*) FILTER (WHERE poi_total_count IS NULL) AS no_poi,
           ROUND(AVG(poi_composite_score)::numeric, 1) AS avg_score
    FROM suburb_metrics WHERE state = 'VIC'
  `;
  console.log(`  DB: ${state[0].with_poi}/${state[0].total}, avg score ${state[0].avg_score}`);
  process.exit(failed > 10 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
