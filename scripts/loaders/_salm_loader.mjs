/**
 * _salm_loader.mjs — SALM SA2 Labour Market Data Loader
 *
 * Imports quarterly SA2-level labour force estimates from DEWR.
 * Data source: Small Area Labour Markets (SALM), December 2024 quarter
 * https://www.dewr.gov.au/employment-research/small-area-labour-markets
 *
 * Run: node scripts/loaders/_salm_loader.mjs
 *
 * Output:
 *   - Populates salm_sa2_data table:
 *     - 510 VIC SA2 rows × 3 metrics
 *     - Latest quarter (Dec-24) + full historical time series
 *     - Per-column availability flags
 *   - Reports coverage summary
 */

import { readFileSync, existsSync } from 'fs';
import { neon } from '@neondatabase/serverless';

const CSV_PATH = 'data/salm-dec-2024.csv';
const LATEST_QUARTER = 'Dec-24';

// ── DB ──
function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set');
  }
  return neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
}

// ── Parse SALM CSV ──
function parseSalmCsv(csvPath) {
  const raw = readFileSync(csvPath, 'utf8');
  const lines = raw.split('\n').filter(l => l.trim().length > 0);

  // First line is the note/header, second line is the column header
  const headerLine = lines[1];
  const cells = splitCsvLine(headerLine);
  const quarterCols = cells.slice(3); // "Data Item", "SA2 Name", "SA2 Code", then quarterly columns

  // Track column indices for target quarters
  const columnMapping = {};
  quarterCols.forEach((q, i) => {
    columnMapping[q] = 3 + i; // offset by 3 for initial non-quarter columns
  });

  // Parse data rows (skip first 2 header lines)
  const dataRows = [];
  for (let i = 2; i < lines.length; i++) {
    const row = splitCsvLine(lines[i]);
    if (row.length < 4) continue;

    const dataItem = row[0].trim();
    const sa2Name = row[1].trim();
    const sa2Code = row[2].trim();

    dataRows.push({
      dataItem,
      sa2Name,
      sa2Code,
      values: row.slice(3),
      quarterCols,
    });
  }

  return { dataRows, quarterCols };
}

// ── Simple CSV line splitter (handles quoted fields) ──
function splitCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  // Strip trailing \r from last value (CRLF line endings)
  if (result.length > 0) {
    result[result.length - 1] = result[result.length - 1].replace(/\r$/, '');
  }
  return result;
}

