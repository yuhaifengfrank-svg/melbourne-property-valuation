#!/usr/bin/env node
// ── Oakleigh 试点 v4：直接 tagged template 导入 ──
import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { fetchPageText } from "../lib/browser-collector.js";

const DB = process.env.DATABASE_URL;
if (!DB) { console.error("❌ No DATABASE_URL"); process.exit(1); }
const sql = neon(DB);

const SUBURBS = [
  { slug: "oakleigh", name: "Oakleigh", core: true },
  { slug: "oakleigh-east", name: "Oakleigh East", core: false },
  { slug: "oakleigh-south", name: "Oakleigh South", core: false },
  { slug: "huntingdale", name: "Huntingdale", core: false },
  { slug: "hughesdale", name: "Hughesdale", core: false },
  { slug: "chadstone", name: "Chadstone", core: false },
  { slug: "clayton", name: "Clayton", core: false },
];

async function fetch(suburb) {
  const url = `https://www.realestate.com.au/sold/in-${suburb.slug}+vic/list-1?activeSort=solddate&propertyTypes=house`;
  const res = await fetchPageText(url, 12000);
  if (!res.ok) return [];
  const lines = res.text.split("\n").map(l => l.trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("$")) continue;
    const price = parseInt(lines[i].replace(/[$,]/g, ""));
    if (price < 50000 || price > 50000000) continue;
    let dateStr = null;
    for (let j = Math.max(0, i - 5); j < i; j++) {
      if (lines[j].toLowerCase().includes("sold on")) {
        dateStr = lines[j].replace("Sold on", "").trim();
        const m = dateStr.match(/(\d+)\s+(\w+)\s+(\d{4})/);
        if (m) {
          const months = {jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",
                         jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12"};
          const mon = months[m[2].toLowerCase().slice(0, 3)];
          dateStr = mon ? `${m[3]}-${mon}-${m[1].padStart(2, "0")}` : null;
        } else dateStr = null;
        break;
      }
    }
    const addr = (i + 1 < lines.length) ? lines[i + 1].trim() : "";
    if (!addr || !addr.toLowerCase().includes(suburb.name.split(" ")[0].toLowerCase())) continue;
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
    out.push({
      address: addr, price, saleDate: dateStr,
      beds, baths, cars, land,
      source: "realestate.com.au",
      suburbName: suburb.name, coreSuburb: suburb.core
    });
  }
  return out;
}

function isHouse(addr) {
  const a = addr.toLowerCase();
  if (/townhouse/i.test(a) || /town\s*house/i.test(a)) return false;
  if (/apartment|apt\s/i.test(a)) return false;
  if (/villa/i.test(a)) return false;
  if (/vacant\s*land/i.test(a)) return false;
  if (/^\d+\s*\//.test(a) || /\/\d+/i.test(a)) return false;
  if (/^(unit|flat)\s/i.test(a)) return false;
  return true;
}

async function main() {
  // 1. Fetch all
  console.log("📡 Fetching suburbs...");
  let records = [];
  for (const sub of SUBURBS) {
    const r = await fetch(sub);
    console.log(`   ${sub.name}: ${r.length}`);
    records = records.concat(r);
  }
  console.log(`✅ Raw: ${records.length}`);

  // 2. Dedup + filter
  const seen = new Map();
  for (const r of records) {
    const key = `${r.address.toLowerCase().trim()}|${r.price}`;
    if (!seen.has(key)) seen.set(key, r);
  }
  const deduped = [...seen.values()];
  const houses = deduped.filter(r => isHouse(r.address));
  console.log(`✅ Houses: ${houses.length}`);

  const core = houses.filter(r => r.coreSuburb);
  const peri = houses.filter(r => !r.coreSuburb);
  console.log(`   Core Oakleigh: ${core.length}`);
  console.log(`   Peripheral: ${peri.length}`);

  // 3. Insert one by one
  console.log("\n📦 Importing...");
  let ok = 0, fail = 0;
  for (const r of houses) {
    const vStatus = r.coreSuburb ? "verified" : "unverified";
    const todayStr = new Date().toISOString().slice(0, 10);
    const sa2Code = "212051326";
    const sa2Name = "Oakleigh";
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
          ${r.address}, ${r.price}, ${r.saleDate}, 'House',
          ${r.beds}, ${r.baths}, ${r.cars}, ${r.land},
          ${r.suburbName}, 'VIC', '3166',
          ${'https://www.realestate.com.au/sold/in-' + r.suburbName.toLowerCase().replace(/\s+/g, '-') + '+vic/list-1'}, ${'realestate.com.au'}, ${todayStr},
          ${vStatus}, ${`$${(r.price / 1000).toFixed(0)}k`},
          ${sa2Code}, ${sa2Name}
        )
        ON CONFLICT (sale_address, COALESCE(sale_date, '1970-01-01'::date), COALESCE(sale_price, -1), source_name)
        DO NOTHING
      `;
      ok++;
    } catch (e) {
      console.warn(`  ⚠️  ${r.address.slice(0, 30)}: ${e.message.slice(0, 80)}`);
      fail++;
    }
  }
  console.log(`✅ Imported: ${ok}, Failed: ${fail}`);

  // 4. Index
  console.log("\n🗂️  Dedup index...");
  await sql`DELETE FROM comparable_sales WHERE id IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY sale_address, COALESCE(sale_date, '1970-01-01'::date), COALESCE(sale_price, -1), source_name
        ORDER BY created_at DESC
      ) AS rn FROM comparable_sales
    ) sub WHERE sub.rn > 1
  )`;
  try { await sql`CREATE UNIQUE INDEX IF NOT EXISTS cs_dedup_idx ON comparable_sales (
    sale_address, COALESCE(sale_date, '1970-01-01'::date), COALESCE(sale_price, -1), source_name
  )`; } catch {}
  console.log("✅ Done");

  // 5. Verify
  const total = await sql`SELECT COUNT(*)::int AS c FROM comparable_sales`;
  const byStatus = await sql`SELECT verification_status, COUNT(*)::int AS c FROM comparable_sales GROUP BY verification_status ORDER BY verification_status`;
  const bySuburb = await sql`SELECT suburb, COUNT(*)::int AS c FROM comparable_sales GROUP BY suburb ORDER BY c DESC`;
  const list = await sql`SELECT sale_address, sale_price, sale_date::text, suburb, verification_status, property_type FROM comparable_sales ORDER BY sale_price`;

  console.log("\n" + "=".repeat(60));
  console.log("📊 IMPORT SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total: ${total[0].c}`);
  for (const r of byStatus) console.log(`  ${r.verification_status}: ${r.c}`);
  console.log("By suburb:");
  for (const r of bySuburb) console.log(`  ${r.suburb}: ${r.c}`);
  console.log(`\n📋 ${list.length} records:`);
  for (const r of list) {
    const d = r.sale_date || 'no date';
    console.log(`  $${(r.sale_price||0).toLocaleString()} — ${r.sale_address} (${r.suburb}) [${r.verification_status}] ${r.property_type}`);
  }

  // 6. 测试 Oakleigh 地址
  console.log("\n" + "-".repeat(60));
  console.log("Next: npm test && node dev-server.mjs");
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
