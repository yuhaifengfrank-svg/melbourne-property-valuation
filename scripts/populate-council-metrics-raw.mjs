#!/usr/bin/env node
/**
 * scripts/populate-council-metrics-raw.mjs
 *
 * Populate council_metrics from VBA/BPC raw permit data (XLSB → CSV export).
 *
 * Unlike populate-council-metrics.mjs (which expects pre-aggregated XLSX),
 * this script aggregates raw per-permit rows into per-LGA monthly stats.
 *
 * Input: CSV from pyxlsb-parsed XLSB raw data
 *   Columns used:
 *     - Site_Municipality (LGA name)
 *     - BASIS_Month_Y, BASIS_Month_M (year, month)
 *     - BASIS_Building_Use (Domestic, Commercial, Retail, etc.)
 *     - BASIS_NOW (Nature of Work: 1=New, 4=Alteration, etc.)
 *     - Reported_Cost_of_works (project cost $)
 *
 * Mapping:
 *   New Residential (houses)   = Building Use=Domestic + NOW=1 (New)
 *   New Multi Unit             = Building Use=Residential + NOW=1 (New)
 *   Alterations                = NOW=4 (Alteration) [all building uses]
 *   Commercial/Industrial      = Building Use=Commercial|Retail|Industrial [all NOW]
 *
 * Run: node scripts/populate-council-metrics-raw.mjs
 *
 * Safety: UPSERT only — never deletes
 */

import fs from 'fs';
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
const DATA_FILE = '/tmp/vba-data/2026-01_to_2026-03_raw.csv';

/**
 * Parse raw CSV (comma-separated, may contain quoted commas).
 * Returns { header: string[], rows: string[][] }
 */
function parseCsv(text) {
  const lines = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === '\n' && !inQuotes) {
      lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);
  
  const result = [];
  for (const line of lines) {
    const fields = [];
    let field = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        q = !q;
      } else if (c === ',' && !q) {
        fields.push(field.trim());
        field = '';
      } else {
        field += c;
      }
    }
    fields.push(field.trim());
    result.push(fields);
  }
  
  return { header: result[0], rows: result.slice(1) };
}

/**
 * Aggregate raw permit rows into per-LGA per-month stats.
 * Returns Map keyed by "municip|year|month" → aggregated record.
 */
function aggregatePermits(csv) {
  const idx = {};
  csv.header.forEach((h, i) => { idx[h.trim()] = i; });
  
  // Required columns
  const col = {
    municip: idx['Site_Municipality'],
    year: idx['BASIS_Month_Y'],
    month: idx['BASIS_Month_M'],
    cost: idx['Reported_Cost_of_works'],
    use: idx['BASIS_Building_Use'],
    now: idx['BASIS_NOW'],
  };
  
  const agg = new Map();
  
  for (const row of csv.rows) {
    const municip = row[col.municip]?.trim() || '';
    if (!municip) continue;
    
    const year = parseInt(row[col.year]) || 0;
    const month = parseInt(row[col.month]) || 0;
    const cost = parseFloat(row[col.cost]) || 0;
    const buildingUse = (row[col.use] || '').trim();
    const nowCode = parseFloat(row[col.now]) || 0;
    
    if (!year || !month) continue;
    
    const key = `${municip}|${year}|${month}`;
    if (!agg.has(key)) {
      agg.set(key, {
        lgaName: municip,
        year, month,
        totalCount: 0, totalValue: 0,
        newResCount: 0, newResValue: 0,
        multiCount: 0, multiValue: 0,
        altCount: 0, altValue: 0,
        commCount: 0, commValue: 0,
      });
    }
    
    const r = agg.get(key);
    r.totalCount++;
    r.totalValue += cost;
    
    // Classify by building use + nature of work
    const isNew = nowCode === 1;
    const isAlterationOrExtension = nowCode === 3 || nowCode === 4;
    const isCommercial = buildingUse === 'Commercial' || buildingUse === 'Retail' || buildingUse === 'Industrial';
    
    if (isNew && buildingUse === 'Domestic') {
      r.newResCount++;
      r.newResValue += cost;
    } else if (isNew && buildingUse === 'Residential') {
      r.multiCount++;
      r.multiValue += cost;
    } else if (isAlterationOrExtension) {
      r.altCount++;
      r.altValue += cost;
    } else if (isCommercial) {
      r.commCount++;
      r.commValue += cost;
    }
    // Other types (Hospital/Healthcare, Public Buildings) → not categorized separately
  }
  
  return agg;
}

