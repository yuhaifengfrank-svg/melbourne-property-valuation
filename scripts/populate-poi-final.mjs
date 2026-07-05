/**
 * scripts/populate-poi-final.mjs
 *
 * Final POI backfill for remaining suburbs — uses curl POST (stdin)
 * to avoid Overpass GET URL encoding issues.
 *
 * Run: node scripts/populate-poi-final.mjs
 */

import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { execSync } from 'child_process';

const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
const DELAY_MS = 1500;

const COORD_MAP = {
  'portsea': [-38.320, 144.710],
  'safety beach': [-38.320, 144.730],
};

const CATEGORIES = ['healthcare', 'shopping', 'recreation', 'dining', 'transit', 'education', 'fitness', 'public_services'];

const POI_CATEGORIES = {
  healthcare: { weight: 0.20, benchmark: 30 },
  shopping: { weight: 0.15, benchmark: 15 },
  recreation: { weight: 0.15, benchmark: 20 },
  dining: { weight: 0.10, benchmark: 40 },
  transit: { weight: 0.15, benchmark: 5 },
  education: { weight: 0.10, benchmark: 10 },
  fitness: { weight: 0.05, benchmark: 5 },
  public_services: { weight: 0.10, benchmark: 6 },
};

function buildOverpassQL(lat, lon) {
  return `[out:json][timeout:25];
  node["amenity"~"^(hospital|clinic|pharmacy)$"](around:3000,${lat},${lon})->.a;
  node["shop"~"^(supermarket|mall|convenience|department_store)$"](around:2000,${lat},${lon})->.b;
  node["leisure"~"^(park|playground|sports_centre|garden|nature_reserve)$"](around:2000,${lat},${lon})->.c;
  node["amenity"~"^(restaurant|cafe|pub|bar|fast_food)$"](around:2000,${lat},${lon})->.d;
  node["railway"="station"](around:2000,${lat},${lon})->.e;
  node["amenity"~"^(kindergarten|library|college|university)$"](around:3000,${lat},${lon})->.f;
  node["leisure"~"^(swimming_pool|fitness_centre)$"](around:3000,${lat},${lon})->.g;
  node["amenity"~"^(police|fire_station|post_office|townhall|community_centre)$"](around:3000,${lat},${lon})->.h;
  .a out count; .b out count; .c out count; .d out count; .e out count; .f out count; .g out count; .h out count;`;
}

async function queryOverpass(lat, lon) {
  const ql = buildOverpassQL(lat, lon).replace(/'/g, "'\\''");
  const stdout = execSync(
    `echo '${ql}' | curl -s --max-time 30 -X POST -d @- 'https://overpass-api.de/api/interpreter'`,
    { encoding: 'utf-8', timeout: 35000, shell: true }
  );
  return JSON.parse(stdout);
}

function parseCounts(data) {
  const elements = data.elements || [];
  const counts = {};
  let total = 0;
  for (let i = 0; i < Math.min(elements.length, CATEGORIES.length); i++) {
    const el = elements[i];
    if (el.type === 'count' && el.tags) {
      const c = parseInt(el.tags.total || el.tags.nodes || '0', 10);
      counts[CATEGORIES[i]] = c;
      total += c;
    } else {
      counts[CATEGORIES[i]] = 0;
    }
  }
  return { counts, total };
}

function computeScores(counts) {
  const scores = {};
  let weightedSum = 0;
  let totalWeight = 0;
  for (const [cat, def] of Object.entries(POI_CATEGORIES)) {
    const count = counts[cat] || 0;
    const ratio = count / def.benchmark;
    const score = Math.round(Math.min(ratio, 1.5) * 66.7);
    scores[`poi_${cat}_score`] = Math.min(score, 100);
    weightedSum += score * def.weight;
    totalWeight += def.weight;
  }
  return { scores, composite: totalWeight > 0 ? Math.min(Math.round(weightedSum / totalWeight), 100) : 0 };
}

async function getFallbackCoords(suburbName) {
  const key = suburbName.toLowerCase();
  if (COORD_MAP[key]) return COORD_MAP[key];
  try {
    const stdout = execSync(
      `curl -s 'https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(suburbName + ', VIC, Australia')}&format=json&limit=1' -H 'User-Agent: AusHomeValue/1.0' --max-time 10`,
      { encoding: 'utf-8', timeout: 12000 }
    );
    const data = JSON.parse(stdout);
    if (data.length > 0) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
  } catch (e) {}
  return null;
}

async function main() {
  console.log(`[poi-final] Starting at ${new Date().toISOString()}`);

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

  console.log(`[poi-final] ${suburbs.length} suburbs need POI data\n`);

  if (suburbs.length === 0) {
    console.log('[poi-final] Nothing to do.');
    process.exit(0);
  }

  let ok = 0, fail = 0, totalPois = 0;
  const start = Date.now();
  const failures = [];

  for (let i = 0; i < suburbs.length; i++) {
    const s = suburbs[i];
    let lat = s.lat ? parseFloat(s.lat) : null;
    let lon = s.lon ? parseFloat(s.lon) : null;

    if (!lat || !lon) {
      const c = await getFallbackCoords(s.suburb);
      if (c) { lat = c[0]; lon = c[1]; }
    }

    if (!lat || !lon) { fail++; failures.push(s.suburb + ':NO_COORDS'); process.stdout.write('❓'); continue; }

    try {
      const data = await queryOverpass(lat, lon);
      const { counts, total } = parseCounts(data);
      const { scores, composite } = computeScores(counts);

      await sql`
        UPDATE suburb_metrics SET
          poi_healthcare_score = ${scores.poi_healthcare_score},
          poi_shopping_score = ${scores.poi_shopping_score},
          poi_recreation_score = ${scores.poi_recreation_score},
          poi_dining_score = ${scores.poi_dining_score},
          poi_transit_score = ${scores.poi_transit_score},
          poi_education_score = ${scores.poi_education_score},
          poi_fitness_score = ${scores.poi_fitness_score},
          poi_public_services_score = ${scores.poi_public_services_score},
          poi_composite_score = ${composite},
          poi_total_count = ${total},
          updated_at = NOW()
        WHERE LOWER(suburb) = LOWER(${s.suburb}) AND state = 'VIC'
      `;
      ok++; totalPois += total;
      process.stdout.write('✓');
    } catch (err) {
      fail++; failures.push(s.suburb + ':' + err.message.substring(0, 40));
      process.stdout.write('✗');
    }

    if ((i + 1) % 6 === 0 || i === suburbs.length - 1) {
      console.log(` ${i+1}/${suburbs.length} (${ok} ok, ${fail} fail) [${Math.round((Date.now()-start)/1000)}s]`);
    }

    if (i < suburbs.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`[poi-final] ${ok} ok, ${fail} fail, ${Math.round((Date.now()-start)/1000/60)}m`);
  
  const state = await sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE poi_total_count IS NOT NULL) AS yes,
           COUNT(*) FILTER (WHERE poi_total_count IS NULL) AS no,
           ROUND(AVG(poi_composite_score)::numeric, 1) AS avg
    FROM suburb_metrics WHERE state = 'VIC'
  `;
  console.log(`  DB: ${state[0].yes}/${state[0].total} done, ${state[0].no} missing, avg ${state[0].avg}`);
  process.exit(fail > 3 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
