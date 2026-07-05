// Batch valuation test — runs full valuation chain for a list of addresses
// Usage: node scripts/batch-valuation-test.mjs [--start=N] [--limit=N] [--format=csv|json|summary]

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { runValuation } from '../lib/valuation-service.js';
import xlsx from 'xlsx';

const args = process.argv.slice(2);
const startOffset = parseInt(args.find(a => a.startsWith('--start='))?.split('=')[1] || '0', 10);
const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '10', 10);
const format = args.find(a => a.startsWith('--format='))?.split('=')[1] || 'summary';

// Read test addresses
const wb = xlsx.readFile('/Users/FrankAI/Downloads/address test vic.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });
const addresses = rows.slice(1).map(r => r[0]).filter(Boolean);

console.log(`Total addresses: ${addresses.length}`);

const batch = addresses.slice(startOffset, startOffset + limit);
console.log(`Processing batch ${startOffset}-${startOffset + batch.length - 1} (${batch.length} addresses)\n`);

const results = [];

for (let i = 0; i < batch.length; i++) {
  const raw = batch[i];
  
  // Parse address to extract components
  // Format: "unit, street, suburb, state pcode" or "street, suburb, state pcode"
  const parts = raw.split(',').map(s => s.trim());
  
  // Last part: "VIC 3143" or just "VIC"  
  const statePart = parts[parts.length - 1] || '';
  const state = statePart.includes('VIC') ? 'VIC' : 'VIC';
  
  // Second-to-last is suburb
  const suburb = parts.length >= 2 ? parts[parts.length - 2] : '';
  
  // Build address string (everything except suburb+state+pcode)
  const addrParts = parts.slice(0, parts.length - 2);
  // Remove duplicate suburb if it appears in the street part
  const filteredAddrParts = addrParts.filter(p => p !== suburb);
  const streetAddr = filteredAddrParts.join(', ');
  
  // Detect propertyType from unit/street number patterns
  const hasUnit = /^\d+[a-zA-Z]?\//.test(streetAddr) || /^[A-Z]\d+\//.test(streetAddr) || /^\d+\/\d+/.test(streetAddr);
  const isApartment = /^(G|L|UG|AP\d+|APT)\d*\/?\d*/i.test(streetAddr);
  const propertyType = isApartment ? 'Apartment' : hasUnit ? 'Unit' : 'House';
  
  // Try to parse bedrooms from address if present (for better accuracy)
  const bedrooms = 3; // default
  
  const input = {
    address: raw,
    suburb,
    state,
    propertyType,
    bedrooms,
    bathrooms: 2,
  };

  process.stdout.write(`  [${i + 1}/${batch.length}] ${suburb.substring(0, 18).padEnd(18)} ${propertyType.padEnd(10)} `);

  try {
    const result = await runValuation(input, {
      fetch: false,
      useDatabaseFallback: true,
      debug: true,
    });
    
    if (result.ok) {
      const est = result.valuation?.estimate;
      const factors = result.valuation?.factorResults || {};
      const midpoint = est?.midpoint ? `$${(est.midpoint / 1000).toFixed(0)}k` : 'N/A';
      const totalAdj = factors.total != null ? `adj:${(factors.total * 100).toFixed(1)}%` : '';
      const conf = result.valuation?.confidence?.label || '?';
      
      process.stdout.write(`✓ $${midpoint} ${totalAdj} conf:${conf}\n`);
      
      results.push({
        address: raw,
        suburb, state, propertyType,
        ok: true,
        midpoint: est?.midpoint || null,
        low: est?.low || null,
        high: est?.high || null,
        totalAdj: factors.total || null,
        factors: {
          landSizeAdj: factors.landSizeAdj,
          streetQualityAdj: factors.streetQualityAdj,
          bedroomAdj: factors.bedroomAdj,
          marketMomentum: factors.marketMomentum,
          educationFactor: factors.educationFactor,
          dataQualityAdj: factors.dataQualityAdj,
          highEndOutlier: factors.highEndOutlier,
          censusConsistency: factors.censusConsistency,
        },
        confidence: conf,
        nComparables: result.valuation?.nComparables || 0,
      });
    } else {
      process.stdout.write(`✖ ${result.status || 'FAIL'}\n`);
      results.push({ address: raw, suburb, state, propertyType, ok: false, status: result.status });
    }
  } catch (err) {
    process.stdout.write(`✖ ${err.message?.substring(0, 40) || 'ERROR'}\n`);
    results.push({ address: raw, suburb, state, propertyType, ok: false, error: err.message });
  }
}

// Summary statistics
console.log('\n══════════════════════════════════════════════');
console.log('SUMMARY:');
const succeeded = results.filter(r => r.ok);
const failed = results.filter(r => !r.ok);
console.log(`  OK: ${succeeded.length}, FAIL: ${failed.length}`);

if (succeeded.length > 0) {
  const adjValues = succeeded.map(r => r.totalAdj).filter(v => v != null && !isNaN(v));
  const avgAdj = adjValues.length > 0 ? adjValues.reduce((a, b) => a + b, 0) / adjValues.length : 0;
  console.log(`  Avg total adjustment: ${(avgAdj * 100).toFixed(2)}%`);
  
  // Factor averages
  const factorNames = ['landSizeAdj', 'streetQualityAdj', 'bedroomAdj', 'marketMomentum', 
                        'educationFactor', 'dataQualityAdj', 'highEndOutlier', 'censusConsistency'];
  console.log('\n  Factor averages:');
  for (const fn of factorNames) {
    const vals = succeeded.map(r => r.factors[fn]).filter(v => v != null && !isNaN(v));
    if (vals.length > 0) {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      console.log(`    ${fn.padEnd(22)} avg:${(avg * 100).toFixed(2)}%  [${(min * 100).toFixed(2)}% .. ${(max * 100).toFixed(2)}%]`);
    }
  }
}

if (failed.length > 0) {
  console.log('\n  Failed:');
  for (const f of failed) {
    console.log(`    ${f.suburb.padEnd(20)} ${f.status || f.error?.substring(0, 60)}`);
  }
}

// Output results file
const outFile = `/tmp/valuation_batch_${startOffset}_${startOffset + batch.length - 1}.json`;
writeFileSync(outFile, JSON.stringify(results, null, 2));
console.log(`\nResults written to: ${outFile}`);

// Also append to cumulative results
const csvOut = `/tmp/valuation_batch_all.csv`;
const isNew = !existsSync(csvOut) || startOffset === 0;
if (isNew) {
  writeFileSync(csvOut, 'address,suburb,propertyType,midpoint,totalAdj,landSizeAdj,streetQualityAdj,bedroomAdj,marketMomentum,educationFactor,dataQualityAdj,highEndOutlier,censusConsistency,confidence,nComparables\n');
}
for (const r of results) {
  if (r.ok) {
    appendFileSync(csvOut, `"${r.address}",${r.suburb},${r.propertyType},${r.midpoint},${r.totalAdj},${r.factors.landSizeAdj},${r.factors.streetQualityAdj},${r.factors.bedroomAdj},${r.factors.marketMomentum},${r.factors.educationFactor},${r.factors.dataQualityAdj},${r.factors.highEndOutlier},${r.factors.censusConsistency},${r.confidence},${r.nComparables}\n`);
  } else {
    appendFileSync(csvOut, `"${r.address}",${r.suburb},${r.propertyType},,,${r.status}\n`);
  }
}
console.log(`Cumulative CSV: ${csvOut}`);
