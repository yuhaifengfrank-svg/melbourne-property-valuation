// Batch valuation test — calls production API for all addresses
// Run: node /tmp/batch-valuation-remote.mjs

import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import xlsx from 'xlsx';

const XLSX_PATH = '/Users/FrankAI/Downloads/address test vic.xlsx';
const CSV_OUT = '/tmp/valuation_batch_all.csv';
const JSON_OUT = '/tmp/valuation_batch_all.json';

// Read XLSX
const wb = xlsx.readFile(XLSX_PATH);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });
const addresses = rows.slice(1).map(r => r[0]).filter(Boolean);

console.log(`Total addresses: ${addresses.length}\n`);

const results = [];
const BATCH_SIZE = 3; // parallel requests
const API_URL = 'https://aushomevalue.com.au/api/valuation';

function parseAddress(raw) {
  const parts = raw.split(',').map(s => s.trim());
  const statePart = parts[parts.length - 1] || '';
  const state = statePart.includes('VIC') ? 'VIC' : 'VIC';
  const suburb = parts.length >= 2 ? parts[parts.length - 2] : '';
  const addrParts = parts.slice(0, parts.length - 2);
  const filteredAddrParts = addrParts.filter(p => p !== suburb);
  const streetAddr = filteredAddrParts.join(', ');
  const hasUnit = /^\d+[a-zA-Z]?\//.test(streetAddr) || /^\d+\/\d+/.test(streetAddr);
  const isApartment = /^(G|L|UG|AP\d+|APT)\d*\/?\d*/i.test(streetAddr);
  const propertyType = isApartment ? 'Apartment' : hasUnit ? 'Unit' : 'House';
  return { suburb, state, propertyType, streetAddr };
}

async function callValuation(raw, idx, total) {
  const { suburb, state, propertyType } = parseAddress(raw);
  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: raw, suburb, state, propertyType,
        bedrooms: 3, bathrooms: 2, debug: true
      })
    });
    const data = await resp.json();
    
    if (data.ok) {
      const midpoint = data.estimate?.midpoint || null;
      const low = data.estimate?.low || null;
      const high = data.estimate?.high || null;
      const conf = data.confidence?.label || '?';
      const comps = data.comparableCount || 0;
      
      // Get factor adjustments from _debug
      const dbg = data._debug || {};
      const fa = dbg.factorAdjustments || [];
      const ft = dbg.factorTotal || null;
      
      const factorMap = {};
      for (const f of fa) {
        factorMap[f.name] = f.value;
      }
      
      process.stdout.write(`✓ ${suburb.padEnd(18)} $${midpoint ? (midpoint/1000).toFixed(0)+'k' : 'N/A'.padEnd(4)} adj:${ft != null ? (ft*100).toFixed(1)+'%' : 'N/A'.padEnd(5)} comps:${comps}\n`);
      
      return {
        ok: true, address: raw, suburb, state, propertyType,
        midpoint, low, high, totalAdj: ft,
        landSizeAdj: factorMap.landSizeAdj ?? null,
        streetQualityAdj: factorMap.streetQualityAdj ?? null,
        bedroomAdj: factorMap.bedroomAdj ?? null,
        marketMomentum: factorMap.marketMomentum ?? null,
        educationFactor: factorMap.educationFactor ?? null,
        dataQualityAdj: factorMap.dataQualityAdj ?? null,
        highEndOutlier: factorMap.highEndOutlier ?? null,
        censusConsistency: factorMap.censusConsistency ?? null,
        confidence: conf, nComparables: comps
      };
    } else {
      process.stdout.write(`✖ ${suburb.padEnd(18)} ${(data.status || 'FAIL').substring(0, 30)}\n`);
      return { ok: false, address: raw, suburb, state, propertyType, status: data.status || 'FAIL' };
    }
  } catch (err) {
    process.stdout.write(`✖ ${suburb.padEnd(18)} ${(err.message || 'ERROR').substring(0, 30)}\n`);
    return { ok: false, address: raw, suburb, state, propertyType, error: err.message };
  }
}

// Batch process
async function run() {
  const BATCH = 5;
  let completed = 0;
  
  // Init CSV
  const header = 'address,suburb,propertyType,midpoint,totalAdj,landSizeAdj,streetQualityAdj,bedroomAdj,marketMomentum,educationFactor,dataQualityAdj,highEndOutlier,censusConsistency,confidence,nComparables\n';
  writeFileSync(CSV_OUT, header);
  
  const startTime = Date.now();
  
  for (let i = 0; i < addresses.length; i += BATCH) {
    const batch = addresses.slice(i, i + BATCH);
    const batchResults = await Promise.all(
      batch.map((addr, j) => callValuation(addr, i + j, addresses.length))
    );
    
    for (const r of batchResults) {
      results.push(r);
      if (r.ok) {
        appendFileSync(CSV_OUT, `"${r.address}",${r.suburb},${r.propertyType},${r.midpoint},${r.totalAdj},${r.landSizeAdj},${r.streetQualityAdj},${r.bedroomAdj},${r.marketMomentum},${r.educationFactor},${r.dataQualityAdj},${r.highEndOutlier},${r.censusConsistency},${r.confidence},${r.nComparables}\n`);
      } else {
        appendFileSync(CSV_OUT, `"${r.address}",${r.suburb},${r.propertyType},,,${r.status}\n`);
      }
    }
    
    completed += batch.length;
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    process.stdout.write(`  → ${completed}/${addresses.length} (${elapsed}min)\n`);
  }
  
  writeFileSync(JSON_OUT, JSON.stringify(results, null, 2));
  
  // Summary
  const succeeded = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  
  console.log('\n══════════════════════════════════════════════');
  console.log(`COMPLETE — ${elapsed}min`);
  console.log(`  OK: ${succeeded.length}, FAIL: ${failed.length} / ${addresses.length}`);
  
  if (succeeded.length > 0) {
    const adjValues = succeeded.map(r => r.totalAdj).filter(v => v != null && !isNaN(v));
    const avgAdj = adjValues.length > 0 ? adjValues.reduce((a, b) => a + b, 0) / adjValues.length : 0;
    console.log(`  Avg total adjustment: ${(avgAdj * 100).toFixed(2)}%`);
    
    const factors = ['landSizeAdj','streetQualityAdj','bedroomAdj','marketMomentum',
                     'educationFactor','dataQualityAdj','highEndOutlier','censusConsistency'];
    for (const fn of factors) {
      const vals = succeeded.map(r => r[fn]).filter(v => v != null && !isNaN(v));
      if (vals.length > 0) {
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        console.log(`  ${fn.padEnd(22)} avg:${(avg*100).toFixed(2)}%  [${(min*100).toFixed(2)}% .. ${(max*100).toFixed(2)}%]`);
      }
    }
  }
  
  console.log(`\nResults CSV: ${CSV_OUT}`);
  console.log(`Results JSON: ${JSON_OUT}`);
}

run().catch(console.error);