async function loadLgaNameMap() {
  const rows = await sql`
    SELECT lga_code, lga_name, REGEXP_REPLACE(LOWER(lga_name), '[^a-z0-9]', '', 'g') AS slug
    FROM council_registry
  `;
  const nameMap = {};
  const slugMap = {};
  const fuzzyRows = [];
  for (const r of rows) {
    const nameLower = r.lga_name.toLowerCase().trim();
    nameMap[nameLower] = r.lga_code;
    // Also strip common suffixes
    const variants = [
      nameLower,
      nameLower.replace(/, (city|shire|rural city|borough|rural city|city of)$/i, ''),
      nameLower.replace(/^(city|shire|borough|rural city) of /i, ''),
    ];
    for (const v of [...new Set(variants)]) {
      const slug = v.replace(/[^a-z0-9]/g, '');
      slugMap[slug] = r.lga_code;
    }
    fuzzyRows.push(r);
  }
  return { nameMap, slugMap, rows: fuzzyRows };
}

function matchLga(vbaName, maps) {
  if (!vbaName) return null;
  const clean = vbaName.trim();
  
  // Direct match (case-insensitive)
  const lower = clean.toLowerCase();
  if (maps.nameMap[lower]) return maps.nameMap[lower];
  
  // Try with "City of" prefix/suffix variations
  const variants = [
    lower,
    `${lower} city council`,
    `${lower} council`,
    `city of ${lower}`,
    `shire of ${lower}`,
  ];
  for (const v of [...new Set(variants)]) {
    if (maps.nameMap[v]) return maps.nameMap[v];
  }
  
  // Slug match
  const slug = lower.replace(/[^a-z0-9]/g, '');
  if (maps.slugMap[slug]) return maps.slugMap[slug];
  
  // Fuzzy: partial match
  for (const r of maps.rows) {
    const rName = r.lga_name.toLowerCase();
    const rSlug = rName.replace(/[^a-z0-9]/g, '');
    // Check if VBA name is contained in registry name or vice versa
    if (rSlug.includes(slug) || slug.includes(rSlug)) {
      return r.lga_code;
    }
    // Check token overlap
    const vbaTokens = new Set(slug.split(/(?=[A-Z])/).filter(Boolean).map(t => t.toLowerCase()));
    const regTokens = new Set(rSlug.split(/(?=[A-Z])/).filter(Boolean).map(t => t.toLowerCase()));
    vbaTokens.forEach(t => {
      if (t === 'city' || t === 'council' || t === 'shire' || t === 'rural' || t === 'of') vbaTokens.delete(t);
    });
    regTokens.forEach(t => {
      if (t === 'city' || t === 'council' || t === 'shire' || t === 'rural' || t === 'of') regTokens.delete(t);
    });
    const intersection = [...vbaTokens].filter(t => regTokens.has(t));
    if (intersection.length >= Math.max(1, Math.min(vbaTokens.size, regTokens.size) - 1)) {
      return r.lga_code;
    }
  }
  
  return null;
}

