/**
 * scripts/populate-council-metrics.mjs
 *
 * Phase 2: Parse VBA/BPC Building Permit Monthly Summary XLSX files
 * and write per-LGA building activity to council_metrics.
 *
 * Workflow:
 *   1. Read XLSX files from /tmp/vba-data/ (downloaded by fetch-vba-permit-data.mjs)
 *   2. Parse each file to extract per-LGA permit counts + values
 *   3. Match LGA name to council_registry.lga_code (fuzzy if needed)
 *   4. UPSERT into council_metrics
 *   5. Refresh materialized view council_metrics_12m
 *
 * Expected XLSX structure (from VBA/BPC monthly summaries):
 *   - Sheets: typically "Sheet1" or named by month
 *   - Columns: Municipality, New Houses (No.), New Houses ($'000), etc.
 *
 * Run: node scripts/populate-council-metrics.mjs [--month 2026-03] [--dir /tmp/vba-data]
 *
 * Safety: UPSERT only — never deletes
 */

import fs from 'fs';
import path from 'path';
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import XLSX from 'xlsx';

dotenv.config();

const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
const DATA_DIR = process.argv.find(a => a.startsWith('--dir='))?.split('=')[1] || '/tmp/vba-data';
const TARGET_MONTH = process.argv.find(a => a.startsWith('--month='))?.split('=')[1] || null;

/**
 * Parse a single VBA monthly summary XLSX into per-LGA records.
 *
 * Expected VBA per-LGA format (April 2025+):
 *   Sheet: "Sheet1" or first sheet
 *   Row 0: Headers
 *   Col A: Municipality (council name like "Banyule City Council")
 *   Col B: New Houses count
 *   Col C: New Houses value ($'000)
 *   Col D: New Multi Unit count
 *   Col E: New Multi Unit value ($'000)
 *   Col F: Alterations count
 *   Col G: Alterations value ($'000)
 *   Col H: Commercial/Industrial count
 *   Col I: Commercial/Industrial value ($'000)
 *   Col J: Total count
 *   Col K: Total value ($'000)
 *
 * Calls council_registry for exact or fuzzy LGA name matching.
 * Returns array of { lgaName, permits, values }
 */
