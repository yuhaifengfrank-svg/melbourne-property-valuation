import { getSql } from "../api/_db.js";
const sql = getSql();
const q = async (text, params) => {
  const raw = await sql.query(text, params);
  return raw ? Object.values(raw) : [];
};

// Check address-suburb match for box hill
const r = await q(
  "SELECT sale_address, LOWER(TRIM(suburb)) AS suburb FROM comparable_sales WHERE collection_date = $1::date AND LOWER(TRIM(suburb)) = $2 ORDER BY sale_date DESC LIMIT 15",
  ["2026-07-04", "box hill"]
);
console.log("Box Hill samples:");
for (const row of r) {
  const addr = (row.sale_address || "").toLowerCase();
  const sub = row.suburb;
  const match = addr.includes(sub);
  console.log((match ? "✅ " : "❌ ") + addr + " [" + sub + "]");
}

console.log("---");

// Overall accuracy
const stats = await q(
  "SELECT COUNT(*)::int AS total, " +
  "COUNT(*) FILTER (WHERE LOWER(sale_address) LIKE '%' || LOWER(TRIM(suburb)) || '%')::int AS addr_contains, " +
  "COUNT(*) FILTER (WHERE LOWER(sale_address) NOT LIKE '%' || LOWER(TRIM(suburb)) || '%')::int AS addr_no_suburb " +
  "FROM comparable_sales WHERE collection_date = $1::date",
  ["2026-07-04"]
);
console.log("Total:", stats[0].total, "| Contains suburb:", stats[0].addr_contains, "| No suburb in addr:", stats[0].addr_no_suburb);
