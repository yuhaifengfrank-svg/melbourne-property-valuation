// ── 导入 ACARA School Location 2025 + School Profile 2025 到 Neon DB ──
// 用法: node import-acara-schools.mjs

import 'dotenv/config';
import XLSX from 'xlsx';
import { getSql } from './api/_db.js';
import { ensureSchoolSchema } from './lib/db-schools.js';

const PROFILE_PATH = '/tmp/acara-school-profile-2025.xlsx';
const LOCATION_PATH = '/tmp/acara-school-location-2025.xlsx';

async function main() {
  const sql = getSql();

  // 1. 创建 schema
  console.log('📦 Ensuring school schema...');
  await ensureSchoolSchema(sql);
  console.log('✅ Schema ready');

  // 2. 导入 School Locations
  console.log(`\n📖 Reading School Locations from ${LOCATION_PATH}...`);
  const locWb = XLSX.readFile(LOCATION_PATH);
  const locWs = locWb.Sheets['SchoolLocations 2025'];
  const locData = XLSX.utils.sheet_to_json(locWs, { header: 1 });

  let locInserted = 0;
  let locSkipped = 0;
  const BATCH = 100;

  for (let i = 1; i < locData.length; i++) {
    const r = locData[i];
    if (!r || !r[0]) { locSkipped++; continue; }
    if (r[7] !== 'VIC') { locSkipped++; continue; }

    try {
      await sql`
        INSERT INTO school_locations (
          calendar_year, acara_sml_id, location_age_id, school_age_id, rolled_school_id,
          school_name, suburb, state, postcode, school_sector, school_type,
          special_school, campus_type, latitude, longitude,
          abs_remoteness_area, abs_remoteness_name, meshblock,
          sa1, sa2_code, sa2_name, sa3_code, sa3_name, sa4_code, sa4_name,
          lga_code, lga_name,
          state_electoral_code, state_electoral_name,
          commonwealth_electoral_code, commonwealth_electoral_name
        ) VALUES (
          ${r[0]}, ${r[1]}, ${r[2]}, ${r[3]}, ${r[4]},
          ${r[5]}, ${r[6]}, ${r[7]}, ${r[8]}, ${r[9]}, ${r[10]},
          ${r[11]}, ${r[12]}, ${r[13]}, ${r[14]},
          ${r[15]}, ${r[16]}, ${r[17]},
          ${r[18]}, ${r[19]}, ${r[20]}, ${r[21]}, ${r[22]}, ${r[23]}, ${r[24]},
          ${r[25]}, ${r[26]},
          ${r[27]}, ${r[28]},
          ${r[29]}, ${r[30]}
        )
        ON CONFLICT (acara_sml_id) DO NOTHING
      `;
      locInserted++;
    } catch (err) {
      if (!err.message?.includes('duplicate key')) {
        console.error(`  ❌ Location row ${i} ${r[5]}: ${err.message.substring(0, 100)}`);
      }
      locSkipped++;
    }

    if (i % BATCH === 0) {
      const pct = ((i / locData.length) * 100).toFixed(1);
      console.log(`  Location: ${locInserted} inserted / ${locSkipped} skipped (${pct}%)`);
    }
  }
  console.log(`✅ Locations done: ${locInserted} VIC schools inserted`);

  // 3. 导入 School Profiles（含 ICSEA）
  console.log(`\n📖 Reading School Profiles from ${PROFILE_PATH}...`);
  const profWb = XLSX.readFile(PROFILE_PATH);
  const profWs = profWb.Sheets['SchoolProfile 2025'];
  const profData = XLSX.utils.sheet_to_json(profWs, { header: 1 });

  let profInserted = 0;
  let profSkipped = 0;

  for (let i = 1; i < profData.length; i++) {
    const r = profData[i];
    if (!r || !r[0]) { profSkipped++; continue; }
    if (r[6] !== 'VIC') { profSkipped++; continue; }

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
          ${r[0]}, ${r[1]}, ${r[2]}, ${r[3]},
          ${r[4]}, ${r[5]}, ${r[6]}, ${r[7]},
          ${r[8]}, ${r[9]}, ${r[10]},
          ${r[11]}, ${r[12]},
          ${r[13]}, ${r[14]},
          ${r[15]}, ${r[16]},
          ${r[17]}, ${r[18]},
          ${r[19]}, ${r[20]},
          ${r[21]}, ${r[22]},
          ${r[23]}, ${r[24]},
          ${r[25]}, ${r[26]},
          ${r[27]}, ${r[28]}, ${r[29]}, ${r[30]},
          ${r[31]},
          ${r[32]}, ${r[33]}, ${r[34]}
        )
      `;
      profInserted++;
    } catch (err) {
      if (!err.message?.includes('duplicate key') && !err.message?.includes('foreign key')) {
        console.error(`  ❌ Profile row ${i} ${r[4]}: ${err.message.substring(0, 100)}`);
      }
      profSkipped++;
    }

    if (i % BATCH === 0) {
      const pct = ((i / profData.length) * 100).toFixed(1);
      console.log(`  Profile: ${profInserted} inserted / ${profSkipped} skipped (${pct}%)`);
    }
  }
  console.log(`✅ Profiles done: ${profInserted} VIC schools inserted`);

  // 4. 汇总
  const [locCount] = await sql`SELECT COUNT(*) FROM school_locations`;
  const [profCount] = await sql`SELECT COUNT(*) FROM school_profiles`;
  console.log(`\n📊 Summary:
  school_locations: ${locCount.count} rows
  school_profiles: ${profCount.count} rows`);

  console.log('✅ Done');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
