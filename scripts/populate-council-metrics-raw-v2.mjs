#!/usr/bin/env node
/**
 * scripts/populate-council-metrics-raw-v2.mjs
 *
 * Parse VBA/BPC raw permit CSV properly, aggregate by LGA+month,
 * look up correct lga_code from council_registry, then UPSERT.
 *
 * Run: node scripts/populate-council-metrics-raw-v2.mjs
 */

import fs from 'fs';
import { createRequire } from 'module';
import dotenv from 'dotenv';
dotenv.config();

const pg = createRequire(import.meta.url)('pg');
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const DATA_FILE = '/tmp/vba-data/2026-01_to_2026-03_raw.csv';

// ── VBA name → lookup helpers ──
function normalize(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function loadLgaMap() {
  const res = await client.query(`SELECT lga_code, lga_name FROM council_registry ORDER BY lga_code`);
  const exact = new Map();
  const slug = new Map();
  const tokens = new Map();
  
  for (const r of res.rows) {
    const n = r.lga_name.trim().toLowerCase();
    exact.set(n, r.lga_code);
    
    // Slugs
    const s = normalize(r.lga_name);
    slug.set(s, r.lga_code);
    
    // Also add without parenthetical
    const paren = n.replace(/\(.*?\)/g, '').trim();
    if (paren !== n) slug.set(normalize(paren), r.lga_code);
    
    // Common variants
    const shortName = r.lga_name.replace(/\(.*?\)/g, '').trim().split(',').shift().trim();
    if (shortName && shortName.length > 3) {
      slug.set(normalize(shortName), r.lga_code);
      // Also just the first word if it's unique
      const first = shortName.split(/\s+/).shift();
      if (first && first.length > 4) tokens.set(normalize(first), r.lga_code);
    }
    
    // Store row for fuzzy matching
    r._slug = s;
  }
  
  return { exact, slug, tokens, rows: res.rows, registryNames: new Set(exact.keys()) };
}

function matchLga(vbaName, maps) {
  if (!vbaName || !vbaName.trim()) return null;
  const v = vbaName.trim();
  
  // Skip postcode-only rows
  if (/^\d+\.?\d*$/.test(v)) return null;
  
  const n = v.toLowerCase();
  
  // Exact match (case-insensitive)
  if (maps.exact.has(n)) return maps.exact.get(n);
  
  // Try matching against full registry name
  for (const [regName, code] of maps.exact) {
    if (regName.includes(n) || n.includes(regName)) return code;
  }
  
  // Slug match
  const vslug = normalize(v);
  for (const [s, code] of maps.slug) {
    if (s.includes(vslug) || vslug.includes(s)) return code;
  }
  
  // Token-based: check if first token matches exactly
  const vFirst = v.split(/\s+/).shift().toLowerCase();
  const vSlugFirst = normalize(vFirst);
  for (const [t, code] of maps.tokens) {
    if (t === vSlugFirst) return code;
  }
  
  // Fuzzy: find best match by token overlap
  const vTokens = new Set(vslug.split(/(?<=.)(?=[A-Z])/).map(t => t.toLowerCase()).filter(t => t.length > 2));
  let bestScore = 0;
  let bestCode = null;
  for (const r of maps.rows) {
    const rTokens = new Set(r._slug.split(/(?<=.)(?=[A-Z])/).map(t => t.toLowerCase()).filter(t => t.length > 2));
    const overlap = [...vTokens].filter(t => rTokens.has(t)).length;
    const score = overlap / Math.min(vTokens.size, r._slug.length);
    if (score > bestScore) { bestScore = score; bestCode = r.lga_code; }
  }
  
  if (bestScore > 0.3) return bestCode;
  
  return null;
}

function parseCsv(text) {
  const rows = [];
  let current = '';
  let inQuotes = false;
  for (const ch of text) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === '\n' && !inQuotes) { rows.push(current); current = ''; }
    else current += ch;
  }
  if (current.trim()) rows.push(current);
  
  const result = [];
  for (const line of rows) {
    const fields = [];
    let f = '', q = false;
    for (const c of line) {
      if (c === '"') { q = !q; continue; }
      if (c === ',' && !q) {
        fields.push(f.trim());
        f = '';
      } else { f += c; }
    }
    fields.push(f.trim());
    result.push(fields);
  }
  return { header: result[0], rows: result.slice(1) };
}

function aggregate(csvRows, colIdx) {
  const agg = new Map();
  
  for (const row of csvRows) {
    const municip = (row[colIdx.municip] || '').trim();
    if (!municip || /^\d+\.?\d*$/.test(municip)) continue;
    
    const year = parseInt(row[colIdx.year]) || 0;
    const month = parseInt(row[colIdx.month]) || 0;
    const cost = parseFloat(row[colIdx.cost]) || 0;
    const use = row[colIdx.use] || '';
    const now = parseFloat(row[colIdx.now]) || 0;
    
    if (!year || !month) continue;
    
    const key = `${municip}|${year}|${month}`;
    let r = agg.get(key);
    if (!r) {
      r = { municip, year, month, totalC: 0, totalV: 0, newC: 0, newV: 0, multiC: 0, multiV: 0, altC: 0, altV: 0, commC: 0, commV: 0 };
      agg.set(key, r);
    }
    r.totalC++;
    r.totalV += cost;
    
    const isNew = now === 1;
    const isAlt = now === 3 || now === 4;
    const isComm = use === 'Commercial' || use === 'Retail' || use === 'Industrial';
    
    if (isNew && use === 'Domestic') { r.newC++; r.newV += cost; }
    else if (isNew && use === 'Residential') { r.multiC++; r.multiV += cost; }
    else if (isAlt) { r.altC++; r.altV += cost; }
    else if (isComm) { r.commC++; r.commV += cost; }
  }
  
  return agg;
}

