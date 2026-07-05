import { getSql } from "../api/_db.js";
import XLSX from "xlsx";

const sql = getSql();
const q = async (text, params) => {
  const raw = await sql.query(text, params);
  return raw ? Object.values(raw) : [];
};

const r = await q(
  `SELECT
     LOWER(TRIM(suburb)) AS suburb,
     COUNT(*)::int AS records,
     COUNT(DISTINCT property_type)::int AS property_types,
     COUNT(DISTINCT source_name)::int AS data_sources,
     ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price))::int AS median_price,
     ROUND(AVG(sale_price))::int AS avg_price,
     ROUND(MIN(sale_price))::int AS min_price,
     ROUND(MAX(sale_price))::int AS max_price,
     ROUND(AVG(bedrooms)::numeric,1) AS avg_bedrooms,
     ROUND(AVG(bathrooms)::numeric,1) AS avg_bathrooms,
     ROUND(AVG(land_size_sqm)::numeric,0) AS avg_land_sqm
   FROM comparable_sales WHERE collection_date = $1::date
   GROUP BY LOWER(TRIM(suburb))
   ORDER BY LOWER(TRIM(suburb))`,
  ["2026-07-04"]
);

const ws = XLSX.utils.json_to_sheet(r);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Suburb Stats");

// Auto-width
const cols = ["suburb","records","property_types","data_sources","median_price","avg_price","min_price","max_price","avg_bedrooms","avg_bathrooms","avg_land_sqm"];
ws["!cols"] = cols.map(c => ({ wch: c === "suburb" ? 22 : 14 }));

// Freeze first row
ws["!rows"] = [{ hpx: 20 }];
ws["!autofilter"] = { ref: `A1:K${r.length+1}` };

const outPath = "/Users/FrankAI/Desktop/AusHomeValue_SuburbStats_20260704_1900.xlsx";
XLSX.writeFile(wb, outPath);
console.log("Written:", outPath);
console.log("Suburbs:", r.length);
