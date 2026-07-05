#!/usr/bin/env node
// Special collector for "Contact agent" style REA pages
// Usage: cd project-root && DATABASE_URL=... node scripts/collect-kew-altona.mjs

import { neon } from "@neondatabase/serverless";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error("Missing DATABASE_URL"); process.exit(1); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPageText(suburb, page) {
  const u = `https://www.realestate.com.au/sold/in-${suburb}+vic/list-${page}?activeSort=solddate`;
  const resp = await fetch(u, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36" }
  });
  if (!resp.ok) return "";
  const html = await resp.text();
  // Strip HTML, extract text
  return html.replace(/<[^>]+>/g, "\n").replace(/&nbsp;/g, " ").replace(/\n{3,}/g, "\n").trim();
}

function parseContactAgent(text, suburb) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const sales = [];
  const subLower = suburb.toLowerCase();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\d/.test(line)) continue;
    if (!line.toLowerCase().includes(subLower)) continue;

    let hasSoldMarker = false;
    for (let k = 1; k <= 12 && i + k < lines.length; k++) {
      const n = lines[i + k];
      if (n === "Sold" || (n.includes("Contact agent") && /^\d+$/.test(lines[i + k - 3] || ""))) {
        hasSoldMarker = true; break;
      }
    }
    if (!hasSoldMarker) continue;

    // Address
    let address = line;
    const cidx = address.lastIndexOf(",");
    if (cidx >= 0) address = address.substring(0, cidx).trim();
    if (sales.some(s => s.address === address)) continue;

    let price = null, bedrooms = null, bathrooms = null, carSpaces = null;
    let landSize = null, saleDate = null;
    let propertyType = "House";

    for (let k = 1; k <= 15 && i + k < lines.length; k++) {
      const n = lines[i + k];
      if (n === "Sold" || n.startsWith("Featured") || n === "ADVERTIS") break;
      if (n.startsWith("$")) {
        const p = parseInt(n.replace(/[$,]/g, ""));
        if (!isNaN(p) && p >= 50000) price = p;
      } else if (/^\d+$/.test(n)) {
        if (bedrooms === null) bedrooms = parseInt(n);
        else if (bathrooms === null) bathrooms = parseInt(n);
        else if (carSpaces === null) carSpaces = parseInt(n);
      } else if (n.toLowerCase().includes("house")) propertyType = "House";
      else if (n.toLowerCase().includes("townhouse") || n.toLowerCase().includes("town house")) propertyType = "Townhouse";
      else if (n.toLowerCase().includes("apartment")) propertyType = "Apartment";
      else if (n.toLowerCase().includes("villa")) propertyType = "Villa";
      else if (n.toLowerCase().includes("unit")) propertyType = "Unit";
      else if (/\d+\s*m²/.test(n.toLowerCase())) {
        const m = n.toLowerCase().match(/(\d+)\s*m²/);
        if (m) landSize = parseInt(m[1]);
      } else if (/^Sold on/i.test(n)) {
        saleDate = n.replace(/^Sold on\s*/i, "").trim();
      }
    }

    sales.push({ address, price, propertyType, bedrooms, bathrooms, carSpaces, landSize, saleDate });
  }

  return sales;
}

async function insertRecord(sql, rec) {
  try {
    await sql`
      INSERT INTO comparable_sales (
        sale_address, sale_price, sale_date, property_type,
        bedrooms, bathrooms, car_spaces, land_size_sqm,
        suburb, state, postcode,
        collection_date, collection_round, batch_id
      ) VALUES (
        ${rec.sale_address}, ${rec.sale_price}, ${rec.sale_date},
        ${rec.property_type}, ${rec.bedrooms}, ${rec.bathrooms}, ${rec.car_spaces}, ${rec.land_size_sqm},
        ${rec.suburb}, 'VIC', null,
        ${rec.collection_date}, ${rec.collection_round}, ${rec.batch_id}
      )
    `;
    return "ok";
  } catch (e) {
    if (e.message?.includes("duplicate") || e.message?.includes("unique") || e.message?.includes("violates unique")) return "dup";
    console.error("  DB:", e.message?.slice(0, 100));
    return "err";
  }
}

async function collect(suburb) {
  console.log(`\n=== [${suburb}] Starting (20 pages via fetch) ===`);
  const today = new Date().toISOString().slice(0, 10);
  const sql = neon(DB_URL);
  let total = 0;

  for (let page = 1; page <= 20; page++) {
    const text = await fetchPageText(suburb, page);
    if (!text || text.length < 800) {
      console.log(`  Page ${page}: too short (${text?.length} chars)`);
      if (page >= 3) break;
      continue;
    }
    const sales = parseContactAgent(text, suburb);
    if (sales.length === 0) {
      console.log(`  Page ${page}: parsed 0 records`);
      continue;
    }
    console.log(`  Page ${page}: ${sales.length} records`);

    let ok = 0, dup = 0, err = 0;
    for (const s of sales) {
      const rec = {
        sale_address: (s.address || "").substring(0, 300),
        sale_price: s.price || null,
        sale_date: s.saleDate ? s.saleDate.replace(/\//g, "-") : null,
        property_type: s.propertyType || "House",
        bedrooms: s.bedrooms || null,
        bathrooms: s.bathrooms || null,
        car_spaces: s.carSpaces || null,
        land_size_sqm: s.landSize || null,
        suburb, collection_date: today,
        collection_round: "lowdata-fill-contact-agent",
        batch_id: `lowdata-fill-${today}`
      };
      const r = await insertRecord(sql, rec);
      if (r === "ok") ok++; else if (r === "dup") dup++; else err++;
    }
    total += ok;
    console.log(`  DB: ${ok} new, ${dup} dup, ${err} err`);

    await sleep(800);
  }

  console.log(`[${suburb}] Total new: ${total}`);
}

async function main() {
  await collect("kew");
  await collect("altona north");
  console.log("\n=== ALL DONE ===");
  process.exit(0);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
