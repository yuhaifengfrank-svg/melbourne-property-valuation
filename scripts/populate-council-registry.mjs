/**
 * scripts/populate-council-registry.mjs
 *
 * Phase 1: Populate council_registry from existing data sources.
 *
 * Steps:
 *   1. Extract unique LGAs from school_locations (lga_code, lga_name)
 *   2. Aggregate ABS Census 2021 population by LGA via SA2→LGA mapping
 *   3. Count distinct suburbs per LGA
 *   4. Classify councils as Metro/Interface/Regional/Rural
 *   5. Write to council_registry
 *
 * Area data from Vicmap Admin (LGA boundaries) is sourced separately.
 * We compute it offline and can update via later ETL runs.
 *
 * Run: node scripts/populate-council-registry.mjs
 * Safety: UPSERT only — never deletes rows
 */

import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });

// Council classification map — keyed by lga_code
// Sources: Victorian Government department classification
const METRO_LGAS = new Set([
  '24600', // Melbourne
  '20660', // Banyule
  '20910', // Bayside (Vic.)
  '21110', // Boroondara
  '21180', // Brimbank
  '21890', // Darebin
  '22170', // Frankston
  '22310', // Glen Eira
  '22670', // Greater Dandenong
  '23110', // Hobsons Bay
  '23270', // Hume
  '23430', // Kingston (Vic.)
  '23670', // Knox
  '24210', // Manningham
  '24330', // Maribyrnong
  '24410', // Maroondah
  '24650', // Melton
  '24700', // Merri-bek
  '24970', // Monash
  '25060', // Moonee Valley
  '25340', // Mornington Peninsula
  '25710', // Nillumbik
  '25900', // Port Phillip
  '26350', // Stonnington
  '26980', // Whitehorse
  '27070', // Whittlesea
  '27260', // Wyndham
  '27350', // Yarra
  '27450', // Yarra Ranges
  '24650', // Melton (Interface)
]);

// Region map — simplified VIC regions
const REGION_MAP = {
  // Greater Melbourne
  '20660': 'Melbourne', '20910': 'Melbourne', '21110': 'Melbourne',
  '21180': 'Melbourne', '21450': 'Melbourne', '21610': 'Melbourne',
  '21890': 'Melbourne', '22170': 'Melbourne', '22310': 'Melbourne',
  '22670': 'Melbourne', '23110': 'Melbourne', '23270': 'Melbourne',
  '23430': 'Melbourne', '23670': 'Melbourne', '24210': 'Melbourne',
  '24330': 'Melbourne', '24410': 'Melbourne', '24600': 'Melbourne',
  '24650': 'Melbourne', '24700': 'Melbourne', '24970': 'Melbourne',
  '25060': 'Melbourne', '25340': 'Melbourne', '25710': 'Melbourne',
  '25900': 'Melbourne', '26350': 'Melbourne', '26980': 'Melbourne',
  '27070': 'Melbourne', '27260': 'Melbourne', '27350': 'Melbourne',
  '27450': 'Melbourne',
  
  // Barwon South West
  '20570': 'Barwon South West', '21750': 'Barwon South West',
  '22410': 'Barwon South West', '22490': 'Barwon South West',
  '22750': 'Barwon South West', '25150': 'Barwon South West',
  '25340': 'Barwon South West', '25430': 'Barwon South West',
  '25490': 'Barwon South West', '25990': 'Barwon South West',
  '26080': 'Barwon South West', '26170': 'Barwon South West',
  '26260': 'Barwon South West', '26490': 'Barwon South West',
  '26730': 'Barwon South West',
  
  // Grampians
  '20260': 'Grampians', '21670': 'Grampians', '22490': 'Grampians',
  '22910': 'Grampians', '22980': 'Grampians', '23190': 'Grampians',
  '24130': 'Grampians', '25810': 'Grampians', '26890': 'Grampians',
  '27630': 'Grampians',
  
  // Loddon Mallee
  '21270': 'Loddon Mallee', '21370': 'Loddon Mallee',
  '22250': 'Loddon Mallee', '22620': 'Loddon Mallee',
  '23940': 'Loddon Mallee', '24780': 'Loddon Mallee',
  '26610': 'Loddon Mallee', '24850': 'Loddon Mallee',
  
  // Hume
  '21010': 'Hume', '22830': 'Hume', '23350': 'Hume',
  '24250': 'Hume', '24900': 'Hume', '25620': 'Hume',
  '26430': 'Hume', '26670': 'Hume', '26700': 'Hume',
  '27170': 'Hume',
  
  // Gippsland
  '20740': 'Gippsland', '20830': 'Gippsland', '22110': 'Gippsland',
  '23810': 'Gippsland', '26810': 'Gippsland',
};

