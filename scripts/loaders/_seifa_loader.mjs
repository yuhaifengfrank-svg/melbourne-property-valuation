/**
 * _seifa_loader.mjs — Load SEIFA SA2 2021 data from ABS xlsx into census_sa2_data
 *
 * Reads Table 1 from the SEIFA SA2 xlsx, which has columns:
 *   SA2_CODE | SA2_NAME | IRSD_Score | IRSD_Decile | IRSAD_Score | IRSAD_Decile | IER_Score | IER_Decile | IEO_Score | IEO_Decile | Population
 *
 * Populates new JSONB column `seifa` in census_sa2_data:
 *   { irsd_score, irsd_decile, irsad_score, irsad_decile, ier_score, ier_decile, ieo_score, ieo_decile }
 *
 * Usage: DATABASE_URL=... node _seifa_loader.mjs
 */

import xlsx from 'xlsx';
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

const XLSX_PATH = '/tmp/seifa_sa2.xlsx';

const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });
async function q(text, params = []) { return sql.query(text, params); }

function parseSeifa() {
  const buf = readFileSync(XLSX_PATH);
  const wb = xlsx.read(buf, { type: 'buffer' });
  const ws = wb.Sheets['Table 1'];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });
  
  // Row 5 is header: SA2_CODE | SA2_NAME | IRSD_Score | IRSD_Decile | IRSAD_Score | IRSAD_Decile | IER_Score | IER_Decile | IEO_Score | IEO_Decile | Population
  // Data starts at row 6
  const records = [];
  for (let r = 6; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row[0]) continue;
    
    const sa2Code = String(row[0]).trim();
    const sa2Name = String(row[1] || '').trim();
    
    // Columns: [2]=IRSD_Score, [3]=IRSD_Decile, [4]=IRSAD_Score, [5]=IRSAD_Decile,
    //           [6]=IER_Score, [7]=IER_Decile, [8]=IEO_Score, [9]=IEO_Decile, [10]=Population
    const p = idx => {
      const v = row[idx];
      if (v == null || v === '' || v === '-') return null;
      const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,]/g, ''));
      return isNaN(n) ? null : n;
    };
    
    const irsd_score  = p(2);
    const irsd_decile = p(3);
    const irsad_score = p(4);
    const irsad_decile = p(5);
    const ier_score   = p(6);
    const ier_decile  = p(7);
    const ieo_score   = p(8);
    const ieo_decile  = p(9);
    
    if (irsd_score == null && irsad_score == null && ier_score == null && ieo_score == null) {
      continue; // skip excluded areas with no scores
    }
    
    records.push({
      sa2_code: sa2Code,
      sa2_name: sa2Name,
      irsd_score: irsd_score != null ? Math.round(irsd_score * 100) / 100 : null,
      irsd_decile: irsd_decile != null ? Math.round(irsd_decile) : null,
      irsad_score: irsad_score != null ? Math.round(irsad_score * 100) / 100 : null,
      irsad_decile: irsad_decile != null ? Math.round(irsad_decile) : null,
      ier_score: ier_score != null ? Math.round(ier_score * 100) / 100 : null,
      ier_decile: ier_decile != null ? Math.round(ier_decile) : null,
      ieo_score: ieo_score != null ? Math.round(ieo_score * 100) / 100 : null,
      ieo_decile: ieo_decile != null ? Math.round(ieo_decile) : null,
    });
  }
  
  return records;
}

async function addColumnIfMissing() {
  // Check if seifa column exists
  const cols = await q(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'census_sa2_data' AND column_name = 'seifa'"
  );
  
  if (cols.length === 0) {
    await q("ALTER TABLE census_sa2_data ADD COLUMN IF NOT EXISTS seifa JSONB");
    console.log('[seifa] Added seifa column to census_sa2_data');
  } else {
    console.log('[seifa] seifa column already exists');
  }
}

async function main() {
  console.log('[seifa] Parsing SEIFA xlsx...');
  const records = parseSeifa();
  console.log(`[seifa] Parsed ${records.length} SA2 records`);
  
  await addColumnIfMissing();
  
  let updated = 0, skipped = 0;
  for (const rec of records) {
    const seifaJson = JSON.stringify({
      irsd_score: rec.irsd_score,
      irsd_decile: rec.irsd_decile,
      irsad_score: rec.irsad_score,
      irsad_decile: rec.irsad_decile,
      ier_score: rec.ier_score,
      ier_decile: rec.ier_decile,
      ieo_score: rec.ieo_score,
      ieo_decile: rec.ieo_decile,
    });
    
    const result = await q(
      `UPDATE census_sa2_data SET seifa = $1::jsonb, updated_at = NOW() WHERE sa2_code = $2::text`,
      [seifaJson, rec.sa2_code]
    );
    
    if (result.rowCount === 0) {
      // SA2 code not in our DB — insert with just seifa
      await q(
        `INSERT INTO census_sa2_data (sa2_code, seifa, updated_at) VALUES ($1::text, $2::jsonb, NOW())
         ON CONFLICT (sa2_code) DO UPDATE SET seifa = EXCLUDED.seifa, updated_at = NOW()`,
        [rec.sa2_code, seifaJson]
      );
      skipped++;
    } else {
      updated++;
    }
    
    if ((updated + skipped) % 500 === 0) {
      console.log(`[seifa] ${updated} updated, ${skipped} inserted...`);
    }
  }
  
  console.log(`\n[seifa] Done: ${updated} SA2s updated, ${skipped} SA2s inserted (not previously in DB)`);
  
  // Quick verification
  const stats = await q(`
    SELECT 
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE seifa->>'irsd_score' IS NOT NULL)::int AS with_irsd,
      COUNT(*) FILTER (WHERE seifa->>'ieo_score' IS NOT NULL)::int AS with_ieo,
      ROUND(AVG((seifa->>'irsd_score')::numeric)::numeric, 2) AS avg_irsd,
      ROUND(AVG((seifa->>'ieo_score')::numeric)::numeric, 2) AS avg_ieo
    FROM census_sa2_data
  `);
  console.log('[seifa] Verification:', JSON.stringify(stats[0]));
}

main().catch(e => { console.error('FAIL:', e.message, e.stack?.slice(0, 500)); process.exit(1); });