function parseVbaPermits(filePath) {
  try {
    const wb = XLSX.readFile(filePath);
    
    // Find the main data sheet
    let sheetName = null;
    for (const name of wb.SheetNames) {
      const s = name.toLowerCase();
      // Skip disclaimer/analysis sheets, find the main data sheet
      if (!s.includes('disclaimer') && !s.includes('graph') && !s.includes('yearly')) {
        sheetName = name;
        break;
      }
    }
    
    if (!sheetName) sheetName = wb.SheetNames[0];
    
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });
    
    // Find the header row - look for row containing "Municipality" or similar
    let headerRow = -1;
    for (let i = 0; i < Math.min(20, rows.length); i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      const first = String(row[0] || '').toLowerCase();
      if (first.includes('municip') || first.includes('council') || first.includes('lga') || first.includes('authority')) {
        headerRow = i;
        break;
      }
      // Also check if row contains expected header-like values
      const rowStr = row.map(c => String(c || '')).join(' ').toLowerCase();
      if (rowStr.includes('municipality') && rowStr.includes('houses')) {
        headerRow = i;
        break;
      }
    }
    
    // If no header found, try: assume first non-empty row is header
    if (headerRow === -1) {
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        if (rows[i] && rows[i].length >= 3 && String(rows[i][0] || '').trim()) {
          headerRow = i;
          break;
        }
      }
    }
    
    if (headerRow === -1) {
      console.error(`    [parse] Cannot find header row in ${path.basename(filePath)}`);
      return [];
    }
    
    // Identify column indices by reading headers
    const headers = rows[headerRow].map(h => String(h || '').toLowerCase().trim());
    
    // Predict column mapping based on common patrols
    const colMap = { municipality: -1, 
      houseCount: -1, houseValue: -1,
      multiCount: -1, multiValue: -1,
      altCount: -1, altValue: -1,
      commCount: -1, commValue: -1,
      totalCount: -1, totalValue: -1 };
    
    for (let ci = 0; ci < headers.length; ci++) {
      const h = headers[ci];
      if (h.includes('municip') || h.includes('authority') || h.includes('council')) {
        colMap.municipality = ci;
      } else if (h.includes('new') && h.includes('house') && (h.includes('no') || h.includes('count') || h.includes('number') || !h.includes('$') && !h.includes('value'))) {
        colMap.houseCount = ci;
      } else if (h.includes('new') && h.includes('house') && (h.includes('$') || h.includes('value'))) {
        colMap.houseValue = ci;
      } else if (h.includes('multi') && (h.includes('no') || h.includes('count'))) {
        colMap.multiCount = ci;
      } else if (h.includes('multi') && (h.includes('$') || h.includes('value'))) {
        colMap.multiValue = ci;
      } else if (h.includes('alter') && (h.includes('no') || h.includes('count'))) {
        colMap.altCount = ci;
      } else if (h.includes('alter') && (h.includes('$') || h.includes('value'))) {
        colMap.altValue = ci;
      } else if (h.includes('comm') && (h.includes('no') || h.includes('count'))) {
        colMap.commCount = ci;
      } else if (h.includes('comm') && (h.includes('$') || h.includes('value'))) {
        colMap.commValue = ci;
      } else if (h.includes('total') && (h.includes('no') || h.includes('count'))) {
        colMap.totalCount = ci;
      } else if (h.includes('total') && (h.includes('$') || h.includes('value'))) {
        colMap.totalValue = ci;
      }
    }
    
    // If column detection failed, try to use positional columns (VBA standard format)
    if (colMap.houseCount === -1 && headers.length >= 6) {
      // Assume standard position: Municipality=0, NewHousesCount=1, NewHouses$=2, 
      // NewMultiCount=3, NewMulti$=4, AltCount=5, Alt$=6, CommCount=7, Comm$=8, TotalCount=9, Total$=10
      colMap.municipality = 0;
      colMap.houseCount = 1;
      colMap.houseValue = 2;
      colMap.multiCount = 3;
      colMap.multiValue = 4;
      colMap.altCount = 5;
      colMap.altValue = 6;
      colMap.commCount = 7;
      colMap.commValue = 8;
      colMap.totalCount = 9;
      colMap.totalValue = 10;
    }
    
    if (colMap.municipality === -1) {
      console.error(`    [parse] Cannot find municipality column in ${path.basename(filePath)}`);
      console.error(`    Headers: ${headers.join(' | ')}`);
      return [];
    }
    
    // Parse data rows
    const records = [];
    for (let ri = headerRow + 1; ri < rows.length; ri++) {
      const row = rows[ri];
      if (!row || row.length === 0) continue;
      
      const lgaName = String(row[colMap.municipality] || '').trim();
      
      // Skip empty, totals, and non-LGA rows
      if (!lgaName || 
          lgaName.toLowerCase().includes('total') ||
          lgaName.toLowerCase().includes('grand total') ||
          lgaName.toLowerCase().includes('subtotal')) {
        continue;
      }
      
      // Skip rows that are section headers or summaries (no numeric data in count columns)
      if (colMap.totalCount >= 0) {
        const totalVal = parseFloat(row[colMap.totalCount]) || 0;
        if (totalVal === 0 && colMap.houseCount >= 0) {
          const hCount = parseFloat(row[colMap.houseCount]) || 0;
          if (hCount === 0) continue; // Skip header rows
        }
      }
      
      const getNum = (idx) => {
        if (idx < 0 || idx >= row.length) return 0;
        const val = row[idx];
        if (val === '' || val === null || val === undefined) return 0;
        const num = parseFloat(String(val).replace(/[$,]/g, ''));
        return isNaN(num) ? 0 : num;
      };
      
      const permits = {
        newResidential:   getNum(colMap.houseCount),
        newMultiUnit:     getNum(colMap.multiCount),
        alterations:      getNum(colMap.altCount),
        commercial:       getNum(colMap.commCount),
        total:            getNum(colMap.totalCount)
      };
      
      const values = {
        newResidential:   getNum(colMap.houseValue),
        newMultiUnit:     getNum(colMap.multiValue),
        alterations:      getNum(colMap.altValue),
        commercial:       getNum(colMap.commValue),
        total:            getNum(colMap.totalValue)
      };
      
      records.push({ lgaName, permits, values });
    }
    
    return records;
  } catch (err) {
    console.error(`  [parse] Cannot parse ${path.basename(filePath)}: ${err.message}`);
    return [];
  }
}

