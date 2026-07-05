#!/usr/bin/env node
// Batch collect low-data suburbs - 20 pages each
// Usage: cd project-root && DATABASE_URL=... node scripts/run-lowdata-collect.mjs

import { neon } from "@neondatabase/serverless";
import { scrapeSoldData } from "../lib/browser-collector.js";

const SUBURBS = [
  "balwyn north","lorne","ballarat","huntingdale","kew","armadale",
  "caulfield east","ashburton","sorrento","albert park","heatherton",
  "notting hill","werribee south","eaglemont","officer south","ashwood",
  "ivanhoe east","clarinda","belmont","aberfeldie","ascot vale",
  "altona north","caulfield","watsonia","aspendale","bayswater",
  "sans souci","mornington","bendigo","langwarrin south",
  "queenscliff","aireys inlet","portsea"
];

const STATE = "VIC";
const MAX_PAGES = 20;
const TODAY = new Date().toISOString().slice(0, 10);
const DB_URL = process.env.DATABASE_URL;

if (!DB_URL) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const sql = neon(DB_URL);

function inferPropertyType(address, originalType) {
  if (!address) return originalType || "House";
  const addr = address.toLowerCase();
  if (/^\s*\d+\s*\//.test(addr)) return "Unit";
  if (/\b(?:unit|flat|apartment|apt)\b/.test(addr)) return "Unit";
  if (/\btown(?:house)?\b/.test(addr)) return "Townhouse";
  if (/\bvilla\b/.test(addr)) return "Villa";
  return originalType || "House";
}

async function insertRecord(rec) {
  try {
    await sql`
      INSERT INTO comparable_sales (
        sale_address, sale_price, sale_date, property_type,
        bedrooms, bathrooms, car_spaces, land_size_sqm,
        suburb, state, postcode,
        source_url, source_name,
        collection_date, collection_round, batch_id
      ) VALUES (
        ${rec.sale_address}::text, ${rec.sale_price}::numeric, ${rec.sale_date}::date, ${rec.property_type}::text,
        ${rec.bedrooms}::int, ${rec.bathrooms}::int, ${rec.car_spaces}::int, ${rec.land_size_sqm}::numeric,
        ${rec.suburb}::text, ${rec.state}::text, null::text,
        ${rec.source_url}::text, ${rec.source_name}::text,
        ${rec.collection_date}::date, ${rec.collection_round}::text, ${rec.batch_id}::text
      )
    `;
    return "inserted";
  } catch (e) {
    if (e.message && (e.message.includes("duplicate key") || e.message.includes("unique constraint") || e.message.includes("violates unique"))) {
      // Update batch_id on conflict
      try {
        await sql`
          UPDATE comparable_sales
          SET batch_id = ${rec.batch_id}::text, updated_at = NOW()
          WHERE sale_address = ${rec.sale_address}::text
            AND sale_date IS NOT DISTINCT FROM ${rec.sale_date}::date
            AND sale_price IS NOT DISTINCT FROM ${rec.sale_price}::numeric
            AND source_name = ${rec.source_name}::text
        `;
        return "updated";
      } catch {
        return "skipped";
      }
    }
    console.error(`    ⚠️  DB error: ${e.message?.slice(0, 150)}`);
    return "error";
  }
}

async function collectOne(suburb) {
  console.log(`\n=== [${suburb}] Starting (${MAX_PAGES} pages) ===`);
  
  let sales;
  try {
    sales = await scrapeSoldData(suburb, STATE, null, MAX_PAGES);
  } catch (e) {
    console.log(`[${suburb}] Scrape error: ${e.message?.slice(0, 200)}`);
    return { suburb, scraped: 0, inserted: 0 };
  }
  
  if (!Array.isArray(sales) || sales.length === 0) {
    console.log(`[${suburb}] No sales found`);
    return { suburb, scraped: 0, inserted: 0 };
  }
  
  console.log(`[${suburb}] ${sales.length} records scraped`);
  
  let inserted = 0, skipped = 0, errors = 0;
  
  for (const s of sales) {
    const rec = {
      sale_address: (s.address || "").substring(0, 300),
      sale_price: typeof s.price === "number" ? s.price : null,
      sale_date: s.saleDate ? s.saleDate.replace(/\//g, "-") : null,
      property_type: inferPropertyType(s.address, s.propertyType),
      bedrooms: s.bedrooms || null,
      bathrooms: s.bathrooms || null,
      car_spaces: s.carSpaces || null,
      land_size_sqm: s.landSize || null,
      suburb,
      state: STATE,
      source_url: s.evidenceUrls?.[0] || s.sourceUrl || null,
      source_name: s.source || "realestate.com.au",
      collection_date: TODAY,
      collection_round: "lowdata-fill",
      batch_id: `lowdata-fill-${TODAY}`
    };
    
    if (rec.sale_price === null && !rec.sale_date) {
      errors++;
      continue;
    }
    
    const result = await insertRecord(rec);
    if (result === "inserted") inserted++;
    else if (result === "updated") inserted++; // count as progress
    else if (result === "skipped") skipped++;
    else errors++;
  }
  
  console.log(`[${suburb}] → ${inserted} new/updated, ${skipped} skipped, ${errors} errors`);
  return { suburb, scraped: sales.length, inserted };
}

async function main() {
  const start = Date.now();
  const results = [];
  
  for (const suburb of SUBURBS) {
    const r = await collectOne(suburb);
    results.push(r);
    await new Promise(r => setTimeout(r, 1000)); // 1s cooldown between suburbs
  }
  
  const elapsed = ((Date.now() - start) / 1000).toFixed(0);
  const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
  const totalScraped = results.reduce((s, r) => s + r.scraped, 0);
  
  console.log(`\n=== ALL DONE (${elapsed}s) ===`);
  console.log(`Total scraped: ${totalScraped}  |  Total inserted: ${totalInserted}`);
  console.log(`\nPer-suburb summary:`);
  results.forEach(r => console.log(`  ${r.suburb.padEnd(20)} scraped=${r.scraped}  inserted=${r.inserted}`));
  
  process.exit(0);
}

main();
