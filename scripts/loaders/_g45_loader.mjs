#!/usr/bin/env node
/**
 * _g45_loader.mjs — ABS Census 2021 G41 Dwelling Structure by Bedrooms
 *
 * Reads: data/2021Census_G41_VIC_SA2.csv (from 2021_GCP_SA2_for_VIC_short-header.zip)
 * Writes: census_sa2_data.g41 (JSONB)
 *
 * Column indices (0-based, 118 total columns):
 *   9  = Separate_house_Total
 *   18 = SDRTHT_1story_Total
 *   27 = SDRTHT_2story_Total
 *   36 = SDRTHT_Total
 *   45 = Flat_1-2story_Total
 *   54 = Flat_3story_Total
 *   63 = Flat_4-8story_Total
 *   72 = Flat_9+story_Total
 *   81 = Flat_Attached_Total
 *   90 = Flat_Total (all types)
 *   99 = Other_dwelling_Total
 *   108 = Dwelling_NS_Total
 *   109-116 = Total bedrooms by count (0-6+, NS)
 *   117 = Total_Total (grand total)
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[g45-loader] DATABASE_URL not set');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Column indices (0-based)
const COL_SEP_HOUSE_TOTAL = 9;
const COL_SEMI_1S_TOTAL   = 18;
const COL_SEMI_2S_TOTAL   = 27;
const COL_SEMI_TOTAL      = 36;  // All semi-detached
const COL_FLAT_12S_TOTAL  = 45;
const COL_FLAT_3S_TOTAL   = 54;
const COL_FLAT_48S_TOTAL  = 63;
const COL_FLAT_9P_TOTAL   = 72;
const COL_FLAT_ATT_TOTAL  = 81;
const COL_FLAT_TOTAL      = 90;
const COL_OTHER_TOTAL     = 99;
const COL_NS_TOTAL        = 108;
const COL_BR_0            = 109;
const COL_BR_1            = 110;
const COL_BR_2            = 111;
const COL_BR_3            = 112;
const COL_BR_4            = 113;
const COL_BR_5            = 114;
const COL_BR_6P           = 115;
const COL_BR_NS           = 116;
const COL_GRAND_TOTAL     = 117;

function parseNumeric(val) {
  if (val == null || val === '' || val === '-' || val === 'NA') return null;
  const cleaned = String(val).trim().replace(/,/g, '');
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n; // Return 0 for missing instead of null for calculation safety
}

function safeDivide(a, b) {
  if (b == null || b === 0) return null;
  const pct = (a / b) * 100;
  return Math.round(pct * 10) / 10;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += char; }
  }
  result.push(current);
  if (result.length > 0) result[result.length - 1] = result[result.length - 1].replace(/\r$/, '');
  return result;
}

async function main() {
  console.log('[g45-loader] Starting G45 dwelling structure import...');

  const csvPath = join(PROJECT_ROOT, 'data', '2021Census_G41_VIC_SA2.csv');
  const raw = readFileSync(csvPath, 'utf8');
  const lines = raw.split('\n').filter(l => l.trim().length > 0);

  console.log(`[g45-loader] Total lines: ${lines.length - 1} data rows`);

  let imported = 0;
  let errors = 0;
  let withData = 0;

  for (let i = 1; i < lines.length; i++) {
    try {
      const cells = parseCSVLine(lines[i]);
      const sa2Code = cells[0];
      if (!sa2Code || sa2Code === 'SA2_CODE_2021') continue;

      // Totals by dwelling type
      const sepHouse   = parseNumeric(cells[COL_SEP_HOUSE_TOTAL]);
      const semi1S     = parseNumeric(cells[COL_SEMI_1S_TOTAL]);
      const semi2S     = parseNumeric(cells[COL_SEMI_2S_TOTAL]);
      const semiTotal  = semi1S + semi2S;
      const flatTotal  = parseNumeric(cells[COL_FLAT_TOTAL]);
      const otherTotal = parseNumeric(cells[COL_OTHER_TOTAL]);
      const nsTotal    = parseNumeric(cells[COL_NS_TOTAL]);
      const grandTotal = parseNumeric(cells[COL_GRAND_TOTAL]);

      // Bedroom breakdowns
      const br0  = parseNumeric(cells[COL_BR_0]);
      const br1  = parseNumeric(cells[COL_BR_1]);
      const br2  = parseNumeric(cells[COL_BR_2]);
      const br3  = parseNumeric(cells[COL_BR_3]);
      const br4  = parseNumeric(cells[COL_BR_4]);
      const br5  = parseNumeric(cells[COL_BR_5]);
      const br6p = parseNumeric(cells[COL_BR_6P]);
      const brNS = parseNumeric(cells[COL_BR_NS]);

      if (grandTotal > 0) withData++;

      // Percentages
      const sepPct  = safeDivide(sepHouse, grandTotal);
      const flatPct = safeDivide(flatTotal, grandTotal);
      const semiPct = safeDivide(semiTotal, grandTotal);
      const otherPct = safeDivide(otherTotal, grandTotal);
      const nosPct  = safeDivide(nsTotal, grandTotal);

      const br3plus = safeDivide(br3 + br4 + br5 + br6p, grandTotal);
      const br12    = safeDivide(br1 + br2, grandTotal);

      const g45Json = JSON.stringify({
        total_dwellings: grandTotal,
        sep_house_total: sepHouse,
        sep_house_pct: sepPct,
        semi_total: semiTotal,
        semi_pct: semiPct,
        flat_total: flatTotal,
        flat_pct: flatPct,
        other_total: otherTotal,
        other_pct: otherPct,
        nos_total: nsTotal,
        nos_pct: nosPct,
        br_0: br0,
        br_1: br1,
        br_2: br2,
        br_3: br3,
        br_4: br4,
        br_5: br5,
        br_6_plus: br6p,
        br_ns: brNS,
        pct_3br_plus: br3plus,
        pct_1br_2br: br12,
      });

      await pool.query(
        `UPDATE census_sa2_data SET g41 = $2::jsonb, updated_at = NOW() WHERE sa2_code = $1`,
        [sa2Code, g45Json]
      );

      imported++;
    } catch (e) {
      errors++;
      if (errors <= 3) console.error(`[g45-loader] Error at line ${i + 1}: ${e.message.substring(0, 120)}`);
    }
  }

  await pool.end();

  console.log(`[g45-loader] ✓ Import complete:`);
  console.log(`  SA2s processed: ${imported}`);
  console.log(`  With dwelling counts: ${withData}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Time: ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

const start = Date.now();
main().catch(e => { console.error('[g45-loader] Fatal:', e.message); process.exit(1); });
