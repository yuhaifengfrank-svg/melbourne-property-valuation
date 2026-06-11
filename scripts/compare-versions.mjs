import { getSql, ensureSchema } from '../api/_db.js';

async function compare() {
  const sql = getSql();
  await ensureSchema(sql);

  // Pick a few suburbs and compare all columns between the two versions
  const suburbs = ['werribee', 'ferntree gully', 'elsternwick'];
  for (const sub of suburbs) {
    const rows = await sql`
      SELECT * FROM suburb_metrics WHERE LOWER(suburb) = ${sub}
      ORDER BY overall_confidence DESC NULLS LAST
    `;
    console.log(`\n=== ${sub} ===`);
    if (rows.length < 2) { console.log('  Only 1 row, skipping comparison'); continue; }
    const r1 = rows[0]; // has confidence
    const r2 = rows[1]; // null confidence
    
    const diff = [];
    for (const [k, v1] of Object.entries(r1)) {
      const v2 = r2[k];
      if (String(v1) !== String(v2)) {
        diff.push(`  ${k}: '${v1}' vs '${v2}'`);
      }
    }
    console.log(`Differences (${diff.length}):`);
    for (const d of diff) console.log(d);
    
    // Key question: is the null-confidence row useful for anything the other row lacks?
    const onlyInNull = [];
    for (const [k, v2] of Object.entries(r2)) {
      const v1 = r1[k];
      if (v2 !== null && v2 !== undefined && v2 !== '' && (v1 === null || v1 === undefined || v1 === '')) {
        onlyInNull.push(`${k}: '${v2}'`);
      }
    }
    if (onlyInNull.length > 0) {
      console.log(`\nData ONLY in null-confidence row:`);
      for (const d of onlyInNull) console.log(d);
    } else {
      console.log(`\nNo unique data in null-confidence row — it's a strict subset`);
    }
  }

  await sql.end({ timeout: 3 });
  process.exit(0);
}

compare().catch(e => { console.error(e); process.exit(1); });
