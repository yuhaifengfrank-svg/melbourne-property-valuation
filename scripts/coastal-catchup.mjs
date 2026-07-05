// ── Coastal Catch-up Data Collection ──
// Usage:  node scripts/coastal-catchup.mjs
//
// Daily 4:30am cron job, targets 8 coastal/resort suburbs with zero comparable_sales.
// Architecture: dual-write (same as daily-batch-collection)
//   1. RAW JSON → VM raw/parcel/ (Oracle Data Factory data lake)
//   2. Structured data → Neon comparable_sales

import { getSql } from "../api/_db.js";
import { ensureComparableSchema } from "../lib/db-schema.js";
import { scrapeSoldData, formatAsComparables } from "../lib/browser-collector.js";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const STATE = "VIC";
const BATCH_DATE = new Date().toISOString().split("T")[0];
const MAX_PAGES = 5;

// ── Target suburbs (8 coastal/resort, zero sales) ──
const TARGETS = [
  { suburb: "Aireys Inlet",     postcode: "3231" },
  { suburb: "Anglesea",         postcode: "3230" },
  { suburb: "Barwon Heads",     postcode: "3227" },
  { suburb: "Lorne",            postcode: "3232" },
  { suburb: "Point Lonsdale",   postcode: "3225" },
  { suburb: "Queenscliff",      postcode: "3225" },
  { suburb: "Sorrento",         postcode: "3943" },
  { suburb: "Portsea",          postcode: "3944" },
];

const PROGRESS_FILE = "/tmp/coastal-catchup.json";
const VM_RAW_DIR = "/mnt/oracle-data-lake/raw/parcel";

// ── Main ──
async function main() {
  console.log("=== Coastal Catch-up Collection ===");
  console.log(`Target: 8 coastal suburbs, Pages: ${MAX_PAGES}\n`);

  const sql = await getSql();
  await ensureComparableSchema(sql);

  let progress = {};
  if (fs.existsSync(PROGRESS_FILE)) {
    try { progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8")); } catch(e) {}
  }

  let totalNew = 0;

  for (const target of TARGETS) {
    const { suburb, postcode } = target;
    if (progress[suburb] === "done") {
      console.log(`[SKIP] ${suburb} — already collected`);
      continue;
    }

    console.log(`\n[COLLECT] ${suburb} (${postcode}) — scraping ${MAX_PAGES} pages...`);

    try {
      const sales = await scrapeSoldData(suburb.toLowerCase(), STATE, postcode, MAX_PAGES);
      console.log(`  Raw scraped: ${sales.length} entries`);

      if (sales.length === 0) {
        console.log(`  No data found for ${suburb}`);
        progress[suburb] = "empty";
        continue;
      }

      const comparables = formatAsComparables(sales, { suburb, state: STATE, postcode });
      console.log(`  Formatted: ${comparables.length} comparables`);

      if (comparables.length === 0) {
        console.log(`  No comparable data after formatting`);
        progress[suburb] = "empty";
        continue;
      }

      // Type breakdown
      const byType = {};
      comparables.forEach(c => { byType[c.propertyType] = (byType[c.propertyType] || 0) + 1; });
      console.log(`  Type breakdown: ${JSON.stringify(byType)}`);

      // 3a: RAW JSON dump to VM
      const vmSuburbDir = path.join(VM_RAW_DIR, suburb.toLowerCase());
      try { execSync(`mkdir -p "${vmSuburbDir}"`, { stdio: "ignore" }); } catch(e) {}
      const rawPath = path.join(vmSuburbDir, `${BATCH_DATE}.json`);
      try {
        fs.writeFileSync(rawPath, JSON.stringify({ suburb, state: STATE, postcode, date: BATCH_DATE, sales, comparables, scrapedAt: new Date().toISOString() }, null, 2));
        console.log(`  RAW written: ${rawPath}`);
      } catch (e) {
        console.log(`  VM write skipped: ${e.message}`);
      }

      // 3b: Insert into comparable_sales using Neon tagged template
      let inserted = 0;
      for (const c of comparables) {
        try {
          const saleDate = c.saleDate || null;
          const addr = c.address || (suburb + " " + postcode);
          const pType = c.propertyType || "House";
          const pSub = suburb.toLowerCase();
          const srcName = c.sourceCount >= 2 ? "rea+domain" : "rea";

          // Use sql tagged template directly (Neon returns array of rows)
          const srcUrl = c.sourceUrl || '';
          const r = await sql`
            INSERT INTO comparable_sales
              (sale_address, sale_price, sale_date, property_type, suburb, state, postcode, source_name, source_url, collection_date, collection_round)
            VALUES
              (${addr}, ${c.salePrice}, ${saleDate}::date, ${pType}, ${pSub}, ${STATE}, ${postcode}, ${srcName}, ${srcUrl}, ${saleDate}::date, 'coastal-catchup')
            ON CONFLICT (sale_address, sale_date, sale_price) WHERE sale_date IS NOT NULL DO NOTHING
            RETURNING id
          `;
          if (r && r.length > 0) inserted++;
        } catch (e) {
          const msg = (e.message || "").substring(0, 80);
          if (!msg.includes("duplicate") && !msg.includes("already exists")) {
            console.log("  Insert err: " + msg);
          }
        }
      }
      console.log(`  Inserted: ${inserted} new rows`);
      totalNew += inserted;

      progress[suburb] = "done";
    } catch (e) {
      console.error(`  Error collecting ${suburb}: ${e.message}`);
      progress[suburb] = "failed";
    }

    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  }

  console.log(`\n=== Collection Complete ===`);
  console.log(`Total new records inserted: ${totalNew}`);

  const doneCount = Object.values(progress).filter(v => v === "done" || v === "empty").length;
  if (doneCount >= TARGETS.length) {
    fs.unlinkSync(PROGRESS_FILE);
    console.log("All suburbs collected, progress file cleared.");
  }

  process.exit(0);
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
