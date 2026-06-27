import { neon } from "@neondatabase/serverless";
const sql = neon("postgresql://neondb_owner:***@ep-winter-band-a7qym6bq-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require");

const r = await sql`
  SELECT suburb, property_type, COUNT(*)::int as cnt
  FROM comparable_sales
  WHERE state = 'VIC'
    AND property_type IN ('House', 'Apartment', 'Unit', 'Townhouse', 'Villa')
  GROUP BY suburb, property_type
  ORDER BY suburb, property_type
`;

const sub = {};
for (const row of r) {
  if (!sub[row.suburb]) sub[row.suburb] = {house:0, unit:0, other:0, total:0, largeLotHouse:0};
  if (row.property_type === "House") sub[row.suburb].house = row.cnt;
  else if (["Apartment","Unit"].includes(row.property_type)) sub[row.suburb].unit = row.cnt;
  else sub[row.suburb].other += row.cnt;
  sub[row.suburb].total += row.cnt;
}

// large-lot houses per suburb
const r2 = await sql`
  SELECT suburb, COUNT(*)::int as cnt
  FROM comparable_sales
  WHERE state='VIC' AND property_type='House'
    AND land_size_sqm IS NOT NULL AND land_size_sqm >= 1500
  GROUP BY suburb
  ORDER BY suburb
`;
const llMap = {};
for (const row of r2) { llMap[row.suburb] = row.cnt; }
for (const [s,d] of Object.entries(sub)) d.largeLotHouse = llMap[s] || 0;

// All suburbs sorted by total data
const sorted = Object.entries(sub).sort((a,b) => a[1].total - b[1].total);

// Top 50 sparsest
console.log("=== 数据最少 TOP 50 suburb ===");
console.log("Suburb".padEnd(28) + "House".padStart(5) + "Unit".padStart(5) + "Other".padStart(5) + "Total".padStart(6) + "LLotH".padStart(6));
console.log("-".repeat(55));
for (const [s,d] of sorted.slice(0,50)) {
  console.log((s||"").padEnd(28) + String(d.house).padStart(5) + String(d.unit).padStart(5) + String(d.other).padStart(5) + String(d.total).padStart(6) + String(d.largeLotHouse).padStart(6));
}

// House 不足 6 条的
const lowHouse = Object.entries(sub).filter(([k,v]) => v.house < 6).sort((a,b) => a[1].house - b[1].house);
console.log("\n=== House < 6 条（共 " + lowHouse.length + " 个）===");
console.log("Suburb".padEnd(28) + "House".padStart(5) + "Unit".padStart(5) + "Other".padStart(5) + "Total".padStart(6) + "LLotH".padStart(6));
console.log("-".repeat(55));
for (const [s,d] of lowHouse) {
  console.log((s||"").padEnd(28) + String(d.house).padStart(5) + String(d.unit).padStart(5) + String(d.other).padStart(5) + String(d.total).padStart(6) + String(d.largeLotHouse).padStart(6));
}

// Total unique suburbs
console.log("\nUnique suburbs:", Object.keys(sub).length);
console.log("Total records:", Object.values(sub).reduce((a,b) => a + b.total, 0));

process.exit(0);
