import { getSql } from "../api/_db.js";
import fs from "fs";

const sql = getSql();
const q = async (text, params) => {
  const raw = await sql.query(text, params);
  return raw ? Object.values(raw) : [];
};

const r = await q(
  `SELECT LOWER(TRIM(suburb)) AS s, 'VIC' AS state,
          MODE() WITHIN GROUP (ORDER BY postcode) AS pc
   FROM comparable_sales WHERE collection_date = $1::date
   GROUP BY LOWER(TRIM(suburb))
   HAVING COUNT(*) >= 30 AND COUNT(*) < 50
   ORDER BY COUNT(*), LOWER(TRIM(suburb))`,
  ["2026-07-04"]
);

fs.writeFileSync("/tmp/medium-targets.json", JSON.stringify(r.map(x => ({suburb: x.s, state: x.state, postcode: x.pc}))));
console.log("Suburbs:", r.length);
