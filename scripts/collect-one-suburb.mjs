// ── Single Suburb Collector ──
// Scrapes one suburb, writes to VM lake + Neon comparable_sales
// Usage:  node scripts/collect-one-suburb.mjs <suburb> <state> <postcode> <batchNum>
//
// Part of daily batch collection — each suburb = separate process to avoid OOM.

import { scrapeSoldData } from "../lib/browser-collector.js";
import { getSql } from "../api/_db.js";
import fs from "fs";
import { execSync } from "child_process";

const suburb = process.argv[2];
const state  = process.argv[3] || "VIC";
const pc     = process.argv[4] || null;
const batchNum = parseInt(process.argv[5] || "1");
const maxPages = parseInt(process.argv[6] || "3");

// Use Australian/Melbourne date consistently
const melbDate = () => {
  const d = new Date();
  const opts = { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit" };
  const parts = new Intl.DateTimeFormat("en-CA", opts).formatToParts(d); // en-CA → YYYY-MM-DD
  return `${parts.find(p=>p.type==="year").value}-${parts.find(p=>p.type==="month").value}-${parts.find(p=>p.type==="day").value}`;
};
const BATCH_DATE = melbDate();
const VM_HOST = "vm-aushomevalue";
const VM_RAW_DIR = "/opt/aushomevalue/data/raw/parcel";

const sql = getSql();
const q = async (text, params) => {
  const raw = await sql.query(text, params);
  return raw ? Object.values(raw) : [];
};

async function main() {
  // Scrape
  console.log(`[${suburb}] Scraping (${maxPages} pages)...`);
  const sales = await scrapeSoldData(suburb, state, pc, maxPages);

  if (!Array.isArray(sales) || sales.length === 0) {
    console.log(`[${suburb}] No sales found`);
    return;
  }

  console.log(`[${suburb}] ${sales.length} records scraped`);

  // Write to VM data lake
  const safeName = suburb.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  const filename = `daily_${BATCH_DATE}_batch${batchNum}_${safeName}.json`;
  const tmpPath = `/tmp/${filename}`;

  const payload = JSON.stringify({
    metadata: {
      suburb, collection_date: BATCH_DATE,
      batch_id: `daily-${BATCH_DATE}-batch${batchNum}`,
      source: "REA+Domain CDP",
      record_count: sales.length,
      collected_at: new Date().toISOString()
    }, records: sales
  }, null, 2);

  fs.writeFileSync(tmpPath, payload, "utf8");
  try {
    execSync(`rsync -az --rsync-path="mkdir -p ${VM_RAW_DIR} && rsync" ${tmpPath} ${VM_HOST}:${VM_RAW_DIR}/${filename}`, { timeout: 15000 });
    fs.unlinkSync(tmpPath);
    console.log(`  📦 raw/${filename} sent to VM lake`);
  } catch (e) {
    console.log(`  ⚠️  VM lake write failed: ${e.message.slice(0, 100)}`);
  }

  // Format records (matches daily-batch-collection.mjs logic)
  const records = sales.map(s => {
    const addr = (s.address || '').toLowerCase();
    let ptype = s.propertyType || 'House';
    if (/^\s*\d+\s*\//.test(addr)) ptype = 'Unit';
    else if (/\b(?:unit|flat|apartment|apt)\b/i.test(addr)) ptype = 'Unit';
    else if (/\btown(?:house)?\b/i.test(addr)) ptype = 'Townhouse';
    else if (/\bvilla\b/i.test(addr)) ptype = 'Villa';
    else if (/\bland\b/i.test(addr) || /vacant/i.test(addr)) ptype = 'Vacant land';
    return {
      sale_address: s.address?.substring(0, 300) || '',
      sale_price: s.price,
      sale_date: s.saleDate ? s.saleDate.replace(/\//g, '-') : null,
      property_type: ptype,
      bedrooms: s.bedrooms || null,
      bathrooms: s.bathrooms || null,
      car_spaces: s.carSpaces || null,
      land_size_sqm: s.landSize || null,
      suburb,
      state,
      postcode: pc,
      source_url: s.evidenceUrls?.[0] || s.sourceUrl || null,
      source_name: s.source || 'realestate.com.au',
      collection_date: BATCH_DATE,
      collection_round: 'daily',
      batch_id: `daily-${batchNum}`
    };
  });

  // Insert (matches cs_dedup_idx2)
  let inserted = 0, skipped = 0;
  for (const rec of records) {
    try {
      await q(
        `INSERT INTO comparable_sales (
          sale_address, sale_price, sale_date, property_type,
          bedrooms, bathrooms, car_spaces, land_size_sqm,
          suburb, state, postcode,
          source_url, source_name,
          collection_date, collection_round, batch_id
        ) VALUES (
          \$1::text, \$2::numeric, \$3::date, \$4::text,
          \$5::int, \$6::int, \$7::int, \$8::numeric,
          \$9::text, \$10::text, \$11::text,
          \$12::text, \$13::text,
          \$14::date, \$15::text, \$16::text
        )
        ON CONFLICT (sale_address, sale_date, sale_price, source_name)
        WHERE sale_date IS NOT NULL AND sale_price IS NOT NULL
        DO UPDATE SET
          batch_id = EXCLUDED.batch_id,
          updated_at = NOW()`,
        [
          rec.sale_address, rec.sale_price, rec.sale_date, rec.property_type,
          rec.bedrooms, rec.bathrooms, rec.car_spaces, rec.land_size_sqm,
          rec.suburb, rec.state, rec.postcode,
          rec.source_url, rec.source_name,
          rec.collection_date, rec.collection_round, rec.batch_id
        ]
      );
      inserted++;
    } catch (e) {
      if (e.message?.includes("duplicate key") || e.message?.includes("unique constraint")) {
        skipped++;
      } else {
        console.log(`  ⚠️  DB error for ${rec.sale_address}: ${e.message?.slice(0, 120)}`);
      }
    }
  }

  console.log(`[${suburb}] → ${inserted} inserted, ${skipped} skipped`);
}

main().catch(e => {
  console.error(`FATAL: [${suburb}] ${e.message.slice(0, 150)}`);
  process.exit(1);
});
