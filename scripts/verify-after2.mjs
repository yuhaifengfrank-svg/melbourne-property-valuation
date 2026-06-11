import { getSql, ensureSchema } from '../api/_db.js';

async function verify() {
  const sql = getSql();
  await ensureSchema(sql);
  
  // Count
  const total = await sql`SELECT COUNT(*) AS c FROM suburb_metrics WHERE overall_confidence IS NOT NULL`;
  const all = await sql`SELECT COUNT(*) AS c FROM suburb_metrics`;
  console.log(`Total rows: ${all[0].c}`);
  console.log(`With confidence: ${total[0].c}`);
  
  // Find which 2 don't match pages
  const { readdirSync } = await import('fs');
  const files = readdirSync('./public/suburb').filter(f => f.endsWith('.html'));
  const pageNorm = new Set();
  for (const f of files) {
    const m = f.match(/^(.+?)-vic\.html$/);
    if (m) pageNorm.add(m[1].replace(/-/g, ' ').toLowerCase().replace(/[^a-z]/g, ''));
  }
  
  const rows = await sql`SELECT suburb FROM suburb_metrics ORDER BY suburb`;
  for (const r of rows) {
    const key = r.suburb.toLowerCase().replace(/[^a-z]/g, '');
    if (!pageNorm.has(key)) {
      console.log(`No matching page: ${r.suburb}`);
    }
  }

  await sql.end({ timeout: 3 });
  process.exit(0);
}

verify().catch(e => { console.error(e); process.exit(1); });
