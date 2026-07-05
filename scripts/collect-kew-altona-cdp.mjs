#!/usr/bin/env node
// CDP-based collector for REA "Contact agent" pages (Kew, Altona North)
// Usage: cd project-root && DATABASE_URL=... node scripts/collect-kew-altona-cdp.mjs

import { neon } from "@neondatabase/serverless";
import { fetchPageText, parseReaSold } from "../lib/browser-collector.js";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error("Missing DATABASE_URL"); process.exit(1); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Enhanced parser that handles "Contact agent" pages
function parseContactAgentPage(text, suburb) {
  if (!text || text.length < 1000) return [];
  
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const sales = [];
  const subLower = suburb.toLowerCase();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Find address lines: starts with number, contains suburb
    if (!/^\d/.test(line)) continue;
    if (!line.toLowerCase().includes(subLower)) continue;

    // Check this is a property listing (not a nav item or ad)
    let isProperty = false;
    let hasExplicitSold = false;
    for (let k = 1; k <= 10 && i + k < lines.length; k++) {
      const next = lines[i + k];
      if (next === "Sold") { isProperty = true; hasExplicitSold = true; break; }
      if (next === "Contact agent" || next.includes("Contact agent")) { isProperty = true; break; }
      if (next.toLowerCase().includes("featured") || next.startsWith("ADVERTIS")) break;
    }
    if (!isProperty) continue;

    // Extract clean address
    let address = line;
    const commaIdx = address.lastIndexOf(",");
    if (commaIdx >= 0) address = address.substring(0, commaIdx).trim();
    if (sales.some(s => s.address === address)) continue;

    // Parse details: scan forward
    let price = null;
    let bedrooms = null, bathrooms = null, carSpaces = null, landSize = null;
    let saleDate = null;
    let propertyType = "House";

    for (let k = 1; k <= 15 && i + k < lines.length; k++) {
      const next = lines[i + k];
      if (next === "Sold" || next.startsWith("Featured") || next === "ADVERTIS") break;
      
      if (next.startsWith("$")) {
        const p = parseInt(next.replace(/[$,]/g, ""));
        if (!isNaN(p) && p >= 50000 && p <= 50000000) price = p;
      } else if (/^\d+$/.test(next)) {
        if (bedrooms === null) bedrooms = parseInt(next);
        else if (bathrooms === null) bathrooms = parseInt(next);
        else if (carSpaces === null) carSpaces = parseInt(next);
      } else if (next.toLowerCase() === "house") propertyType = "House";
      else if (next.toLowerCase() === "townhouse" || next.toLowerCase() === "town house") propertyType = "Townhouse";
      else if (next.toLowerCase() === "apartment" || next.toLowerCase() === "unit") {
        if (propertyType === "House") propertyType = next.charAt(0).toUpperCase() + next.slice(1).toLowerCase();
      } else if (next.toLowerCase() === "villa") propertyType = "Villa";
      else if (/^\d+\s*m²/.test(next.toLowerCase())) {
        const m = next.match(/(\d+)/);
        if (m) landSize = parseInt(m[1]);
      } else if (/^Sold\s+on\s+/i.test(next)) {
        saleDate = next.replace(/^Sold\s+on\s+/i, "").trim();
      }
    }

    sales.push({ address, price, propertyType, bedrooms, bathrooms, carSpaces, landSize, saleDate });
  }

  // Also try standard parser as fallback
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
  console.log(`\n=== [${suburb}] Starting CDP (20 pages) ===`);
  const sql = neon(DB_URL);
  const today = new Date().toISOString().slice(0, 10);
  let total = 0, totalPages = 0;

  for (let page = 1; page <= 20; page++) {
    const url = `https://www.realestate.com.au/sold/in-${suburb.replace(/ /g,"+")}+vic/list-${page}?activeSort=solddate`;
    
    const result = await fetchPageText(url, 10000);
    if (!result.ok || !result.text || result.text.length < 800) {
      if (page >= 3) break;
      continue;
    }

    // Enhanced parser for this page
    const sales = parseContactAgentPage(result.text, suburb);
    
    if (sales.length === 0) continue;
    
    totalPages++;
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
        collection_round: "lowdata-fill-cdp",
        batch_id: `lowdata-fill-${today}`
      };
      const r = await insertRecord(sql, rec);
      if (r === "ok") ok++; else if (r === "dup") dup++; else err++;
    }
    total += ok;
    console.log(`  DB: ${ok} new, ${dup} dup, ${err} err`);
    
    await sleep(500);
  }
  
  console.log(`[${suburb}] Total: ${totalPages} pages, ${total} new records`);
}

async function main() {
  await collect("kew");
  await collect("altona north");
  console.log("\n=== ALL DONE ===");
  process.exit(0);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
