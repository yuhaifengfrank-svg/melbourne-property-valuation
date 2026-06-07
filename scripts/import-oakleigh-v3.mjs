#!/usr/bin/env node
// ── Oakleigh 试点 v3：多郊区收集 + 导入 ──
// 修复 tagged template null 问题

import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { fetchPageText } from "../lib/browser-collector.js";

const DB = process.env.DATABASE_URL;
if (!DB) { console.error("❌ No DATABASE_URL"); process.exit(1); }

const SA2_CODE = "212051326";
const SA2_NAME = "Oakleigh";

const SUBURBS = [
  { slug: "oakleigh", name: "Oakleigh", core: true, state: "VIC", pc: "3166" },
  { slug: "oakleigh-east", name: "Oakleigh East", core: false, state: "VIC", pc: "3166" },
  { slug: "oakleigh-south", name: "Oakleigh South", core: false, state: "VIC", pc: "3167" },
  { slug: "huntingdale", name: "Huntingdale", core: false, state: "VIC", pc: "3166" },
  { slug: "hughesdale", name: "Hughesdale", core: false, state: "VIC", pc: "3166" },
  { slug: "chadstone", name: "Chadstone", core: false, state: "VIC", pc: "3148" },
  { slug: "clayton", name: "Clayton", core: false, state: "VIC", pc: "3168" },
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

function escapeVal(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function importRecord(sql, r) {
  const dateStr = parseDate(r.saleDate);
  const postcode = r.postcode || "3166";
  const state = r.state || "VIC";
  const vStatus = r.verificationStatus || "unverified";
  const srcName = r.source || "realestate.com.au";
  const srcUrl = r.sourceUrl || "https://www.realestate.com.au/sold/in-" + r.suburbSlug + "+vic/list-1";
  const priceText = `$${(r.price || 0).toLocaleString()}`;
  const propertyType = inferType(r.address);
  const today = new Date().toISOString().slice(0, 10);

  const q = `INSERT INTO comparable_sales (
    sale_address, sale_price, sale_date, property_type,
    bedrooms, bathrooms, car_spaces, land_size_sqm,
    suburb, state, postcode,
    source_url, source_name, collection_date,
    verification_status, raw_price_text,
    sa2_code, sa2_name
  ) VALUES (
    ${escapeVal(r.address)},
    ${r.price},
    ${dateStr ? `'${dateStr}'::date` : 'NULL::date'},
    ${escapeVal(propertyType)},
    ${r.bedrooms ?? "NULL"},
    ${r.bathrooms ?? "NULL"},
    ${r.carSpaces ?? "NULL"},
    ${r.landSize ?? "NULL"},
    ${escapeVal(r.suburbName || "Oakleigh")},
    ${escapeVal(state)},
    ${escapeVal(postcode)},
    ${escapeVal(srcUrl)},
    ${escapeVal(srcName)},
    '${today}'::date,
    ${escapeVal(vStatus)},
    ${escapeVal(priceText)},
    ${SA2_CODE ? `'${SA2_CODE}'` : "NULL"},
    ${SA2_NAME ? `'${SA2_NAME}'` : "NULL"}
  )
  ON CONFLICT (sale_address, COALESCE(sale_date, '1970-01-01'::date), COALESCE(sale_price, -1), source_name)
  DO NOTHING`;

  await sql.unsafe(q);
}

async function main() {
  const sql = neon(DB);

  // 1. 清空旧数据
  await sql.unsafe("DELETE FROM comparable_sales");
  console.log("🗑️  Cleared comparable_sales");

  // 2. 抓取所有郊区
  console.log("📡 Fetching all suburbs (sequential)...");
  const allRecords = [];
  for (const sub of SUBURBS) {
    const records = await fetchSuburb(sub);
    console.log(`   ${sub.name}: ${records.length}`);
    allRecords.push(...records.map(r => ({
      ...r,
      coreSuburb: sub.core,
      suburbName: sub.name,
      suburbSlug: sub.slug,
      postcode: sub.pc,
      state: sub.state
    })));
  }
  console.log(`✅ Total raw: ${allRecords.length}`);

  // 3. 去重
  const seen = new Map();
  for (const r of allRecords) {
    const key = `${r.address.toLowerCase().trim()}|${r.price}`;
    if (!seen.has(key)) seen.set(key, r);
  }
  const deduped = [...seen.values()];
  console.log(`✅ Deduped: ${deduped.length}`);

  // 4. 只保留 House
  const houses = deduped.filter(r => inferType(r.address) === "House");
  console.log(`✅ Houses: ${houses.length}`);

  // 5. 标记 verification
  for (const r of houses) {
    r.verificationStatus = r.coreSuburb ? "verified" : "unverified";
  }
  const verified = houses.filter(r => r.verificationStatus === "verified");
  const unverified = houses.filter(r => r.verificationStatus === "unverified");
  console.log(`   Verified (Oakleigh): ${verified.length}`);
  console.log(`   Unverified (peripheral): ${unverified.length}`);

  // 6. 导入
  console.log("\n📦 Importing to Neon...");
  let imported = 0, failed = 0;
  for (const r of houses) {
    try {
      await importRecord(sql, r);
      imported++;
    } catch (e) {
      console.warn(`  ⚠️  ${r.address.slice(0, 40)}: ${e.message.slice(0, 80)}`);
      failed++;
    }
  }
  console.log(`✅ Imported: ${imported}, Failed: ${failed}`);

  // 7. 索引
  console.log("\n🗂️  Running dedup index...");
  await sql.unsafe(`DELETE FROM comparable_sales WHERE id IN (
    SELECT id FROM (SELECT id, ROW_NUMBER() OVER (
      PARTITION BY sale_address, COALESCE(sale_date, '1970-01-01'::date), COALESCE(sale_price, -1), source_name
      ORDER BY created_at DESC) AS rn FROM comparable_sales) sub WHERE sub.rn > 1
  )`);
  try { await sql.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS cs_dedup_idx ON comparable_sales (
    sale_address, COALESCE(sale_date, '1970-01-01'::date), COALESCE(sale_price, -1), source_name
  )`); } catch (e) { if (!e.message?.includes("already exists")) throw e; }
  console.log("✅ Dedup index ready");

  // 8. 验证
  console.log("\n=== 📊 Verification ===");
  const total = await sql.unsafe("SELECT COUNT(*)::int AS c FROM comparable_sales");
  console.log(`Total: ${total[0].c}`);
  const byStatus = await sql.unsafe(
    "SELECT verification_status, COUNT(*)::int AS c FROM comparable_sales GROUP BY verification_status ORDER BY verification_status"
  );
  for (const r of byStatus) console.log(`  ${r.verification_status}: ${r.c}`);

  const bySuburb = await sql.unsafe(
    "SELECT suburb, COUNT(*)::int AS c FROM comparable_sales GROUP BY suburb ORDER BY c DESC"
  );
  console.log("\nBy suburb:");
  for (const r of bySuburb) console.log(`  ${r.suburb}: ${r.c}`);

  const housesDB = await sql.unsafe(
    "SELECT sale_address, sale_price, sale_date::text, suburb, verification_status FROM comparable_sales WHERE property_type = 'House' ORDER BY sale_price"
  );
  console.log(`\n📋 ${housesDB.length} Houses:`);
  for (const r of housesDB) {
    console.log(`  $${(r.sale_price || 0).toLocaleString()} — ${r.sale_address} (${r.suburb}) [${r.verification_status}]`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("📊 IMPORT COMPLETE");
  console.log("=".repeat(60));
  console.log(`  Total imported: ${imported}`);
  console.log(`  3 verified (Oakleigh core) | ${unverified.length} unverified (peripheral)`);
  console.log(`  DB total records: ${total[0].c}`);
  console.log("-".repeat(60));
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
