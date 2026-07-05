// ── Dump all suburbs to /tmp/all-suburbs.json ──
// Used by run-all-one-per-suburb.sh
// Mirrors daily-batch-collection.mjs logic: school_locations SA4 + comparable_sales fallback
import { getSql } from "../api/_db.js";
import fs from "fs";

const sql = getSql();
const q = async (text, params) => {
  const raw = await sql.query(text, params);
  return raw ? Object.values(raw) : [];
};

async function main() {
  const melbSA4 = ["205","206","207","208","209","210","211","212"];
  const main = await q(
    `SELECT LOWER(TRIM(suburb)) AS suburb, state, MODE() WITHIN GROUP (ORDER BY postcode) AS postcode
     FROM school_locations WHERE sa4_code = ANY($1) AND state = 'VIC'
     GROUP BY LOWER(TRIM(suburb)), state ORDER BY LOWER(TRIM(suburb))`,
    [melbSA4]
  );

  const extra = await q(
    `SELECT DISTINCT LOWER(TRIM(suburb)) AS suburb, state, MODE() WITHIN GROUP (ORDER BY postcode) AS postcode
     FROM comparable_sales
     WHERE LOWER(TRIM(suburb)) NOT IN (SELECT DISTINCT LOWER(TRIM(suburb)) FROM school_locations WHERE sa4_code = ANY($1))
     GROUP BY LOWER(TRIM(suburb)), state`,
    [melbSA4]
  );

  const seen = new Set(main.map(r => r.suburb));
  const combined = [...main];
  for (const r of extra) {
    if (!seen.has(r.suburb)) { combined.push(r); seen.add(r.suburb); }
  }
  const filtered = combined.filter(r => r.suburb !== "sans souci");
  fs.writeFileSync("/tmp/all-suburbs.json", JSON.stringify(filtered));
  console.log("Total suburbs:", filtered.length);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
