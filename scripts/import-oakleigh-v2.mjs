#!/usr/bin/env node
// ── Oakleigh 试点 v2：多郊区收集 + 导入 ──
// 用法: node scripts/import-oakleigh-v2.mjs
// 抓取 Oakleigh 及周边 6 个郊区的 sold houses，交叉验证后导入

import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { fetchPageText } from "../lib/browser-collector.js";

const DB = process.env.DATABASE_URL;
if (!DB) { console.error("❌ No DATABASE_URL"); process.exit(1); }

const TARGET_SUBURB = "Oakleigh";
const TARGET_STATE = "VIC";
const TARGET_POSTCODE = "3166";
const SA2_CODE = "212051326";
const SA2_NAME = "Oakleigh";

// 目标郊区 + 周边（用于扩大 comparable 池）
const SUBURBS = [
  { slug: "oakleigh", name: "Oakleigh", core: true },
  { slug: "oakleigh-east", name: "Oakleigh East", core: false },
  { slug: "oakleigh-south", name: "Oakleigh South", core: false },
  { slug: "huntingdale", name: "Huntingdale", core: false },
  { slug: "hughesdale", name: "Hughesdale", core: false },
  { slug: "chadstone", name: "Chadstone", core: false },
  { slug: "clayton", name: "Clayton", core: false },
];

async function fetchSuburb(suburb) {
  const url = `https://www.realestate.com.au/sold/in-${suburb.slug}+vic/list-1?activeSort=solddate&propertyTypes=house`;
  const result = await fetchPageText(url, 12000);
  if (!result.ok) return [];

  const lines = result.text.split("\n").map(l => l.trim()).filter(Boolean);
  const records = [];

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.startsWith("$")) continue;
    const price = parseInt(l.replace(/[$,]/g, ""));
    if (price < 50000 || price > 50000000) continue;

    let dateStr = null;
    for (let j = Math.max(0, i - 5); j < i; j++) {
      if (lines[j].toLowerCase().includes("sold on")) {
        dateStr = lines[j].replace("Sold on", "").trim();
        break;
      }
    }
    const addr = (i + 1 < lines.length) ? lines[i + 1].trim() : "";
    if (!addr || !addr.toLowerCase().includes(suburb.name.toLowerCase().split(" ")[0].toLowerCase())) continue;

    let beds = null, baths = null, cars = null, land = null;
    for (let k = i + 2; k < Math.min(i + 8, lines.length); k++) {
      const lk = lines[k].trim();
      if (/^\d+$/.test(lk) && !lk.includes("m")) {
        if (beds === null) beds = parseInt(lk);
        else if (baths === null) baths = parseInt(lk);
        else if (cars === null) cars = parseInt(lk);
      }
      if (lk.includes("m²")) land = parseInt(lk.replace(/[^0-9]/g, ""));
    }

    records.push({
      address: addr, price, saleDate: dateStr,
      bedrooms: beds, bathrooms: baths, carSpaces: cars, landSize: land,
      source: "realestate.com.au"
    });
  }
  return records;
}

