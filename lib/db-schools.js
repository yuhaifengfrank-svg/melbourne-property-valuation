// ── 学校数据库 Schema ──
// 基于 ACARA Data Access Program
// School Location 2025 + School Profile 2025
// 用于 suburb intelligence pages

import { getSql } from "../api/_db.js";

let initialized = false;

export async function ensureSchoolSchema(sql) {
  if (initialized) return;
  if (!sql) sql = getSql();

  await sql`
    CREATE TABLE IF NOT EXISTS school_locations (
      calendar_year INTEGER,
      acara_sml_id INTEGER PRIMARY KEY,
      location_age_id INTEGER,
      school_age_id INTEGER,
      rolled_school_id INTEGER,
      school_name TEXT NOT NULL,
      suburb TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'VIC',
      postcode TEXT,
      school_sector TEXT,           -- Government / Catholic / Independent
      school_type TEXT,             -- Primary / Secondary / Combined / Special
      special_school INTEGER,
      campus_type TEXT,
      latitude NUMERIC(10,7),
      longitude NUMERIC(10,7),
      abs_remoteness_area INTEGER,
      abs_remoteness_name TEXT,
      meshblock TEXT,
      sa1 TEXT,
      sa2_code TEXT,
      sa2_name TEXT,
      sa3_code TEXT,
      sa3_name TEXT,
      sa4_code TEXT,
      sa4_name TEXT,
      lga_code TEXT,
      lga_name TEXT,
      state_electoral_code TEXT,
      state_electoral_name TEXT,
      commonwealth_electoral_code TEXT,
      commonwealth_electoral_name TEXT
    )
  `;

  // ICSEA + 学校概要
  await sql`
    CREATE TABLE IF NOT EXISTS school_profiles (
      calendar_year INTEGER,
      acara_sml_id INTEGER REFERENCES school_locations(acara_sml_id),
      location_age_id INTEGER,
      school_age_id INTEGER,
      school_name TEXT,
      suburb TEXT,
      state TEXT,
      postcode TEXT,
      school_sector TEXT,
      school_type TEXT,
      campus_type TEXT,
      rolled_reporting_description TEXT,
      school_url TEXT,
      governing_body TEXT,
      governing_body_url TEXT,
      year_range TEXT,
      geolocation TEXT,
      icsea NUMERIC(6,1),           -- Index of Community Socio-Educational Advantage
      icsea_percentile INTEGER,
      bottom_sea_quarter_pct NUMERIC(5,1),
      lower_middle_sea_quarter_pct NUMERIC(5,1),
      upper_middle_sea_quarter_pct NUMERIC(5,1),
      top_sea_quarter_pct NUMERIC(5,1),
      teaching_staff INTEGER,
      fte_teaching_staff NUMERIC(7,1),
      non_teaching_staff INTEGER,
      fte_non_teaching_staff NUMERIC(7,1),
      total_enrolments INTEGER,
      girls_enrolments INTEGER,
      boys_enrolments INTEGER,
      fte_enrolments NUMERIC(8,1),
      indigenous_enrolments_pct NUMERIC(5,1),
      lbote_yes_pct NUMERIC(5,1),   -- Language Background Other Than English
      lbote_no_pct NUMERIC(5,1),
      lbote_not_stated_pct NUMERIC(5,1)
    )
  `;

  // Indexes
  await sql`
    CREATE INDEX IF NOT EXISTS sl_suburb_idx ON school_locations (suburb, state)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS sl_lga_idx ON school_locations (lga_name)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS sp_icsea_idx ON school_profiles (icsea DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS sp_acara_sml_id_idx ON school_profiles (acara_sml_id)
  `;

  initialized = true;
}