async function main() {
  console.log('[council-metrics-raw] Aggregating VBA raw permit data → council_metrics\n');
  
  // Check input CSV
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`[council-metrics-raw] ERROR: Input CSV not found: ${DATA_FILE}`);
    console.error('  First convert XLSB to CSV using pyxlsb');
    process.exit(1);
  }
  
  console.log(`  Input: ${DATA_FILE}`);
  const csvText = fs.readFileSync(DATA_FILE, 'utf8');
  const csv = parseCsv(csvText);
  console.log(`  Rows: ${csv.rows.length}`);
  console.log(`  Cols: ${csv.header.length}\n`);
  
  // Check council_registry
  const check = await sql`SELECT COUNT(*) FROM council_registry`;
  if (parseInt(check[0].count) === 0) {
    console.error('[council-metrics-raw] ERROR: council_registry is empty');
    process.exit(1);
  }
  console.log(`[council-metrics-raw] council_registry has ${check[0].count} LGAs\n`);
  
  // Load LGA mapping
  const maps = await loadLgaNameMap();
  
  // Aggregate
  const agg = aggregatePermits(csv);
  console.log(`[council-metrics-raw] Aggregated to ${agg.size} LGA-month records\n`);
  
  // Match and insert
  let matched = 0;
  let unmatched = 0;
  let inserted = 0;
  const unmatchedNames = new Set();
  
  // Process LGA-month pairs
  const entries = [...agg.entries()];
  for (const [key, rec] of entries) {
    const lgaCode = matchLga(rec.lgaName, maps);
    
    if (!lgaCode) {
      unmatched++;
      unmatchedNames.add(rec.lgaName);
      continue;
    }
    matched++;
    
    try {
      await sql`
        INSERT INTO council_metrics 
          (lga_code, report_year, report_month,
           permits_new_residential, permits_new_multi_unit, permits_alterations, permits_commercial, permits_total,
           value_new_residential, value_new_multi_unit, value_alterations, value_commercial, value_total,
           avg_value_per_permit, data_source)
        VALUES (
          ${lgaCode}, ${rec.year}, ${rec.month},
          ${rec.newResCount}, ${rec.multiCount}, ${rec.altCount}, ${rec.commCount}, ${rec.totalCount},
          ${Math.round(rec.newResValue / 1000)},  -- convert $ to $'000
          ${Math.round(rec.multiValue / 1000)},
          ${Math.round(rec.altValue / 1000)},
          ${Math.round(rec.commValue / 1000)},
          ${Math.round(rec.totalValue / 1000)},
          ${rec.totalCount > 0 ? Math.round(rec.totalValue / rec.totalCount / 1000) : 0},
          'VBA/BPC Raw Permit Data (Mar 2026)'
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
          avg_value_per_permit = EXCLUDED.avg_value_per_permit,
          updated_at = NOW()
      `;
      inserted++;
    } catch (err) {
      console.error(`    ✗ DB error for ${rec.lgaName} (rec.year}-${rec.month}): ${err.message}`);
    }
    
    // Show progress every 20
    if (inserted % 20 === 0) {
      process.stdout.write(`  ⟳ ${inserted} inserted...\r`);
    }
  }
  
  console.log(`\n  ✓ Match results: ${matched} matched, ${inserted} inserted, ${unmatched} unmatched`);
  
  if (unmatchedNames.size > 0) {
    console.log(`\n  Unmatched municipalities (${unmatchedNames.size}):`);
    for (const name of [...unmatchedNames].sort()) {
      console.log(`    "${name}"`);
    }
  }
  
  // Refresh materialized view
  console.log('\n  Refreshing council_metrics_12m...');
  try {
    await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY council_metrics_12m`;
  } catch (e) {
    try {
      await sql`REFRESH MATERIALIZED VIEW council_metrics_12m`;
    } catch (e2) {
      console.warn(`  ! Cannot refresh: ${e2.message}`);
    }
  }
  console.log('  ✓ council_metrics_12m refreshed\n');
  
  // Summary
  const cov = await sql`
    SELECT report_year, report_month, COUNT(*) AS lgas
    FROM council_metrics
    GROUP BY report_year, report_month
    ORDER BY report_year, report_month
  `;
  
  const totalMetrics = await sql`SELECT COUNT(*) FROM council_metrics`;
  console.log('══════════════════════════════════════════');
  console.log('[council-metrics-raw] FINAL SUMMARY');
  console.log(`  Total council_metrics records: ${totalMetrics[0].count}`);
  console.log('  Periods covered:');
  for (const c of cov) {
    console.log(`    ${c.report_year}-${String(c.report_month).padStart(2, '0')}: ${c.lgas} LGAs`);
  }
  console.log('══════════════════════════════════════════\n');
  
  process.exit(0);
}

main().catch(err => {
  console.error('[council-metrics-raw] Fatal:', err);
  process.exit(1);
});
