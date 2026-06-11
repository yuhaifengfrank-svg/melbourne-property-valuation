import { getSql, ensureSchema } from '../api/_db.js';

async function verify() {
  const sql = getSql();
  await ensureSchema(sql);
  
  // Check: which 8 suburbs are we missing?
  const pages = ['Aireys Inlet','Anglesea','Barwon Heads','Lorne','Point Lonsdale','Portsea','Queenscliff','Sorrento'];
  
  for (const p of pages) {
    const rows = await sql`
      SELECT suburb, overall_confidence, scoring_version, opportunity_score, opportunity_type, gross_yield, vacancy_rate, median_house_price, updated_at::text
      FROM suburb_metrics WHERE LOWER(suburb) = ${p.toLowerCase()}
    `;
    console.log(`\n=== ${p} (${rows.length} rows) ===`);
    for (const r of rows) console.log(JSON.stringify(r));
  }
  
  // These resort towns might have been duplicate pairs where the lowercase one was the better one
  // Let me check by looking at the fallback tiers - lower = better tier
  const resorts = ['aireys inlet','anglesea','barwon heads','lorne','point lonsdale','portsea','queenscliff','sorrento'];
  for (const r of resorts) {
    // Check the deleted row data (can't recover, but let's see what remains)
    const remaining = await sql`
      SELECT suburb, overall_confidence, fallback_tier_price, fallback_tier_growth, fallback_tier_yield, govt_5yr_cagr, gross_yield, score_version
      FROM suburb_metrics WHERE LOWER(suburb) = ${r}
    `;
    console.log(`\n${r}: ${remaining.length} row(s)`);
    for (const row of remaining) console.log(`  conf=${row.overall_confidence} price_tier=${row.fallback_tier_price} yield=${row.gross_yield}`);
  }
  
  // Count total
  const total = await sql`SELECT COUNT(*) AS c FROM suburb_metrics`;
  console.log(`\nTotal rows: ${total[0].c}`);
  console.log(`Pages: 238`);
  console.log(`Missing: ${238 - total[0].c}`);

  await sql.end({ timeout: 3 });
  process.exit(0);
}

verify().catch(e => { console.error(e); process.exit(1); });
