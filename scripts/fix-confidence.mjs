import { getSql, ensureSchema } from '../api/_db.js';

async function fix() {
  const sql = getSql();
  await ensureSchema(sql);
  
  console.log('=== BEFORE ===');
  const before = await sql`SELECT COUNT(*) AS c FROM suburb_metrics WHERE overall_confidence IS NULL`;
  console.log(`Rows with NULL overall_confidence: ${before[0].c}`);
  
  // 1. Delete v2 rows (lowercase suburb + scoring_version='v2' + null confidence)
  //    These are strict duplicates of opp-2.0.0-beta rows, just with everything NULL
  const delResult = await sql`
    DELETE FROM suburb_metrics
    WHERE scoring_version = 'v2'
      AND overall_confidence IS NULL
  `;
  console.log(`\nDeleted v2 rows: ${delResult.count}`);
  
  // 2. Check if there are any remaining NULL confidence rows
  const remaining = await sql`
    SELECT suburb, overall_confidence, scoring_version
    FROM suburb_metrics
    WHERE overall_confidence IS NULL
  `;
  console.log(`\n=== AFTER ===`);
  console.log(`Remaining NULL confidence rows: ${remaining.length}`);
  for (const r of remaining) console.log(`  ${r.suburb} (${r.scoring_version})`);
  
  // 3. Fix case: ensure all remaining rows have proper casing
  //    (A few may be lowercase with confidence — let's fix them too)
  const caseFix = await sql`
    UPDATE suburb_metrics
    SET suburb = INITCAP(suburb)
    WHERE suburb = LOWER(suburb)
  `;
  console.log(`\nCase-fixed rows: ${caseFix.count}`);
  
  // 4. Final stats
  const after = await sql`SELECT COUNT(*) AS c FROM suburb_metrics WHERE overall_confidence IS NULL`;
  console.log(`\nFinal NULL confidence count: ${after[0].c}`);
  const total = await sql`SELECT COUNT(*) AS c FROM suburb_metrics`;
  console.log(`Total rows: ${total[0].c}`);
  const conf = await sql`SELECT COUNT(*) AS c FROM suburb_metrics WHERE overall_confidence IS NOT NULL`;
  console.log(`Rows with confidence: ${conf[0].c}`);
  
  await sql.end({ timeout: 3 });
  process.exit(0);
}

fix().catch(e => { console.error(e); process.exit(1); });