// ── Convert "-" or empty to null ──
function parseNumeric(val) {
  if (!val || val.trim() === '-' || val.trim() === '') return null;
  // Strip quotes AND thousand-separator commas (e.g. "1,761" → 1761)
  const cleaned = val.trim().replace(/"/g, '').replace(/,/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

// ── Group data by SA2 ──
function groupBySa2(dataRows) {
  const sa2Map = new Map();

  for (const row of dataRows) {
    const code = row.sa2Code;
    if (!sa2Map.has(code)) {
      sa2Map.set(code, {
        sa2_code: code,
        sa2_name: row.sa2Name,
        labour_force: null,
        unemployed: null,
        unemployment_rate: null,
        historical: {},
        quarters: [],
      });
    }

    const entry = sa2Map.get(code);

    // Parse latest quarter (Dec-24) values
    const dec24Idx = row.quarterCols.indexOf(LATEST_QUARTER);
    if (dec24Idx >= 0 && dec24Idx < row.values.length) {
      const val = parseNumeric(row.values[dec24Idx]);
      if (row.dataItem === 'Smoothed labour force (persons)') {
        entry.labour_force = val;
      } else if (row.dataItem === 'Smoothed unemployment (persons)') {
        entry.unemployed = val;
      } else if (row.dataItem === 'Smoothed unemployment rate (%)') {
        entry.unemployment_rate = val;
      }
    }

    // Parse historical quarterly values
    for (let qi = 0; qi < row.quarterCols.length && qi < row.values.length; qi++) {
      const qName = row.quarterCols[qi];
      const val = parseNumeric(row.values[qi]);
      if (val != null) {
        if (!entry.historical[qName]) {
          entry.historical[qName] = {};
        }
        if (row.dataItem === 'Smoothed labour force (persons)') {
          entry.historical[qName].lf = val;
        } else if (row.dataItem === 'Smoothed unemployment (persons)') {
          entry.historical[qName].unemp = val;
        } else if (row.dataItem === 'Smoothed unemployment rate (%)') {
          entry.historical[qName].rate = val;
        }
      }
    }
  }

  return sa2Map;
}

// ── Main loader ──
async function loadSalm() {
  console.log('[salm-loader] Starting SALM data import...');
  const t0 = Date.now();

  // 1. Parse CSV
  if (!existsSync(CSV_PATH)) {
    console.error(`[salm-loader] CSV not found: ${CSV_PATH}`);
    console.error('Download from: https://www.dewr.gov.au/employment-research/small-area-labour-markets');
    process.exit(1);
  }

  console.log(`[salm-loader] Reading ${CSV_PATH}...`);
  const { dataRows, quarterCols } = parseSalmCsv(CSV_PATH);
  console.log(`[salm-loader] Parsed ${dataRows.length} data rows (${dataRows.length / 3} SA2s × 3 metrics)`);
  console.log(`[salm-loader] Quarterly columns: ${quarterCols.length} (${quarterCols[0]} to ${quarterCols[quarterCols.length - 1]})`);

  // 2. Group by SA2
  const sa2Map = groupBySa2(dataRows);
  console.log(`[salm-loader] Grouped into ${sa2Map.size} unique SA2s`);

  // 3. Filter VIC SA2s
  const vicSa2s = [];
  for (const [code, entry] of sa2Map) {
    if (code.startsWith('2')) {
      vicSa2s.push(entry);
    }
  }
  console.log(`[salm-loader] VIC SA2s: ${vicSa2s.length}`);

  // 4. Compute availability stats
  const sql = getSql();

  let inserted = 0;
  let errors = 0;

  for (const entry of vicSa2s) {
    const hasLF = entry.labour_force != null;
    const hasUnemp = entry.unemployed != null;
    const hasRate = entry.unemployment_rate != null;
    const qCount = Object.keys(entry.historical).length;

    try {
      await sql`
        INSERT INTO salm_sa2_data (
          sa2_code, sa2_name,
          latest_quarter,
          labour_force, unemployed, unemployment_rate,
          historical_data,
          has_labour_force, has_unemployed, has_unemployment_rate,
          quarters_available,
          updated_at
        ) VALUES (
          ${entry.sa2_code}, ${entry.sa2_name},
          ${LATEST_QUARTER},
          ${entry.labour_force}, ${entry.unemployed}, ${entry.unemployment_rate},
          ${JSON.stringify(entry.historical)}::jsonb,
          ${hasLF}, ${hasUnemp}, ${hasRate},
          ${qCount},
          NOW()
        )
        ON CONFLICT (sa2_code) DO UPDATE SET
          sa2_name = EXCLUDED.sa2_name,
          latest_quarter = EXCLUDED.latest_quarter,
          labour_force = EXCLUDED.labour_force,
          unemployed = EXCLUDED.unemployed,
          unemployment_rate = EXCLUDED.unemployment_rate,
          historical_data = EXCLUDED.historical_data,
          has_labour_force = EXCLUDED.has_labour_force,
          has_unemployed = EXCLUDED.has_unemployed,
          has_unemployment_rate = EXCLUDED.has_unemployment_rate,
          quarters_available = EXCLUDED.quarters_available,
          updated_at = NOW()
      `;
      inserted++;
    } catch (e) {
      console.warn(`[salm-loader] Error inserting ${entry.sa2_code}: ${e.message.substring(0, 100)}`);
      errors++;
    }

    if (inserted % 100 === 0) {
      process.stdout.write(`[salm-loader] ${inserted}/560 VIC SA2s...\r`);
    }
  }

  // 5. Summary stats
  const withRate = vicSa2s.filter(e => e.unemployment_rate != null).length;
  const withLF = vicSa2s.filter(e => e.labour_force != null).length;
  const withUnemp = vicSa2s.filter(e => e.unemployed != null).length;

  console.log(`\n[salm-loader] ✓ Import complete:`);
  console.log(`  Inserted: ${inserted} VIC SA2s`);
  console.log(`  Errors: ${errors}`);
  console.log(`  With unemployment rate: ${withRate}/${vicSa2s.length}`);
  console.log(`  With labour force: ${withLF}/${vicSa2s.length}`);
  console.log(`  With unemployed count: ${withUnemp}/${vicSa2s.length}`);
  console.log(`  Time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  return { inserted, errors, total: vicSa2s.length, withRate, withLF };
}

// ── CLI entry ──
if (process.argv[1] && process.argv[1].endsWith('_salm_loader.mjs')) {
  loadSalm()
    .then(r => {
      if (r.errors > 0) process.exit(1);
      process.exit(0);
    })
    .catch(e => {
      console.error('[salm-loader] Fatal:', e);
      process.exit(1);
    });
}

export { loadSalm };
