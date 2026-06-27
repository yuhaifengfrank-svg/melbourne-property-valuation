// 补充 10 个 suburb 的 House 数据到 ≥ 10 条
// 用法（在远程服务器上）：
//   cd /root/auhh && DATABASE_URL="..." node scripts/topup-house-data.mjs 2>&1 | tee topup.log

import { scrapeSoldData } from "../lib/browser-collector.js";
import { ensureComparableSchema } from "../lib/db-schema.js";
import { getSql } from "../api/_db.js";

const TARGETS = [
  ["Balwyn",        "VIC", "3103"],  // now 3
  ["Toorak",        "VIC", "3142"],  // now 2
  ["Balwyn North",  "VIC", "3104"],  // now 2
  ["Brighton",      "VIC", "3186"],  // now 2
  ["Kew",           "VIC", "3101"],  // now 2
  ["Camberwell",    "VIC", "3124"],  // now 3
  ["Albert Park",   "VIC", "3206"],  // now 3
  ["Malvern",       "VIC", "3144"],  // now 1
  ["Glen Iris",     "VIC", "3146"],  // now 1
  ["Hawthorn East", "VIC", "3123"],  // now 1
];

const MIN_HOUSES = 10;
const PAGES = 6;

async function getCurrentCount(sql, suburb) {
  const r = await sql`
    SELECT COUNT(*)::int as cnt FROM comparable_sales
    WHERE suburb = ${suburb} AND state = 'VIC' AND property_type = 'House'
  `;
  return r[0].cnt;
}

async function main() {
  console.log("Starting House data topup...");
  const sql = await getSql();
  await ensureComparableSchema(sql);

  let totalNew = 0;
  for (const [suburb, state, postcode] of TARGETS) {
    const before = await getCurrentCount(sql, suburb);
    if (before >= MIN_HOUSES) {
      console.log(`SKIP ${suburb}: already ${before} House records`);
      continue;
    }

    console.log(`\n--- ${suburb} (${before} House → target ${MIN_HOUSES}) ---`);
    let raw;
    try {
      raw = await scrapeSoldData(suburb, state, postcode, PAGES);
    } catch (err) {
      console.warn(`  scrape failed: ${err.message}`);
      continue;
    }

    const sales = Array.isArray(raw) ? raw : [];
    const houseSales = sales.filter(s => (s.propertyType || "").toLowerCase() === "house");
    console.log(`  Fetched ${sales.length} total, ${houseSales.length} Houses`);

    let saved = 0;
    for (const s of houseSales) {
      try {
        const result = await sql`
          INSERT INTO comparable_sales (
            sale_address, sale_price, sale_date, property_type,
            bedrooms, bathrooms, car_spaces, land_size_sqm,
            suburb, state, postcode,
            source_url, source_name, raw_price_text,
            collection_date, collection_round, batch_id
          ) VALUES (
            ${s.address || ""},
            ${s.price ? Number(s.price) : null},
            ${s.saleDate || null},
            ${s.propertyType || null},
            ${s.bedrooms ? Number(s.bedrooms) : null},
            ${s.bathrooms ? Number(s.bathrooms) : null},
            ${s.carSpaces ? Number(s.carSpaces) : null},
            ${s.landSize ? Number(s.landSize) : null},
            ${suburb}, ${state}, ${postcode},
            ${s.sourceUrl || ""},
            ${s.source || "unknown"},
            ${s.rawPrice || null},
            CURRENT_DATE, 'topup', 'topup_house_20260621'
          )
          ON CONFLICT (sale_address, sale_date, sale_price, source_name)
            WHERE sale_date IS NOT NULL AND sale_price IS NOT NULL DO NOTHING
        `;
        if (result && result.length > 0 && result[0]?.id) saved++;
      } catch {}
    }

    const after = await getCurrentCount(sql, suburb);
    const netNew = after - before;
    totalNew += netNew;
    console.log(`  Saved ${saved} → now ${after} House (net +${netNew})`);
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n=== DONE: +${totalNew} House records ===`);
  console.log("Final counts:");
  for (const [suburb] of TARGETS) {
    const cnt = await getCurrentCount(sql, suburb);
    console.log(`  ${suburb.padEnd(18)} ${cnt} House ${cnt >= MIN_HOUSES ? "✅" : "❌"}`);
  }
  process.exit(0);
}

main().catch(err => { console.error("Fatal:", err.message); process.exit(1); });
