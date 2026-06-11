import { getSql, ensureSchema } from '../api/_db.js';

async function fix() {
  const sql = getSql();
  await ensureSchema(sql);
  
  // Check: any remaining lowercase suburbs that need fixing
  const lower = await sql`
    SELECT suburb, state, overall_confidence, scoring_version
    FROM suburb_metrics
    WHERE suburb = LOWER(suburb)
    ORDER BY suburb
  `;
  console.log(`Lowercase suburb rows: ${lower.length}`);
  for (const r of lower) console.log(`  ${r.suburb} (${r.state}, conf=${r.overall_confidence})`);
  
  // Check counts
  const total = await sql`SELECT COUNT(*) AS c FROM suburb_metrics`;
  const hasConf = await sql`SELECT COUNT(*) AS c FROM suburb_metrics WHERE overall_confidence IS NOT NULL`;
  const nullConf = await sql`SELECT COUNT(*) AS c FROM suburb_metrics WHERE overall_confidence IS NULL`;
  console.log(`\nTotal rows: ${total[0].c}`);
  console.log(`With confidence: ${hasConf[0].c}`);
  console.log(`NULL confidence: ${nullConf[0].c}`);
  
  // Can't INITCAP because of PK conflict. Instead, delete the lowercase duplicates
  // that have a proper-cased counterpart
  for (const r of lower) {
    // Check if proper-cased version exists
    const proper = r.suburb.charAt(0).toUpperCase() + r.suburb.slice(1);
    const existing = await sql`
      SELECT suburb FROM suburb_metrics 
      WHERE LOWER(suburb) = LOWER(${r.suburb})
        AND suburb != LOWER(suburb)
      LIMIT 1
    `;
    if (existing.length > 0) {
      console.log(`\nDeleting lowercase duplicate: ${r.suburb} (proper exists as ${existing[0].suburb})`);
      await sql`DELETE FROM suburb_metrics WHERE suburb = ${r.suburb} AND state = ${r.state}`;
    } else {
      // Fix in place — rename to proper case
      console.log(`\nFixing case in place: ${r.suburb} → ${proper}`);
      await sql`UPDATE suburb_metrics SET suburb = ${proper} WHERE suburb = ${r.suburb} AND state = ${r.state}`;
    }
  }
  
  const finalTotal = await sql`SELECT COUNT(*) AS c FROM suburb_metrics`;
  const finalHasConf = await sql`SELECT COUNT(*) AS c FROM suburb_metrics WHERE overall_confidence IS NOT NULL`;
  const finalNullConf = await sql`SELECT COUNT(*) AS c FROM suburb_metrics WHERE overall_confidence IS NULL`;
  console.log(`\n=== FINAL ===`);
  console.log(`Total rows: ${finalTotal[0].c}`);
  console.log(`With confidence: ${finalHasConf[0].c}`);
  console.log(`NULL confidence: ${finalNullConf[0].c}`);

  await sql.end({ timeout: 3 });
  process.exit(0);
}

fix().catch(e => { console.error(e); process.exit(1); });
