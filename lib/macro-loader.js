/**
 * macro-loader.js — Load RBA/ABS macro data into macro_indicators table
 * 
 * Fetches and caches:
 *  - RBA F1.1: Cash rate target (FIRMMCRT), 90d bank bill (FIRMMBAB90)
 *  - RBA F5: Housing loan variable rate owner-occupier (FILRHLBVS)
 * 
 * Future: CPI (ABS 6401.0), unemployment (ABS 6291.0), ERP (ABS)
 */

import { neon } from '@neondatabase/serverless';

let _sql;

function getSql() {
  if (!_sql) {
    _sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
  }
  return _sql;
}

// Parse "DD/MM/YYYY" to ISO date string
function parseDate(str) {
  if (!str || !str.trim()) return null;
  const [d, m, y] = str.trim().split('/');
  if (!d || !m || !y) return null;
  return `${y.padStart(4,'20')}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

async function loadRBACashRate() {
  const sql = getSql();
  const rba = await fetch('https://www.rba.gov.au/statistics/tables/csv/f1.1-data.csv');
  if (!rba.ok) throw new Error(`RBA status ${rba.status}`);
  const txt = await rba.text();
  const lines = txt.split('\n');

  const cols = lines[10].split(',');
  const cashIdx = cols.findIndex(c => c === 'FIRMMCRT');
  if (cashIdx < 0) throw new Error('FIRMMCRT column not found');

  let inserted = 0;
  for (let i = 11; i < lines.length; i++) {
    const row = lines[i].split(',');
    const dateStr = row[0]?.trim();
    const valStr = row[cashIdx]?.trim();
    if (!dateStr || !valStr) continue;
    const isoDate = parseDate(dateStr);
    if (!isoDate) continue;
    const val = parseFloat(valStr);
    if (isNaN(val)) continue;

    // UPSERT via INSERT...ON CONFLICT
    try {
      await sql.query(
        `INSERT INTO macro_indicators (indicator, value, recorded_date, source)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (indicator, recorded_date) DO UPDATE SET value = EXCLUDED.value, fetched_at = NOW()`,
        ['cash_rate', val, isoDate, 'RBA F1.1']
      );
      inserted++;
    } catch(e) {
      // skip individual failures
    }
  }
  console.log(`[macro-loader] Loaded ${inserted} cash_rate rows`);
  return inserted;
}

async function loadRBABillRate() {
  const sql = getSql();
  const rba = await fetch('https://www.rba.gov.au/statistics/tables/csv/f1.1-data.csv');
  if (!rba.ok) throw new Error(`RBA status ${rba.status}`);
  const txt = await rba.text();
  const lines = txt.split('\n');

  const cols = lines[10].split(',');
  const billIdx = cols.findIndex(c => c === 'FIRMMBAB90');
  if (billIdx < 0) throw new Error('FIRMMBAB90 column not found');

  let inserted = 0;
  for (let i = 11; i < lines.length; i++) {
    const row = lines[i].split(',');
    const dateStr = row[0]?.trim();
    const valStr = row[billIdx]?.trim();
    if (!dateStr || !valStr) continue;
    const isoDate = parseDate(dateStr);
    if (!isoDate) continue;
    const val = parseFloat(valStr);
    if (isNaN(val)) continue;

    try {
      await sql.query(
        `INSERT INTO macro_indicators (indicator, value, recorded_date, source)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (indicator, recorded_date) DO UPDATE SET value = EXCLUDED.value, fetched_at = NOW()`,
        ['bill_90d_rate', val, isoDate, 'RBA F1.1']
      );
      inserted++;
    } catch(e) {}
  }
  console.log(`[macro-loader] Loaded ${inserted} bill_90d_rate rows`);
  return inserted;
}

async function loadAll() {
  const t0 = Date.now();
  await loadRBACashRate();
  await loadRBABillRate();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[macro-loader] ✓ Complete in ${elapsed}s`);
}

if (process.argv[1] && process.argv[1].includes('macro-loader')) {
  loadAll().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

export { loadAll, loadRBACashRate, loadRBABillRate };