async function loadLgaNameMap() {
  const rows = await sql`
    SELECT lga_code, lga_name, REGEXP_REPLACE(LOWER(lga_name), '[^a-z0-9]', '', 'g') AS slug
    FROM council_registry
  `;
  // Build slug→code mapping for fuzzy matching
  const slugMap = {};
  const nameMap = {};
  for (const r of rows) {
    slugMap[r.slug] = r.lga_code;
    nameMap[LOWER(r.lga_name)] = r.lga_code;
  }
  return { slugMap, nameMap, rows };
}

function matchLga(name, maps) {
  if (!name) return null;
  const clean = name.trim();
  
  // Direct match
  if (maps.nameMap[clean.toLowerCase()]) {
    return maps.nameMap[clean.toLowerCase()];
  }
  
  // Slug match
  const slug = clean.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (maps.slugMap[slug]) return maps.slugMap[slug];
  
  // Fuzzy: partial match
  for (const r of maps.rows) {
    const rSlug = r.lga_name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (rSlug.includes(slug) || slug.includes(rSlug)) {
      return r.lga_code;
    }
  }
  
  return null;
}

async function processFile(filePath, maps) {
  const filename = path.basename(filePath);
  
  // Extract month from filename pattern YYYY-MM
  const monthMatch = filename.match(/(\d{4})-(\d{2})/);
  if (!monthMatch) {
    console.log(`  ✗ ${filename}: cannot parse year-month from filename`);
    return { processed: 0, errors: 1 };
  }
  
  const year = parseInt(monthMatch[1]);
  const month = parseInt(monthMatch[2]);
  
  console.log(`  ⟳ ${filename}: parsing...`);
  
  const records = parseVbaPermits(filePath);
  
  if (records.length === 0) {
    console.log(`  ! ${filename}: no records parsed (file format not yet mapped)`);
    return { processed: 0, errors: 0 };
  }
  
  let inserted = 0;
  let matched = 0;
  let unmatched = 0;
  
  for (const rec of records) {
    const lgaCode = matchLga(rec.lgaName, maps);
    
    if (!lgaCode) {
      unmatched++;
      if (unmatched <= 3) {
        console.log(`    ! unmatched LGA: "${rec.lgaName}"`);
      }
      continue;
    }
    
    matched++;
    
    try {
      await sql`
        INSERT INTO council_metrics 
          (lga_code, report_year, report_month, 
           permits_new_residential, permits_new_multi_unit, permits_alterations, permits_commercial, permits_total,
           value_new_residential, value_new_multi_unit, value_alterations, value_commercial, value_total,
           data_file)
        VALUES (
          ${lgaCode}, ${year}, ${month},
          ${rec.permits.newResidential || 0}, ${rec.permits.newMultiUnit || 0},
          ${rec.permits.alterations || 0}, ${rec.permits.commercial || 0}, ${rec.permits.total || 0},
          ${rec.values.newResidential || 0}, ${rec.values.newMultiUnit || 0},
          ${rec.values.alterations || 0}, ${rec.values.commercial || 0}, ${rec.values.total || 0},
          ${filename}
        )
        ON CONFLICT (lga_code, report_year, report_month) DO UPDATE SET
          permits_new_residential = EXCLUDED.permits_new_residential,
          permits_new_multi_unit = EXCLUDED.permits_new_multi_unit,
          permits_alterations = EXCLUDED.permits_alterations,
          permits_commercial = EXCLUDED.permits_commercial,
          permits_total = EXCLUDED.permits_total,
          value_new_residential = EXCLUDED.value_new_residential,
          value_new_multi_unit = EXCLUDED.value_new_multi_unit,
          value_alterations = EXCLUDED.value_alterations,
          value_commercial = EXCLUDED.value_commercial,
          value_total = EXCLUDED.value_total,
          avg_value_per_permit = CASE 
            WHEN EXCLUDED.permits_total > 0 
            THEN EXCLUDED.value_total / EXCLUDED.permits_total 
            ELSE 0 END,
          updated_at = NOW()
      `;
      inserted++;
    } catch (err) {
      console.error(`    ✗ DB error for ${rec.lgaName} (${lgaCode}): ${err.message}`);
    }
  }
  
  console.log(`  ✓ ${filename}: ${matched} matched, ${inserted} inserted, ${unmatched} unmatched`);
  
  return { processed: matched, errors: unmatched };
}

