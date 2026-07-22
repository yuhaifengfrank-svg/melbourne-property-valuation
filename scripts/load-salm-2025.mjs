#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { parseSalmFile } from "../lib/salm-data-parser.js";

const args = new Map(process.argv.slice(2).map((value, index, all) => value.startsWith("--") ? [value, all[index + 1]?.startsWith("--") ? true : all[index + 1]] : null).filter(Boolean));
const file = args.get("--file");
const quarter = args.get("--quarter") || "Dec-25";
const apply = args.has("--apply");
if (!file) throw new Error("--file is required");

const rows = parseSalmFile(file, quarter).filter((row) => row.sa2_code.startsWith("2"));
const sourceHash = createHash("sha256").update(readFileSync(file)).digest("hex");
const valid = rows.filter((row) => row.employment_count != null && row.employment_growth_yoy != null);
console.log(JSON.stringify({ mode: apply ? "apply" : "check", quarter, vicRows: rows.length, completeEmploymentRows: valid.length, sourceHash }, null, 2));
if (!apply) process.exit(0);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for --apply");

const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: "no-store" } });
for (const row of rows) {
  await sql`
    INSERT INTO salm_sa2_data (
      sa2_code, sa2_name, latest_quarter, labour_force, unemployed, unemployment_rate,
      historical_data, has_labour_force, has_unemployed, has_unemployment_rate,
      quarters_available, employment_count, employment_growth_yoy,
      employment_growth_base_quarter, updated_at
    ) VALUES (
      ${row.sa2_code}, ${row.sa2_name}, ${row.latest_quarter}, ${row.labour_force}, ${row.unemployed}, ${row.unemployment_rate},
      ${JSON.stringify(row.historical_data)}::jsonb, ${row.labour_force != null}, ${row.unemployed != null}, ${row.unemployment_rate != null},
      ${row.quarters_available}, ${row.employment_count}, ${row.employment_growth_yoy},
      ${row.employment_growth_base_quarter}, NOW()
    ) ON CONFLICT (sa2_code) DO UPDATE SET
      sa2_name=EXCLUDED.sa2_name, latest_quarter=EXCLUDED.latest_quarter,
      labour_force=EXCLUDED.labour_force, unemployed=EXCLUDED.unemployed,
      unemployment_rate=EXCLUDED.unemployment_rate, historical_data=EXCLUDED.historical_data,
      has_labour_force=EXCLUDED.has_labour_force, has_unemployed=EXCLUDED.has_unemployed,
      has_unemployment_rate=EXCLUDED.has_unemployment_rate, quarters_available=EXCLUDED.quarters_available,
      employment_count=EXCLUDED.employment_count, employment_growth_yoy=EXCLUDED.employment_growth_yoy,
      employment_growth_base_quarter=EXCLUDED.employment_growth_base_quarter, updated_at=NOW()
  `;
}

await sql`
  INSERT INTO suburb_sa2_membership (suburb,state,sa2_code,allocation_weight,weight_basis,source_key)
  VALUES
    ('oakleigh','VIC','212051326',1,'verified single SA2','dewr_salm_abs_asgs2021'),
    ('mount waverley','VIC','212051323',${5683 / 12480},'ABS 2021 total dwellings','dewr_salm_abs_asgs2021'),
    ('mount waverley','VIC','212051324',${6797 / 12480},'ABS 2021 total dwellings','dewr_salm_abs_asgs2021')
  ON CONFLICT (suburb,state,sa2_code) DO UPDATE SET
    allocation_weight=EXCLUDED.allocation_weight, weight_basis=EXCLUDED.weight_basis,
    source_key=EXCLUDED.source_key, verified_at=NOW()
`;

await sql`
  WITH single_map AS (
    SELECT sm.suburb, sm.state, s.employment_count, s.employment_growth_yoy,
           s.unemployment_rate, s.latest_quarter
    FROM suburb_sa2_map sm JOIN salm_sa2_data s USING (sa2_code)
    WHERE NOT EXISTS (
      SELECT 1 FROM suburb_sa2_membership m
      WHERE LOWER(m.suburb)=LOWER(sm.suburb) AND m.state=sm.state
    )
  )
  UPDATE suburb_metrics target SET
    supply_employment_count=source.employment_count,
    supply_employment_growth_yoy=source.employment_growth_yoy,
    supply_employment_growth=source.employment_growth_yoy,
    supply_unemployment_rate=source.unemployment_rate,
    supply_employment_period=source.latest_quarter,
    supply_unemployment_quarter=source.latest_quarter,
    conf_income=CASE WHEN census.g02 ? 'Median_tot_hhd_inc_weekly' THEN 80 ELSE target.conf_income END,
    updated_at=NOW()
  FROM single_map source
  LEFT JOIN suburb_sa2_map mapping ON LOWER(mapping.suburb)=LOWER(source.suburb) AND mapping.state=source.state
  LEFT JOIN census_sa2_data census ON census.sa2_code=mapping.sa2_code
  WHERE LOWER(target.suburb)=LOWER(source.suburb) AND target.state=source.state
`;

await sql`
  WITH member_values AS (
    SELECT m.suburb,m.state,s.latest_quarter,
      COUNT(*)::int member_count,
      SUM(s.labour_force)::numeric labour_force,
      SUM(s.unemployed)::numeric unemployed,
      MAX(s.unemployment_rate)::numeric reported_unemployment_rate,
      SUM(s.employment_count)::numeric employment_count,
      SUM((s.historical_data->s.employment_growth_base_quarter->>'lf')::numeric - (s.historical_data->s.employment_growth_base_quarter->>'unemp')::numeric)::numeric base_employment
    FROM suburb_sa2_membership m JOIN salm_sa2_data s USING(sa2_code)
    GROUP BY m.suburb,m.state,s.latest_quarter
  ), aggregate AS (
    SELECT *, CASE WHEN member_count=1 THEN reported_unemployment_rate ELSE unemployed/NULLIF(labour_force,0)*100 END unemployment_rate,
      (employment_count/NULLIF(base_employment,0)-1)*100 employment_growth_yoy
    FROM member_values
  )
  UPDATE suburb_metrics target SET
    supply_employment_count=source.employment_count,
    supply_employment_growth_yoy=source.employment_growth_yoy,
    supply_employment_growth=source.employment_growth_yoy,
    supply_unemployment_rate=source.unemployment_rate,
    supply_employment_period=source.latest_quarter,
    supply_unemployment_quarter=source.latest_quarter,
    conf_income=80,
    updated_at=NOW()
  FROM aggregate source
  WHERE LOWER(target.suburb)=LOWER(source.suburb) AND target.state=source.state
`;

console.log(JSON.stringify({ applied: true, quarter, vicRows: rows.length, sourceHash }, null, 2));
