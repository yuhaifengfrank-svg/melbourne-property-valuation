/**
 * scripts/populate-suburb-council.mjs
 *
 * Map each suburb in suburb_metrics to its LGA council.
 * Uses school_locations (ACARA) for the primary mapping,
 * with manual overrides for suburbs without school records.
 *
 * Run: node scripts/populate-suburb-council.mjs
 * Safety: idempotent UPSERT on council_lga_code
 */

import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });

// Manual mappings for suburbs not present in school_locations
const MANUAL_MAP = {
  'balaclava': '25900',       // Port Phillip
  'blairgowrie': '25340',     // Mornington Peninsula
  'eaglemont': '20660',        // Banyule
  'gowanbrae': '24700',       // Merri-bek
  'heatherton': '20910',      // Bayside (Vic.)
  'heidelberg heights': '20660', // Banyule
  'huntingdale': '24970',     // Monash
  'keilor park': '21180',     // Brimbank
  'mccrae': '25340',          // Mornington Peninsula
  'narre warren east': '21610', // Casey
  'notting hill': '24970',    // Monash
  'officer south': '21450',   // Cardinia
  'portsea': '25340',         // Mornington Peninsula
  'safety beach': '25340',    // Mornington Peninsula
};

async function main() {
  console.log('[suburb-council] Mapping suburbs to LGAs...\n');

  // Step 1: From school_locations
  const r1 = await sql`
    UPDATE suburb_metrics sm
    SET council_lga_code = sl.lga_code
    FROM (
      SELECT DISTINCT LOWER(TRIM(suburb)) AS suburb_lower, lga_code
      FROM school_locations
      WHERE lga_code IS NOT NULL AND state = 'VIC'
    ) sl
    WHERE LOWER(TRIM(sm.suburb)) = sl.suburb_lower
      AND sm.state = 'VIC'
      AND sm.council_lga_code IS NULL
  `;
  console.log(`  School locations mapping: complete`);

  // Step 2: Manual overrides
  for (const [suburb, lgaCode] of Object.entries(MANUAL_MAP)) {
    await sql`
      UPDATE suburb_metrics 
      SET council_lga_code = ${lgaCode}
      WHERE LOWER(TRIM(suburb)) = LOWER(${suburb}) AND state = 'VIC'
    `;
  }
  console.log(`  Manual overrides: ${Object.keys(MANUAL_MAP).length} suburbs`);

  // Summary
  const stats = await sql`
    SELECT 
      COUNT(*)::int AS total,
      COUNT(council_lga_code)::int AS mapped,
      COUNT(*) FILTER (WHERE council_lga_code IS NULL)::int AS unmapped
    FROM suburb_metrics WHERE state = 'VIC'
  `;
  console.log(`  Result: ${stats[0].mapped}/${stats[0].total} suburbs mapped`);
  
  if (stats[0].unmapped > 0) {
    const unmapped = await sql`
      SELECT suburb FROM suburb_metrics 
      WHERE state = 'VIC' AND council_lga_code IS NULL
      ORDER BY suburb
    `;
    console.log(`  Unmapped: ${unmapped.map(r => r.suburb).join(', ')}`);
  }

  // Per-council counts
  const top = await sql`
    SELECT cr.lga_name, COUNT(sm.suburb)::int AS suburb_count
    FROM suburb_metrics sm
    JOIN council_registry cr ON cr.lga_code = sm.council_lga_code
    WHERE sm.state = 'VIC'
    GROUP BY cr.lga_name
    ORDER BY suburb_count DESC
    LIMIT 10
  `;
  console.log('\n  Top councils by suburb count:');
  for (const r of top) {
    console.log(`    ${r.lga_name}: ${r.suburb_count}`);
  }

  console.log('\n[suburb-council] Done.');
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