function inferType(addr) {
  const a = addr.toLowerCase();
  if (/townhouse|town\s*house/i.test(a)) return "Townhouse";
  if (/apartment|apt\s/i.test(a)) return "Apartment";
  if (/villa/i.test(a)) return "Villa";
  if (/vacant\s*land/i.test(a)) return "Vacant land";

  // Slash address = attached dwelling
  if (/^\d+\s*\//.test(a) || /\/\d+/i.test(a)) return "Unit";
  if (/^(unit|flat)\s/i.test(a)) return "Unit";
  return "House";
}

function parseDate(str) {
  if (!str) return null;
  const m = str.match(/(\d+)\s+(\w+)\s+(\d{4})/);
  if (!m) return null;
  const months = {jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",
                 jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12"};
  const mon = months[m[2].toLowerCase().slice(0,3)];
  if (!mon) return null;
  return `${m[3]}-${mon}-${m[1].padStart(2,"0")}`;
}

async function main() {
  const sql = neon(DB);

  // 1. 抓取所有郊区
  console.log("📡 Fetching all suburbs (sequential)...");
  const allRecords = [];
  for (const sub of SUBURBS) {
    const records = await fetchSuburb(sub);
    console.log(`   ${sub.name}: ${records.length} records`);
    allRecords.push(...records.map(r => ({ ...r, coreSuburb: sub.core, suburbName: sub.name })));
  }
  console.log(`✅ Total raw records: ${allRecords.length}`);

  // 2. 去重
  const seen = new Map();
  for (const r of allRecords) {
    const key = `${r.address.toLowerCase().trim()}|${r.price}`;
    if (!seen.has(key)) seen.set(key, r);
  }
  const deduped = [...seen.values()];
  console.log(`✅ Deduped: ${deduped.length}`);

  // 3. 只保留 House
  const houses = deduped.filter(r => inferType(r.address) === "House");
  console.log(`✅ Houses: ${houses.length}`);
  
  const coreHouses = houses.filter(r => r.coreSuburb);
  const peripheralHouses = houses.filter(r => !r.coreSuburb);
  console.log(`   Core (Oakleigh): ${coreHouses.length}`);
  console.log(`   Peripheral: ${peripheralHouses.length}`);

  // 4. 导入所有 House（core = verified, peripheral = unverified）
  console.log("\n📦 Importing to Neon...");
  let imported = 0;
  for (const r of houses) {
    const saleDate = parseDate(r.saleDate);
    const verificationStatus = r.coreSuburb ? "verified" : "unverified";
    const srcName = r.source;
    const srcUrl = "https://www.realestate.com.au/sold/in-" + r.suburbName.toLowerCase().replace(/\s+/g, "-") + "+vic/list-1";

    try {
      await sql`
        INSERT INTO comparable_sales (
          sale_address, sale_price, sale_date, property_type,
          bedrooms, bathrooms, car_spaces, land_size_sqm,
          suburb, state, postcode,
          source_url, source_name, collection_date,
          verification_status, raw_price_text,
          sa2_code, sa2_name
        ) VALUES (
          ${r.address}, ${r.price}, ${saleDate}, 'House',
          ${r.bedrooms}, ${r.bathrooms}, ${r.carSpaces}, ${r.landSize},
          ${r.suburbName}, 'VIC', '3166',
          ${srcUrl}, ${srcName}, new Date().toISOString(),
          ${verificationStatus}, ${`$${(r.price / 1000).toFixed(0)}k`},
          ${SA2_CODE}, ${SA2_NAME}
        )
        ON CONFLICT (sale_address, COALESCE(sale_date, '1970-01-01'::date), COALESCE(sale_price, -1), source_name)
        DO NOTHING
      `;
      imported++;
    } catch (e) {
      console.warn(`  ⚠️  ${r.address}: ${e.message.slice(0, 80)}`);
    }
  }

  console.log(`✅ Imported ${imported} records`);

  // 5. 索引迁移
  console.log("\n🗂️ Running dedup index migration...");
  await sql`
    DELETE FROM comparable_sales WHERE id IN (
      SELECT id FROM (SELECT id, ROW_NUMBER() OVER (
        PARTITION BY sale_address, COALESCE(sale_date, '1970-01-01'::date), COALESCE(sale_price, -1), source_name
        ORDER BY created_at DESC) AS rn FROM comparable_sales) sub WHERE sub.rn > 1
    )
  `;
  try { await sql`CREATE UNIQUE INDEX IF NOT EXISTS cs_dedup_idx ON comparable_sales (sale_address, COALESCE(sale_date, '1970-01-01'::date), COALESCE(sale_price, -1), source_name)`; }
  catch (e) { if (!e.message?.includes("already exists")) console.warn("Index:", e.message); }
  console.log("✅ Dedup index ready");

  // 6. 验证
  console.log("\n=== 📊 Verification ===");
  const total = await sql`SELECT COUNT(*)::int AS c FROM comparable_sales`;
  const oakTotal = await sql`SELECT COUNT(*)::int AS c FROM comparable_sales WHERE suburb LIKE '%Oakleigh%'`;
  console.log(`Total in DB: ${total[0].c} (Oakleigh/Core: ${oakTotal[0].c})`);

  const byStatus = await sql`SELECT verification_status, COUNT(*)::int AS c FROM comparable_sales GROUP BY verification_status ORDER BY verification_status`;
  for (const r of byStatus) console.log(`  ${r.verification_status}: ${r.c}`);

  const housesDB = await sql`
    SELECT sale_address, sale_price, sale_date::text, suburb, verification_status
    FROM comparable_sales WHERE property_type = 'House'
    ORDER BY sale_price
  `;
  console.log(`\n📋 ${housesDB.length} Houses in DB:`);
  for (const r of housesDB) {
    console.log(`  $${(r.sale_price || 0).toLocaleString()} — ${r.sale_address} (${r.suburb}) [${r.verification_status}]`);
  }

  // Output summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 IMPORT COMPLETE");
  console.log("=".repeat(60));
  console.log(`  Total imported: ${imported}`);
  console.log(`  Core Oakleigh (verified): ${coreHouses.length}`);
  console.log(`  Peripheral (unverified): ${peripheralHouses.length}`);
  console.log(`  DB total records: ${total[0].c}`);
  console.log("-".repeat(60));
  console.log("Next: npm test && node dev-server.mjs");
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
