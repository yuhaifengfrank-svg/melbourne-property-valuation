#!/usr/bin/env node
// ── Oakleigh House 试点：完整数据收集 + 导入 ──
// 用法: node scripts/import-oakleigh.mjs
// 前提: .env 包含 DATABASE_URL

import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { fetchPageText } from "../lib/browser-collector.js";

const DB = process.env.DATABASE_URL;
if (!DB) { console.error("❌ No DATABASE_URL in .env"); process.exit(1); }
const sql = neon(DB);

async function main() {
  // 1. 抓取 REA sold list
  console.log("📡 Fetching REA sold list (Oakleigh)...");
  const rea = await fetchPageText(
    "https://www.realestate.com.au/sold/in-oakleigh+vic/list-1?activeSort=solddate",
    15000
  );
  if (!rea.ok) { console.error("❌ REA fetch failed:", rea.error); process.exit(1); }

  // 2. 解析 REA
  const lines = rea.text.split("\n").map(l => l.trim()).filter(Boolean);
  const allRecords = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.startsWith("$")) continue;
    const price = parseInt(l.replace(/[$,]/g, ""));
    if (price < 50000 || price > 50000000) continue;

    // 找 saleDate
    let dateStr = null;
    for (let j = Math.max(0, i - 5); j < i; j++) {
      if (lines[j].toLowerCase().includes("sold on")) {
        dateStr = lines[j].replace("Sold on", "").trim();
        break;
      }
    }
    // 地址
    const addr = (i + 1 < lines.length) ? lines[i + 1].trim() : "";
    if (!addr || !addr.includes("Oakleigh")) continue;

    // 卧室/浴室/车位/土地（后几行数字）
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

    allRecords.push({
      address: addr, price, saleDate: dateStr,
      bedrooms: beds, bathrooms: baths, carSpaces: cars, landSize: land,
      source: "realestate.com.au"
    });
  }

  // 3. 抓取 Domain
  console.log("📡 Fetching Domain sold list...");
  const domain = await fetchPageText("https://www.domain.com.au/sold-listings/oakleigh-vic/", 15000);
  if (domain.ok) {
    const dlines = domain.text.split("\n").map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < dlines.length; i++) {
      if (dlines[i].startsWith("$") && /^[\d,]+$/.test(dlines[i].slice(1))) {
        const price = parseInt(dlines[i].replace(/[$,]/g, ""));
        if (price < 50000 || price > 50000000) continue;
        if (i + 1 >= dlines.length) continue;
        const addr = dlines[i + 1].trim();
        if (!addr.includes("Oakleigh")) continue;
        let beds = null, baths = null, cars = null;
        if (i + 2 < dlines.length && /^\d+$/.test(dlines[i+2])) beds = parseInt(dlines[i+2]);
        if (i + 3 < dlines.length && /^\d+$/.test(dlines[i+3])) baths = parseInt(dlines[i+3]);
        if (i + 4 < dlines.length && /^\d+$/.test(dlines[i+4])) cars = parseInt(dlines[i+4]);

        allRecords.push({
          address: addr, price, saleDate: null,
          bedrooms: beds, bathrooms: baths, carSpaces: cars, landSize: null,
          source: "domain.com.au"
        });
      }
    }
  }

  console.log(`✅ RAW records: ${allRecords.length}`);

  // 4. 去重
  const seen = new Map();
  for (const r of allRecords) {
    const key = `${r.address.toLowerCase().trim()}|${r.price}`;
    if (seen.has(key)) {
      const existing = seen.get(key);
      existing.source = existing.source + "+" + r.source;
      if (r.saleDate && !existing.saleDate) existing.saleDate = r.saleDate;
    } else {
      seen.set(key, { ...r });
    }
  }
  const deduped = [...seen.values()];
  console.log(`✅ Deduped: ${deduped.length}`);

  // 5. 物业类型推断（处理所有/ 分隔地址）
  function inferType(addr) {
    const a = addr.toLowerCase();
    // unit/apartment/flat 检测
    // 重点：用 / 或 \d+\/\d+ 检测 strata 地址
    if (/^\d+\s*\//.test(a) || /\/\d+/.test(a) || /^(unit|flat|apt)\s/i.test(a)) {
      if (/apartment|apt\b/i.test(a) || /^(apt|apartment)\s/i.test(a)) return "Apartment";
      // 1/46 Golf Links Ave 是 townhouse 但地址有 / 
      // 有些 townhouse 也用 /——通过 address 含 townhouse 检测
      if (/townhouse|town\s*house/i.test(a)) return "Townhouse";
      return "Unit";
    }
    if (/townhouse|town\s*house/i.test(a)) return "Townhouse";
    if (/apartment|apt\s/i.test(a)) return "Apartment";
    if (/villa/i.test(a)) return "Villa";
    if (/vacant\s*land/i.test(a)) return "Vacant land";
    return "House";
  }

  // 6. 分类
  const houses = [];
  const townhouses = [];
  const others = [];
  for (const r of deduped) {
    r.propertyType = inferType(r.address);
    if (r.propertyType === "House") houses.push(r);
    else if (r.propertyType === "Townhouse") townhouses.push(r);
    else others.push(r);
  }
  console.log(`   Houses: ${houses.length}`);
  console.log(`   Townhouses: ${townhouses.length}`);
  console.log(`   Others: ${others.length}`);

  // 看 / 地址——它们里有 House 吗？
  const slashAddresses = deduped.filter(r => /^\d+\s*\//.test(r.address) || /\/\d+/.test(r.address));
  console.log(`   Slash-address records: ${slashAddresses.length}`);
  for (const r of slashAddresses) {
    console.log(`     ${r.address} — inferred as ${r.propertyType}`);
  }

  // 双源验证：记录出现在 2+ 源→verified
  for (const r of houses) {
    const sources = r.source.split("+").filter(Boolean);
    r.crossVerified = sources.length >= 2;
    r.verificationStatus = r.crossVerified ? "verified" : "unverified";
  }

  const verified = houses.filter(r => r.verificationStatus === "verified");
  const unverified = houses.filter(r => r.verificationStatus === "unverified");
  console.log(`\n✅ Verified (dual-source): ${verified.length}`);
  console.log(`✅ Unverified (single-source): ${unverified.length}`);

  // 7. 导入到 Neon
  console.log("\n📦 Importing to Neon...");
  let imported = 0;
  for (const r of houses) {
    // 解析日期
    let saleDate = null;
    if (r.saleDate) {
      // "15 May 2026" 或 "02 May 2026"
      const m = r.saleDate.match(/(\d+)\s+(\w+)\s+(\d{4})/);
      if (m) {
        const months = {jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",
                       jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12"};
        const mon = months[m[2].toLowerCase().slice(0,3)];
        if (mon) saleDate = `${m[3]}-${mon}-${m[1].padStart(2,"0")}`;
      }
    }

    const srcParts = r.source.split("+").filter(Boolean);
    const isDual = srcParts.length >= 2;
    
    // Source URL — 如果是 dual 则用两个 URL
    const srcUrl = isDual
      ? `https://www.realestate.com.au/sold/in-oakleigh+vic/list-1 AND https://www.domain.com.au/sold-listings/oakleigh-vic/`
      : srcParts[0] === "realestate.com.au"
        ? "https://www.realestate.com.au/sold/in-oakleigh+vic/list-1"
        : "https://www.domain.com.au/sold-listings/oakleigh-vic/";
    
    const srcName = srcParts.join("+");

    try {
      await sql`
        INSERT INTO comparable_sales (
          sale_address, sale_price, sale_date, property_type,
          bedrooms, bathrooms, car_spaces, land_size_sqm,
          suburb, state, postcode,
          source_url, source_name, collection_date,
          verification_status, raw_price_text
        ) VALUES (
          ${r.address}, ${r.price}, ${saleDate}, ${r.propertyType},
          ${r.bedrooms}, ${r.bathrooms}, ${r.carSpaces}, ${r.landSize},
          'Oakleigh', 'VIC', '3166',
          ${srcUrl}, ${srcName}, new Date(),
          ${r.verificationStatus}, ${`$${r.price.toLocaleString()}`}
        )
        ON CONFLICT (sale_address, COALESCE(sale_date, '1970-01-01'::date), COALESCE(sale_price, -1), source_name)
        DO NOTHING
      `;
      imported++;
    } catch (e) {
      console.warn(`  ⚠️  ${r.address}: ${e.message}`);
    }
  }

  console.log(`✅ Imported ${imported} records`);

  // 8. 索引迁移
  console.log("\n🗂️ Running dedup index migration...");
  await sql`
    DELETE FROM comparable_sales WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY sale_address, COALESCE(sale_date, '1970-01-01'::date), COALESCE(sale_price, -1), source_name
          ORDER BY created_at DESC
        ) AS rn FROM comparable_sales
      ) sub WHERE sub.rn > 1
    )
  `;
  try {
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS cs_dedup_idx ON comparable_sales (
        sale_address, COALESCE(sale_date, '1970-01-01'::date), COALESCE(sale_price, -1), source_name
      )
    `;
    console.log("✅ Dedup index created");
  } catch (e) {
    if (!e.message?.includes("already exists")) throw e;
    console.log("✅ Dedup index already exists");
  }

  // 9. 验证
  console.log("\n=== 📊 Verification ===");
  const total = await sql`SELECT COUNT(*)::int AS c FROM comparable_sales WHERE suburb = 'Oakleigh'`;
  console.log(`Total Oakleigh records: ${total[0].c}`);

  const byStatus = await sql`
    SELECT verification_status, COUNT(*)::int AS c
    FROM comparable_sales WHERE suburb = 'Oakleigh'
    GROUP BY verification_status
  `;
  for (const row of byStatus) {
    console.log(`  ${row.verification_status}: ${row.c}`);
  }

  const houseList = await sql`
    SELECT sale_address, sale_price, sale_date, verification_status, source_name
    FROM comparable_sales
    WHERE suburb = 'Oakleigh' AND property_type = 'House'
    ORDER BY sale_price
  `;
  console.log("\n📋 House records in DB:");
  for (const row of houseList) {
    const dateStr = row.sale_date ? row.sale_date.toISOString().slice(0, 10) : "no date";
    console.log(`  $${(row.sale_price || 0).toLocaleString()} — ${row.sale_address} (${dateStr}) [${row.verification_status}] ${row.source_name}`);
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 IMPORT SUMMARY");
  console.log("=".repeat(60));
  console.log(`  Total raw: ${allRecords.length}`);
  console.log(`  Deduped: ${deduped.length}`);
  console.log(`  Houses imported: ${imported}`);
  console.log(`  Verified (dual-source): ${verified.length}`);
  console.log(`  Unverified: ${unverified.length}`);
  console.log(`  DB total (all Oakleigh): ${total[0].c}`);
  console.log("-".repeat(60));
  console.log("Next: run 'node dev-server.mjs' and test an Oakleigh address");
}

main().catch(e => { console.error("❌", e.message, e.stack); process.exit(1); });