async function main() {
  console.log('[VBA Raw → council_metrics v2]\n');
  
  // Read CSV
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`ERROR: ${DATA_FILE} not found`);
    process.exit(1);
  }
  const csvText = fs.readFileSync(DATA_FILE, 'utf8');
  const csv = parseCsv(csvText);
  console.log(`  CSV: ${csv.rows.length} rows`);
  
  // Column indices
  const h = csv.header;
  const ci = {
    municip: h.indexOf('Site_Municipality'),
    year: h.indexOf('BASIS_Month_Y'),
    month: h.indexOf('BASIS_Month_M'),
    cost: h.indexOf('Reported_Cost_of_works'),
    use: h.indexOf('BASIS_Building_Use'),
    now: h.indexOf('BASIS_NOW'),
  };
  
  // Connect DB
  await client.connect();
  console.log('  DB: connected');
  
  // Load LGA map
  const maps = await loadLgaMap();
  console.log(`  Registry: ${maps.rows.length} LGAs`);
  
  // Aggregate
  const agg = aggregate(csv.rows, ci);
  console.log(`  Aggregated: ${agg.size} LGA-month records\n`);
  
  // Match & insert
  let matched = 0, unmatched = 0, inserted = 0;
  const unames = new Set();
  
  // Clear old
  await client.query('DELETE FROM council_metrics');
  console.log('  Cleared old records\n');
  
  for (const [, rec] of agg) {
    const lgaCode = matchLga(rec.municip, maps);
    
    if (!lgaCode) {
      unmatched++;
      unames.add(rec.municip);
      continue;
    }
    matched++;
    
    const sql = `
      INSERT INTO council_metrics (
        lga_code, report_year, report_month,
        permits_new_residential, permits_new_multi_unit, 
        permits_alterations, permits_commercial, permits_total,
        value_new_residential, value_new_multi_unit, 
        value_alterations, value_commercial, value_total,
        avg_value_per_permit, data_source
      ) VALUES (
        '${lgaCode}', ${rec.year}, ${rec.month},
        ${rec.newC}, ${rec.multiC}, ${rec.altC}, ${rec.commC}, ${rec.totalC},
        ${Math.round(rec.newV/1000)}, ${Math.round(rec.multiV/1000)},
        ${Math.round(rec.altV/1000)}, ${Math.round(rec.commV/1000)}, ${Math.round(rec.totalV/1000)},
        ${rec.totalC > 0 ? Math.round(rec.totalV / rec.totalC / 1000) : 0},
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
    
    try {
      await client.query(sql);
      inserted++;
    } catch (e) {
      console.error(`  ✗ ${rec.municip}: ${e.message.substring(0, 60)}`);
    }
    
    if (inserted % 50 === 0) process.stdout.write(`  ⟳ ${inserted} inserted...\r`);
  }
  
  console.log(`\n\n  Match results: ${matched} matched, ${inserted} inserted, ${unmatched} unmatched`);
  
  if (unames.size > 0) {
    console.log(`\n  Unmatched (${unames.size}):`);
    for (const n of [...unames].sort()) console.log(`    "${n}"`);
  }
  
  // Refresh MV
  console.log('\n  Refreshing MV...');
  try { await client.query('REFRESH MATERIALIZED VIEW CONCURRENTLY council_metrics_12m'); }
  catch (e) {
    try { await client.query('REFRESH MATERIALIZED VIEW council_metrics_12m'); }
    catch (e2) { console.warn(`  ! ${e2.message}`); }
  }
  
  // Summary
  const total = await client.query('SELECT COUNT(*) FROM council_metrics');
  const cov = await client.query(
    'SELECT report_year, report_month, COUNT(*) AS lgas FROM council_metrics GROUP BY report_year, report_month ORDER BY report_year, report_month'
  );
  const missing = await client.query(
    `SELECT r.lga_code, r.lga_name FROM council_registry r 
     LEFT JOIN (SELECT DISTINCT lga_code FROM council_metrics) m ON r.lga_code = m.lga_code 
     WHERE m.lga_code IS NULL ORDER BY r.lga_code`
  );
  
  console.log('\n══════════════════════════════════════════');
  console.log(`  Total records: ${total.rows[0].count}`);
  for (const c of cov.rows) {
    console.log(`  ${c.report_year}-${String(c.report_month).padStart(2, '0')}: ${c.lgas} LGAs`);
  }
  if (missing.rows.length > 0) {
    console.log('\n  Missing from council_metrics:');
    for (const m of missing.rows) console.log(`    ${m.lga_code}: ${m.lga_name}`);
  }
  console.log('══════════════════════════════════════════\n');
  
  await client.end();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