function classifyCouncil(lgaCode, lgaName, population) {
  // Explicitly classify
  if (METRO_LGAS.has(lgaCode)) {
    const innerMetro = new Set(['24600', '20660', '21110', '21890', '22310', '23110', '23430',
      '24330', '24700', '24970', '25060', '25900', '26350', '26980', '27350']);
    if (innerMetro.has(lgaCode)) return 'Metropolitan';
    return 'Interface';  // growing fringe
  }
  if (population > 100000) return 'Regional';
  return 'Rural';
}

async function main() {
  console.log('[council-registry] Phase 1: Building council registry from existing data...\n');

  // Step 1: Get distinct LGA codes/names from school_locations
  const lgaData = await sql`
    SELECT lga_code, lga_name, 
      COUNT(DISTINCT suburb) AS suburb_count
    FROM school_locations
    WHERE lga_code IS NOT NULL AND lga_code != '29399'  -- exclude Unincorporated Vic
      AND state = 'VIC'
    GROUP BY lga_code, lga_name
    ORDER BY lga_name
  `;
  console.log(`[council-registry] Found ${lgaData.length} LGAs from school_locations\n`);

  // Step 2: Build SA2→LGA mapping (distinct)
  // Step 3: Aggregate population per LGA
  const popData = await sql`
    WITH sa2_lga AS (
      SELECT DISTINCT sa2_code::text AS sa2_code, lga_code, lga_name
      FROM school_locations
      WHERE sa2_code IS NOT NULL AND lga_code IS NOT NULL AND lga_code != '29399'
        AND state = 'VIC'
    )
    SELECT sl.lga_code, 
      SUM(CAST(c.g01->>'Tot_P_P' AS INTEGER)) AS population_2021,
      COUNT(DISTINCT sl.sa2_code) AS num_sa2
    FROM sa2_lga sl
    JOIN census_sa2_data c ON c.sa2_code = sl.sa2_code
    WHERE c.g01 IS NOT NULL
    GROUP BY sl.lga_code
  `;
  console.log(`[council-registry] Aggregated population for ${popData.length} LGAs\n`);

  // Build lookup
  const popMap = {};
  for (const p of popData) {
    popMap[p.lga_code] = p.population_2021;
  }

  // Step 4: Write each LGA to council_registry (UPSERT)
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const lga of lgaData) {
    const code = lga.lga_code;
    const name = lga.lga_name;
    const pop = popMap[code] || null;
    const councilType = classifyCouncil(code, name, pop);
    const region = REGION_MAP[code] || 'Unknown';

    try {
      await sql`
        INSERT INTO council_registry 
          (lga_code, lga_name, state, population_2021, suburb_count, council_type, region, census_data_year)
        VALUES 
          (${code}, ${name}, 'VIC', ${pop}, ${lga.suburb_count}, ${councilType}, ${region}, 2021)
        ON CONFLICT (lga_code) DO UPDATE SET
          lga_name = EXCLUDED.lga_name,
          population_2021 = EXCLUDED.population_2021,
          suburb_count = EXCLUDED.suburb_count,
          council_type = EXCLUDED.council_type,
          region = EXCLUDED.region,
          census_data_year = EXCLUDED.census_data_year,
          updated_at = NOW()
      `;
      
      inserted++;
      process.stdout.write('✓');
    } catch (err) {
      skipped++;
      process.stdout.write('✗');
      if (skipped <= 3) {
        console.error(`\n  [error] ${name} (${code}): ${err.message}`);
      }
    }

    if ((inserted + skipped) % 20 === 0) {
      console.log(` ${inserted + skipped}/${lgaData.length}`);
    }
  }

  console.log(`\n\n[council-registry] Results:`);
  console.log(`  Inserted/Updated: ${inserted}`);
  console.log(`  Skipped:          ${skipped}`);
  console.log(`  Total LGAs:       ${lgaData.length}`);

  // Summary
  if (inserted > 0) {
    const types = await sql`
      SELECT council_type, COUNT(*) AS cnt FROM council_registry GROUP BY council_type ORDER BY cnt DESC
    `;
    console.log('\n  Council type distribution:');
    for (const t of types) {
      console.log(`    ${t.council_type}: ${t.cnt}`);
    }

    console.log('\n  Top 10 councils by population:');
    const top10 = await sql`
      SELECT lga_name, population_2021, suburb_count, council_type, region
      FROM council_registry
      ORDER BY population_2021 DESC NULLS LAST
      LIMIT 10
    `;
    const pad = (s, n) => (s + '                ').slice(0, n);
    for (const r of top10) {
      console.log(`    ${pad(r.lga_name, 25)} ${r.population_2021?.toLocaleString() || 'N/A'} (${r.suburb_count} suburbs, ${r.council_type})`);
    }
  }

  console.log('\n[council-registry] Phase 1 complete.');
  process.exit(0);
}

main().catch(err => {
  console.error('[council-registry] Fatal error:', err);
  process.exit(1);
});
