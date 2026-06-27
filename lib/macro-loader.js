/**
 * macro-loader.js — Load RBA/ABS macro data into macro_indicators table
 * 
 * Fetches and caches:
 *  - RBA F1.1: Cash rate target (FIRMMCRT), 90d bank bill (FIRMMBAB90)
 *  - RBA F5: Housing loan rates
 *  - CPI (ABS 6401.0), unemployment (ABS 6291.0)
 * 
 * Data validation: All entries pass through macro-validator before INSERT
 * Only records from 2018-01-01 onwards are loaded.
 */

import { neon } from '@neondatabase/serverless';
import { validateMacroEntry } from './macro-validator.js';

let _sql;

function getSql() {
  if (!_sql) {
    _sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
  }
  return _sql;
}

const MIN_DATE = '2018-01-01';
const BATCH_SIZE = 50;

// Parse "DD/MM/YYYY" to ISO date string
function parseDate(str) {
  if (!str || !str.trim()) return null;
  const [d, m, y] = str.trim().split('/');
  if (!d || !m || !y) return null;
  return `${y.padStart(4,'20')}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

/**
 * Validate and batch-insert macro entries
 * Returns { inserted, rejected }
 */
async function batchInsertEntries(indicator, entries) {
  const sql = getSql();
  let inserted = 0;
  let rejected = 0;

  for (const { isoDate, val } of entries) {
    const result = validateMacroEntry(indicator, val, isoDate, 'RBA F1.1');
    if (!result.valid) {
      if (rejected < 3) console.log(`  [REJECTED] ${indicator}=${val} on ${isoDate}: ${result.errors.join('; ')}`);
      rejected++;
      continue;
    }

    try {
      await sql`
        INSERT INTO macro_indicators (indicator, value, recorded_date, source)
        VALUES (${indicator}, ${val}::numeric, ${isoDate}::date, 'RBA F1.1')
        ON CONFLICT (indicator, recorded_date) 
        DO UPDATE SET value = EXCLUDED.value, fetched_at = NOW()
      `;
      inserted++;
    } catch(e) {
      if (rejected < 3) console.log(`  [ERROR] inserting ${indicator}=${val}: ${e.message}`);
      rejected++;
    }
  }

  return { inserted, rejected };
}

async function loadRBACashRate() {
  const rba = await fetch('https://www.rba.gov.au/statistics/tables/csv/f1.1-data.csv');
  if (!rba.ok) throw new Error(`RBA status ${rba.status}`);
  const txt = await rba.text();
  const lines = txt.split('\n');

  const cols = lines[10].split(',');
  const cashIdx = cols.findIndex(c => c === 'FIRMMCRT');
  if (cashIdx < 0) throw new Error('FIRMMCRT column not found');

  const entries = [];
  for (let i = 11; i < lines.length; i++) {
    const row = lines[i].split(',');
    const dateStr = row[0]?.trim();
    const valStr = row[cashIdx]?.trim();
    if (!dateStr || !valStr) continue;
    const isoDate = parseDate(dateStr);
    if (!isoDate || isoDate < MIN_DATE) continue;
    const val = parseFloat(valStr);
    if (isNaN(val)) continue;
    entries.push({ isoDate, val });
  }

  const { inserted, rejected } = await batchInsertEntries('cash_rate', entries);
  console.log(`[macro-loader] cash_rate: ${inserted} inserted, ${rejected} rejected (since ${MIN_DATE})`);
  return inserted;
}

async function loadRBABillRate() {
  const rba = await fetch('https://www.rba.gov.au/statistics/tables/csv/f1.1-data.csv');
  if (!rba.ok) throw new Error(`RBA status ${rba.status}`);
  const txt = await rba.text();
  const lines = txt.split('\n');

  const cols = lines[10].split(',');
  const billIdx = cols.findIndex(c => c === 'FIRMMBAB90');
  if (billIdx < 0) throw new Error('FIRMMBAB90 column not found');

  const entries = [];
  for (let i = 11; i < lines.length; i++) {
    const row = lines[i].split(',');
    const dateStr = row[0]?.trim();
    const valStr = row[billIdx]?.trim();
    if (!dateStr || !valStr) continue;
    const isoDate = parseDate(dateStr);
    if (!isoDate || isoDate < MIN_DATE) continue;
    const val = parseFloat(valStr);
    if (isNaN(val)) continue;
    entries.push({ isoDate, val });
  }

  const { inserted, rejected } = await batchInsertEntries('bill_90d_rate', entries);
  console.log(`[macro-loader] bill_90d_rate: ${inserted} inserted, ${rejected} rejected (since ${MIN_DATE})`);
  return inserted;
}

async function loadAll() {
  const t0 = Date.now();
  console.log(`[macro-loader] Loading macro data since ${MIN_DATE}...`);
  await loadRBACashRate();
  await loadRBABillRate();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[macro-loader] ✓ Complete in ${elapsed}s`);
}

if (process.argv[1] && process.argv[1].includes('macro-loader')) {
  loadAll().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

export { loadAll, loadRBACashRate, loadRBABillRate };