async function refreshMaterializedView() {
  try {
    await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY council_metrics_12m`;
    console.log('  ✓ Refreshed council_metrics_12m materialized view');
  } catch (err) {
    // View may not have rows yet on first run
    try {
      await sql`REFRESH MATERIALIZED VIEW council_metrics_12m`;
      console.log('  ✓ Refreshed council_metrics_12m (non-concurrent)');
    } catch (e2) {
      console.warn(`  ! Cannot refresh materialized view: ${e2.message}`);
    }
  }
}

async function main() {
  console.log('[council-metrics] Phase 2: Populating council metrics from VBA permit data\n');
  
  // Check council_registry exists
  const check = await sql`SELECT COUNT(*) FROM council_registry`;
  if (parseInt(check[0].count) === 0) {
    console.error('[council-metrics] ERROR: council_registry is empty. Run populate-council-registry.mjs first.');
    process.exit(1);
  }
  console.log(`[council-metrics] council_registry has ${check[0].count} LGAs\n`);
  
  // Load LGA name mapping
  const maps = await loadLgaNameMap();
  
  // Get files
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`[council-metrics] ERROR: Data directory not found: ${DATA_DIR}`);
    console.error('  Run scripts/fetch-vba-permit-data.mjs first, then place XLSX files in $DATA_DIR');
    process.exit(1);
  }
  
  let files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.xlsx') && !f.startsWith('.'));
  
  if (TARGET_MONTH) {
    files = files.filter(f => f.startsWith(TARGET_MONTH));
  }
  
  files.sort();
  
  if (files.length === 0) {
    console.log(`[council-metrics] No XLSX files found in ${DATA_DIR}`);
    console.log('  Download files manually from VBA/Data.Vic or run:');
    console.log('  node scripts/fetch-vba-permit-data.mjs');
    console.log('\n  Manual download steps:');
    console.log('  1. Open browser to: https://discover.data.vic.gov.au/dataset/building-permit-activity-monthly-summaries');
    console.log('  2. Download XLSX files for desired months');
    console.log(`  3. Copy files to ${DATA_DIR}/ as YYYY-MM.xlsx`);
    process.exit(0);
  }
  
  console.log(`[council-metrics] Found ${files.length} files to process\n`);
  
  let totalProcessed = 0;
  let totalErrors = 0;
  
  for (const file of files) {
    const result = await processFile(path.join(DATA_DIR, file), maps);
    totalProcessed += result.processed;
    totalErrors += result.errors;
    
    // Small delay between files
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Refresh materialized view
  await refreshMaterializedView();
  
  // Summary
  console.log('\n══════════════════════════════════════════');
  console.log('[council-metrics] FINAL SUMMARY');
  console.log(`  Files processed:    ${files.length}`);
  console.log(`  Total LGA months:   ${totalProcessed}`);
  console.log(`  Unmatched LGAs:     ${totalErrors}`);
  console.log('');
  
  // Show latest period coverage
  const coverage = await sql`
    SELECT report_year, report_month, COUNT(*) AS lgas_count
    FROM council_metrics
    GROUP BY report_year, report_month
    ORDER BY report_year DESC, report_month DESC
    LIMIT 5
  `;
  console.log('  Latest periods coverage:');
  for (const c of coverage) {
    console.log(`    ${c.report_year}-${String(c.report_month).padStart(2, '0')}: ${c.lgas_count} LGAs`);
  }
  console.log('══════════════════════════════════════════');
  
  console.log('\n[council-metrics] Phase 2 complete.');
  process.exit(0);
}

main().catch(err => {
  console.error('[council-metrics] Fatal:', err);
  process.exit(1);
});
