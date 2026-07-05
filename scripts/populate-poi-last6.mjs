/**
 * Final 6 POI suburbs — uses curl POST
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { execSync } from 'child_process';

const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
const CATS = ['healthcare','shopping','recreation','dining','transit','education','fitness','public_services'];
const BENCH = { healthcare:30, shopping:15, recreation:20, dining:40, transit:5, education:10, fitness:5, public_services:6 };
const W = { healthcare:0.20, shopping:0.15, recreation:0.15, dining:0.10, transit:0.15, education:0.10, fitness:0.05, public_services:0.10 };

function ql(lat,lon) {
  return `[out:json][timeout:20];
node["amenity"~"^(hospital|clinic|pharmacy)$"](around:3000,${lat},${lon})->.a;
node["shop"~"^(supermarket|mall|convenience|department_store)$"](around:2000,${lat},${lon})->.b;
node["leisure"~"^(park|playground|sports_centre|garden|nature_reserve)$"](around:2000,${lat},${lon})->.c;
node["amenity"~"^(restaurant|cafe|pub|bar|fast_food)$"](around:2000,${lat},${lon})->.d;
node["railway"="station"](around:2000,${lat},${lon})->.e;
node["amenity"~"^(kindergarten|library|college|university)$"](around:3000,${lat},${lon})->.f;
node["leisure"~"^(swimming_pool|fitness_centre)$"](around:3000,${lat},${lon})->.g;
node["amenity"~"^(police|fire_station|post_office|townhall|community_centre)$"](around:3000,${lat},${lon})->.h;
.a out count;.b out count;.c out count;.d out count;.e out count;.f out count;.g out count;.h out count;`;
}

async function query(lat,lon) {
  const q = ql(lat,lon).replace(/'/g, `'\\''`);
  const out = execSync(`echo '${q}' | curl -s --max-time 25 -X POST -d @- 'https://overpass-api.de/api/interpreter'`, { encoding:'utf-8', timeout:30000, shell:true });
  return JSON.parse(out);
}

async function main() {
  const missing = await sql\`SELECT suburb,
    (SELECT AVG(sl.latitude)::numeric(10,5) FROM school_locations sl WHERE LOWER(TRIM(sl.suburb))=LOWER(TRIM(sm.suburb)) AND sl.state='VIC' AND sl.latitude IS NOT NULL) AS lat,
    (SELECT AVG(sl.longitude)::numeric(11,6) FROM school_locations sl WHERE LOWER(TRIM(sl.suburb))=LOWER(TRIM(sm.suburb)) AND sl.state='VIC' AND sl.longitude IS NOT NULL) AS lon
  FROM suburb_metrics sm WHERE state='VIC' AND poi_total_count IS NULL ORDER BY suburb\`;
  console.log('Processing ' + missing.length + ' suburbs...');
  
  for (const s of missing) {
    const lat = parseFloat(s.lat), lon = parseFloat(s.lon);
    try {
      const data = await query(lat,lon);
      const counts = {};
      let total = 0;
      for (let i = 0; i < Math.min((data.elements||[]).length, CATS.length); i++) {
        const el = data.elements[i];
        const c = el.type==='count' && el.tags ? parseInt(el.tags.total||el.tags.nodes||'0',10) : 0;
        counts[CATS[i]] = c; total += c;
      }
      const scores = {}; let ws = 0, tw = 0;
      for (const [cat,def] of Object.entries({...BENCH})) {
        const ct = counts[cat]||0, ratio = ct / BENCH[cat], sc = Math.min(Math.round(Math.min(ratio,1.5)*66.7),100);
        scores['poi_'+cat+'_score'] = sc; ws += sc * W[cat]; tw += W[cat];
      }
      const composite = tw > 0 ? Math.min(Math.round(ws/tw),100) : 0;
      await sql\`UPDATE suburb_metrics SET poi_healthcare_score=\${scores.poi_healthcare_score}, poi_shopping_score=\${scores.poi_shopping_score}, poi_recreation_score=\${scores.poi_recreation_score}, poi_dining_score=\${scores.poi_dining_score}, poi_transit_score=\${scores.poi_transit_score}, poi_education_score=\${scores.poi_education_score}, poi_fitness_score=\${scores.poi_fitness_score}, poi_public_services_score=\${scores.poi_public_services_score}, poi_composite_score=\${composite}, poi_total_count=\${total}, updated_at=NOW() WHERE LOWER(suburb)=LOWER(\${s.suburb}) AND state='VIC'\`;
      console.log('  ✓ ' + s.suburb + ' (' + total + ' POIs, score ' + composite + ')');
    } catch(e) { console.log('  ✗ ' + s.suburb + ': ' + e.message.substring(0,60)); }
  }

  const r = await sql\`SELECT COUNT(*) FILTER (WHERE poi_total_count IS NOT NULL)::int AS yes, COUNT(*) FILTER (WHERE poi_total_count IS NULL)::int AS no FROM suburb_metrics WHERE state='VIC'\`;
  console.log('\\nFinal: ' + r[0].yes + '/247 done, ' + r[0].no + ' missing');
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
