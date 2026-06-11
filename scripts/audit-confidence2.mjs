import { getSql, ensureSchema } from '../api/_db.js';

async function audit() {
  const sql = getSql();
  await ensureSchema(sql);
  
  // Check duplicates — pick one suburb to understand the pattern
  const werribee = await sql`
    SELECT suburb, overall_confidence, scoring_version, opportunity_score, opportunity_type, updated_at::text
    FROM suburb_metrics 
    WHERE LOWER(suburb) = 'werribee'
    ORDER BY updated_at DESC
  `;
  console.log('=== Werribee both rows ===');
  for (const r of werribee) console.log(JSON.stringify(r));
  
  // scoring_version distribution
  const versions = await sql`
    SELECT COALESCE(scoring_version, 'NULL') as ver, COUNT(*) AS cnt
    FROM suburb_metrics GROUP BY scoring_version
  `;
  console.log('\n=== scoring_version ===');
  for (const r of versions) console.log(`  ${r.ver}: ${r.cnt}`);
  
  // Count total 
  const total = await sql`SELECT COUNT(*) AS c FROM suburb_metrics`;
  console.log(`\nTotal rows: ${total[0].c}`);
  
  // Unique suburbs
  const uniq = await sql`SELECT COUNT(DISTINCT LOWER(suburb)) AS c FROM suburb_metrics`;
  console.log(`Unique suburbs: ${uniq[0].c}`);
  
  // Which suburbs with null confidence have populated factor confidence
  const nullCk = await sql`
    SELECT suburb, overall_confidence, conf_value, conf_growth, conf_yield, conf_vacancy, conf_school
    FROM suburb_metrics WHERE overall_confidence IS NULL LIMIT 5
  `;
  console.log('\n=== NULL confidence rows — do they have factor confidences? ===');
  for (const r of nullCk) console.log(JSON.stringify(r));
  
  // Rows with confidence — same check
  const yesCk = await sql`
    SELECT suburb, overall_confidence, conf_value, conf_growth, conf_yield, conf_vacancy, conf_school
    FROM suburb_metrics WHERE overall_confidence IS NOT NULL LIMIT 5
  `;
  console.log('\n=== NON-NULL confidence rows — factor confidences ===');
  for (const r of yesCk) console.log(JSON.stringify(r));
  
  // Is the null-confidence row from a different scoring run?
  const byUpdated = await sql`
    SELECT DATE(updated_at) AS d, overall_confidence IS NOT NULL AS has_conf, COUNT(*) AS cnt
    FROM suburb_metrics
    GROUP BY d, has_conf
    ORDER BY d, has_conf
  `;
  console.log('\n=== Updated date vs has-confidence ===');
  for (const r of byUpdated) console.log(`  ${r.d} | has_conf=${r.has_conf} | ${r.cnt}`);

  await sql.end({ timeout: 3 });
  process.exit(0);
}

audit().catch(e => { console.error(e); process.exit(1); });
