// ── 快速批量导入 School Profiles ──
// 单独运行：node import-acara-profiles.mjs

import 'dotenv/config';
import XLSX from 'xlsx';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const PATH = '/tmp/acara-school-profile-2025.xlsx';

async function main() {
  // Drop FK if it exists
  await sql`ALTER TABLE school_profiles DROP CONSTRAINT IF EXISTS school_profiles_acara_sml_id_fkey`;

  // Truncate
  await sql`TRUNCATE school_profiles`;

  // Read
  const wb = XLSX.readFile(PATH);
  const ws = wb.Sheets['SchoolProfile 2025'];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const vicRows = data.slice(1).filter(r => r && r[0] && (r[6] || '').toUpperCase() === 'VIC');
  console.log('VIC profile rows:', vicRows.length);

  const BATCH = 100;
  let inserted = 0;
  let total = vicRows.length;

  const q = (v) => v === undefined || v === '' ? null : (typeof v === 'string' ? v.replace(/'/g, "''") : v);
  
  for (let batchStart = 0; batchStart < total; batchStart += BATCH) {
    const batch = vicRows.slice(batchStart, batchStart + BATCH);
    
    // Use parameterized batch insert via sql template
    for (const r of batch) {
      try {
        await sql`
          INSERT INTO school_profiles (
            calendar_year, acara_sml_id, location_age_id, school_age_id,
            school_name, suburb, state, postcode,
            school_sector, school_type, campus_type,
            rolled_reporting_description, school_url,
            governing_body, governing_body_url,
            year_range, geolocation,
            icsea, icsea_percentile,
            bottom_sea_quarter_pct, lower_middle_sea_quarter_pct,
            upper_middle_sea_quarter_pct, top_sea_quarter_pct,
            teaching_staff, fte_teaching_staff,
            non_teaching_staff, fte_non_teaching_staff,
            total_enrolments, girls_enrolments, boys_enrolments, fte_enrolments,
            indigenous_enrolments_pct,
            lbote_yes_pct, lbote_no_pct, lbote_not_stated_pct
          ) VALUES (
            ${q(r[0])}, ${q(r[1])}, ${q(r[2])}, ${q(r[3])},
            ${q(r[4])}, ${q(r[5])}, ${q(r[6])}, ${q(r[7])},
            ${q(r[8])}, ${q(r[9])}, ${q(r[10])},
            ${q(r[11])}, ${q(r[12])},
            ${q(r[13])}, ${q(r[14])},
            ${q(r[15])}, ${q(r[16])},
            ${q(r[17])}, ${q(r[18])},
            ${q(r[19])}, ${q(r[20])},
            ${q(r[21])}, ${q(r[22])},
            ${q(r[23])}, ${q(r[24])},
            ${q(r[25])}, ${q(r[26])},
            ${q(r[27])}, ${q(r[28])}, ${q(r[29])}, ${q(r[30])},
            ${q(r[31])},
            ${q(r[32])}, ${q(r[33])}, ${q(r[34])}
          )
        `;
        inserted++;
      } catch (err) {
        if (!err.message?.includes('duplicate key')) {
          console.error(`  Error row ${r[1]} ${r[4]}: ${err.message.substring(0,100)}`);
        }
      }
    }

    process.stdout.write(`\r  ${inserted}/${total} (${((inserted/total)*100).toFixed(1)}%)`);
  }

  console.log('\n✅ Done');
  
  const [cnt] = await sql`SELECT COUNT(*) FROM school_profiles`;
  console.log('Count:', cnt.count);
  
  const [icsea] = await sql`SELECT COUNT(*) FROM school_profiles WHERE icsea IS NOT NULL`;
  console.log('With ICSEA:', icsea.count);
}

main().catch(e => { console.error(e); process.exit(1); });
