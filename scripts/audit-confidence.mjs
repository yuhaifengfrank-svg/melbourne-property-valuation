import { getSql, ensureSchema } from '../api/_db.js';
import { readdirSync } from 'fs';

async function audit() {
  const sql = getSql();
  await ensureSchema(sql);
  
  console.log('=== suburb_metrics AUDIT ===\n');

  // 1. Total rows
  const totalRows = await sql`SELECT COUNT(*) AS c FROM suburb_metrics`;
  console.log(`1. Total rows: ${totalRows[0].c}`);

  // 2. NULL confidence count
  const nullConf = await sql`SELECT COUNT(*) AS c FROM suburb_metrics WHERE overall_confidence IS NULL`;
  const hasConf = await sql`SELECT COUNT(*) AS c FROM suburb_metrics WHERE overall_confidence IS NOT NULL`;
  console.log(`2. overall_confidence NULL: ${nullConf[0].c}`);
  console.log(`   overall_confidence NOT NULL: ${hasConf[0].c}`);

  // 3. Confidence distribution
  const dist = await sql`
    SELECT 
      CASE 
        WHEN overall_confidence >= 80 THEN '80-100'
        WHEN overall_confidence >= 60 THEN '60-79'
        WHEN overall_confidence >= 40 THEN '40-59'
        WHEN overall_confidence >= 20 THEN '20-39'
        WHEN overall_confidence < 20 THEN '0-19'
        ELSE 'NULL'
      END AS bucket,
      COUNT(*) AS cnt
    FROM suburb_metrics
    GROUP BY bucket
    ORDER BY bucket
  `;
  console.log('\n3. Confidence distribution:');
  for (const r of dist) console.log(`   ${r.bucket}: ${r.cnt}`);

  // 4. Static suburb pages count
  const files = readdirSync('./public/suburb').filter(f => f.endsWith('.html'));
  const pageSuburbs = files.map(f => {
    const match = f.match(/^(.+?)-vic\.html$/);
    return match ? match[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null;
  }).filter(Boolean);
  console.log(`\n4. Static suburb HTML pages: ${files.length}`);
  console.log(`   Parsed suburb names: ${pageSuburbs.length}`);

  // 5. All metrics suburbs (lowercase, alpha-only for matching)
  const metricsRows = await sql`SELECT suburb, opportunity_type, overall_confidence, opportunity_score, updated_at FROM suburb_metrics ORDER BY suburb`;
  
  // 6. Pages without matching metrics
  const pageNorm = new Map();
  for (const ps of pageSuburbs) {
    const key = ps.toLowerCase().replace(/[^a-z]/g, '');
    pageNorm.set(key, ps);
  }
  
  const metricsNorm = new Map();
  const metricsByNorm = new Map(); // norm → rows[]
  for (const mr of metricsRows) {
    const key = mr.suburb.toLowerCase().replace(/[^a-z]/g, '');
    if (!metricsByNorm.has(key)) metricsByNorm.set(key, []);
    metricsByNorm.get(key).push(mr);
    metricsNorm.set(key, mr.suburb);
  }

  const pagesMissingMetrics = [];
  for (const [key, name] of pageNorm) {
    if (!metricsByNorm.has(key)) pagesMissingMetrics.push(name);
  }
  console.log(`\n5. Pages WITHOUT metrics row: ${pagesMissingMetrics.length}`);
  for (const s of pagesMissingMetrics) console.log(`   ❌ ${s}`);

  // 7. Extra metrics rows without a page
  const extraMetrics = [];
  const matchedMetrics = [];
  for (const [key, rows] of metricsByNorm) {
    if (!pageNorm.has(key)) {
      extraMetrics.push(...rows);
    } else {
      matchedMetrics.push(...rows);
    }
  }
  console.log(`\n6. Extra metrics rows (no page): ${extraMetrics.length}`);
  for (const r of extraMetrics.slice(0, 20)) {
    console.log(`   ${r.suburb} (type=${r.opportunity_type}, conf=${r.overall_confidence})`);
  }

  // 8. Duplicate suburbs
  const dupes = [];
  for (const [key, rows] of metricsByNorm) {
    if (rows.length > 1) dupes.push({ suburb: rows[0].suburb, count: rows.length, rows });
  }
  console.log(`\n7. Duplicate suburb entries: ${dupes.length}`);
  for (const d of dupes.slice(0, 20)) {
    console.log(`   ${d.suburb} (${d.count} rows):`);
    for (const r of d.rows) {
      console.log(`     - conf=${r.overall_confidence}, type=${r.opportunity_type}, score=${r.opportunity_score}, updated=${r.updated_at}`);
    }
  }

  // 9. Matched pages with NULL confidence
  console.log(`\n8. Active pages with NULL overall_confidence:`);
  const activeNullConf = [];
  for (const [key, rows] of metricsByNorm) {
    if (!pageNorm.has(key)) continue;
    for (const r of rows) {
      if (r.overall_confidence === null) {
        activeNullConf.push({ page: pageNorm.get(key), suburb: r.suburb, type: r.opportunity_type, score: r.opportunity_score });
      }
    }
  }
  console.log(`   Count: ${activeNullConf.length}`);
  for (const p of activeNullConf) console.log(`   ❌ ${p.page} (metric: ${p.suburb}, type: ${p.type})`);

  // 10. NULL confidence by opportunity_type (all rows)
  const nullByType = await sql`
    SELECT opportunity_type, COUNT(*) AS cnt
    FROM suburb_metrics WHERE overall_confidence IS NULL
    GROUP BY opportunity_type ORDER BY cnt DESC
  `;
  console.log('\n9. NULL confidence by opportunity_type (all rows):');
  for (const r of nullByType) console.log(`   ${r.opportunity_type || '(null)'}: ${r.cnt}`);

  // 11. NULL confidence rows: when were they updated?
  const nullAge = await sql`
    SELECT DATE(updated_at) AS d, COUNT(*) AS cnt
    FROM suburb_metrics WHERE overall_confidence IS NULL
    GROUP BY d ORDER BY d
  `;
  console.log('\n10. NULL confidence rows by updated date:');
  for (const r of nullAge) console.log(`   ${r.d}: ${r.cnt}`);

  // 12. Check what factor_confidence fields are also NULL
  const factorNulls = await sql`
    SELECT 
      COUNT(*) AS total,
      SUM(CASE WHEN conf_undervaluation IS NULL THEN 1 ELSE 0 END) AS null_underval,
      SUM(CASE WHEN conf_growth IS NULL THEN 1 ELSE 0 END) AS null_growth,
      SUM(CASE WHEN conf_yield IS NULL THEN 1 ELSE 0 END) AS null_yield,
      SUM(CASE WHEN conf_vacancy IS NULL THEN 1 ELSE 0 END) AS null_vacancy,
      SUM(CASE WHEN conf_school IS NULL THEN 1 ELSE 0 END) AS null_school
    FROM suburb_metrics
    WHERE overall_confidence IS NULL
  `;
  console.log('\n11. Factor confidence fields when overall_confidence IS NULL:');
  console.log(`   conf_undervaluation NULL: ${factorNulls[0].null_underval}/${factorNulls[0].total}`);
  console.log(`   conf_growth NULL: ${factorNulls[0].null_growth}/${factorNulls[0].total}`);
  console.log(`   conf_yield NULL: ${factorNulls[0].null_yield}/${factorNulls[0].total}`);
  console.log(`   conf_vacancy NULL: ${factorNulls[0].null_vacancy}/${factorNulls[0].total}`);
  console.log(`   conf_school NULL: ${factorNulls[0].null_school}/${factorNulls[0].total}`);

  // 13. Also check if opportunity_score and type are populated for NULL confidence rows
  const nullScoreCheck = await sql`
    SELECT 
      COUNT(*) AS total,
      SUM(CASE WHEN opportunity_score IS NOT NULL THEN 1 ELSE 0 END) AS has_score,
      SUM(CASE WHEN opportunity_type IS NOT NULL THEN 1 ELSE 0 END) AS has_type
    FROM suburb_metrics WHERE overall_confidence IS NULL
  `;
  console.log(`\n12. NULL confidence rows with other data:`);
  console.log(`   Has opportunity_score: ${nullScoreCheck[0].has_score}/${nullScoreCheck[0].total}`);
  console.log(`   Has opportunity_type: ${nullScoreCheck[0].has_type}/${nullScoreCheck[0].total}`);

  await sql.end({ timeout: 3 });
  process.exit(0);
}

audit().catch(e => { console.error(e); process.exit(1); });
