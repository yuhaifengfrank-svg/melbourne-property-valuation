import { getSql } from './api/_db.js';
import { fetchPageText, parseReaSold } from './lib/browser-collector.js';

const sql = getSql();

// Get all 195 suburbs that have House data
const r = await sql`SELECT DISTINCT suburb FROM comparable_sales WHERE property_type = 'House' ORDER BY suburb`;
const allSuburbs = r.map(x => x.suburb);

console.log('Importing Unit data for ' + allSuburbs.length + ' suburbs...\n');

const BATCH_ID = 'batch-units-2026-06-08';
const BATCH_DATE = '2026-06-08';
const concurrency = 5;

let totalUnit = 0, errors = 0, skippedEmpty = 0;
let cursor = 0;

function next() {
  return new Promise(resolve => {
    let completed = 0;
    async function worker() {
      while (true) {
        const idx = cursor++;
        if (idx >= allSuburbs.length) { resolve(); return; }
        const suburb = allSuburbs[idx];
        try {
          const slug = suburb.toLowerCase().replace(/\s+/g, '-');
          // No propertyTypes filter — get ALL sold, filter to Unit/Townhouse/Villa
          const url = `https://www.realestate.com.au/sold/in-${slug}+vic/list-1?activeSort=solddate`;
          const result = await fetchPageText(url);

          let units = [];
          if (result.ok) {
            const allSales = parseReaSold(result.text, suburb);
            units = allSales.filter(s => {
              const t = (s.propertyType || '').toLowerCase();
              return t === 'unit' || t === 'townhouse' || t === 'villa';
            });
            // collectionUrl is NOT set by parseReaSold (it was set in scrapeSoldData's outer loop)
            // source_url has NOT NULL constraint in DB, so we MUST fill it
            for (const s of units) {
              s.collectionUrl = s.collectionUrl || url;
              s.source = s.source || 'realestate.com.au';
            }
          }

          if (units.length === 0) {
            skippedEmpty++;
            if (skippedEmpty <= 5 || idx % 30 === 0)
              console.log(`  [${idx+1}/${allSuburbs.length}] ${suburb.padEnd(22)}: 0 units`);
            continue;
          }

          let inserted = 0, localErrors = 0;
          for (const s of units) {
            try {
              const propertyType = (s.propertyType || 'Unit');
              const capType = propertyType.charAt(0).toUpperCase() + propertyType.slice(1).toLowerCase();
              if (s.saleDate && s.price) {
                await sql`
                  INSERT INTO comparable_sales (
                    sale_address, sale_price, sale_date, property_type,
                    suburb, state, source_url, source_name,
                    collection_date, collection_round, batch_id,
                    verification_status, original_evidence
                  ) VALUES (
                    ${s.address}, ${s.price}, ${s.saleDate || null}, ${capType},
                    ${suburb}, 'VIC', ${s.collectionUrl || null}, ${s.source || ''},
                    ${BATCH_DATE}, 'unit-import', ${BATCH_ID},
                    'single_source_observed',
                    ${JSON.stringify({ collectionUrl: s.collectionUrl, source: s.source })}
                  )
                  ON CONFLICT (sale_address, sale_date, sale_price, source_name)
                  WHERE sale_date IS NOT NULL AND sale_price IS NOT NULL
                  DO UPDATE SET batch_id = EXCLUDED.batch_id, updated_at = NOW()
                `;
              } else {
                await sql`
                  INSERT INTO comparable_sales (
                    sale_address, sale_price, sale_date, property_type,
                    suburb, state, source_url, source_name,
                    collection_date, collection_round, batch_id,
                    verification_status, original_evidence
                  ) VALUES (
                    ${s.address}, ${s.price}, ${s.saleDate || null}, ${capType},
                    ${suburb}, 'VIC', ${s.collectionUrl || null}, ${s.source || ''},
                    ${BATCH_DATE}, 'unit-import', ${BATCH_ID},
                    'single_source_observed',
                    ${JSON.stringify({ collectionUrl: s.collectionUrl, source: s.source })}
                  )
                `;
              }
              inserted++;
              totalUnit++;
            } catch(e) {
              localErrors++;
              errors++;
            }
          }

          console.log(`  [${idx+1}/${allSuburbs.length}] ${suburb.padEnd(22)}: ${String(inserted).padStart(3)} units${localErrors ? ' (' + localErrors + ' errors)' : ''}`);
        } catch(e) {
          errors++;
          console.log(`  [${idx+1}/${allSuburbs.length}] ${suburb}: ERROR ${e.message?.slice(0,80)}`);
        }
      }
    }
    for (let i = 0; i < concurrency; i++) worker();
  });
}

await next();

// Summary
const total = await sql`SELECT COUNT(*)::int as cnt FROM comparable_sales WHERE batch_id = ${BATCH_ID}`;
console.log('\n=== DONE ===');
console.log('Suburbs processed: ' + allSuburbs.length);
console.log('Units/Townhouses/Villas imported: ' + totalUnit + ' (DB confirms: ' + total[0].cnt + ')');
console.log('Suburbs with 0 units: ' + skippedEmpty);
console.log('Errors: ' + errors);

// Type breakdown
const typeDist = await sql`SELECT property_type, COUNT(*)::int as cnt FROM comparable_sales WHERE batch_id = ${BATCH_ID} GROUP BY property_type ORDER BY cnt DESC`;
console.log('\nType breakdown:');
for (const x of typeDist) console.log('  ' + x.property_type + ': ' + x.cnt);
