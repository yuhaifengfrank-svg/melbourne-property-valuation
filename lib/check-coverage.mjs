import { getSql } from "../api/_db.js";

async function main() {
  const sql = getSql();
  const rows = await sql`
    SELECT suburb, property_type, COUNT(*)::int as cnt
    FROM comparable_sales
    WHERE verification_status IN ('cross_source_verified','single_source_observed')
    GROUP BY suburb, property_type
    ORDER BY cnt, suburb
  `;
  
  const bySuburb = {};
  for (const r of rows) {
    if (!bySuburb[r.suburb]) bySuburb[r.suburb] = {};
    bySuburb[r.suburb][r.property_type] = r.cnt;
  }
  
  const thin = [];
  const types = ['House', 'Unit', 'Townhouse', 'Apartment'];
  
  for (const [suburb, counts] of Object.entries(bySuburb)) {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const missing = types.filter(t => (counts[t] || 0) < 5);
    if (missing.length > 0) {
      thin.push({ suburb, total, counts, missing });
    }
  }
  
  thin.sort((a, b) => a.total - b.total);
  
  console.log(`\n=== Suburbs with thin coverage (<5 per type) ===\n`);
  for (const t of thin.slice(0, 30)) {
    const detail = types.map(tp => `${tp}: ${t.counts[tp] || 0}`).join(', ');
    console.log(`  ${t.suburb}: total=${t.total} | ${detail}`);
  }
  console.log(`\n  Total thin suburbs: ${thin.length}`);
}

main().catch(e => console.error(e));
