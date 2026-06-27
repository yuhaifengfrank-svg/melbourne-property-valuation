// ── Daily Batch Data Collection ──
// Usage:  node scripts/daily-batch-collection.mjs <batchNumber> [batchSize=40]
//
// Batch numbers (6 batches, ~40 suburbs each, alphabetically sorted):
//   1: Aberfeldie .. Chadstone        (#1-#40)
//   2: Chelsea .. Donnybrook          (#41-#80)
//   3: Donvale .. Hastings            (#81-#120)
//   4: Hawthorn .. Manor Lakes        (#121-#160)
//   5: Maribyrnong .. Patterson Lakes (#161-#200)
//   6: Point Cook .. Yarraville       (#201-#240)
//
// Reads the suburb list from DB, filters to the batch slice,
// and reuses the same REA+Domain CDP scraping logic as weekly-refresh-collection.
//
// Architecture: dual-write
//   1. RAW JSON → VM raw/parcel/ (Oracle Data Factory data lake)
//   2. Structured data → Neon comparable_sales (existing, to be deprecated)
//
// Progress file: /tmp/daily-batch-{batchNumber}.json (per batch, crash-resume)

import { getSql } from "../api/_db.js";
import { ensureComparableSchema } from "../lib/db-schema.js";
import { scrapeSoldData, formatAsComparables } from "../lib/browser-collector.js";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const STATE = "VIC";
const BATCH_DATE = new Date().toISOString().split("T")[0];
const MAX_PAGES = 3;
const MIN_PER_TYPE = 5;

let sql, q;

// ── Parse args ──
function parseArgs() {
  const batchNum = parseInt(process.argv[2]);
  if (!batchNum || batchNum < 1 || batchNum > 6) {
    console.error("Usage: node scripts/daily-batch-collection.mjs <batchNumber> [batchSize=40]");
    console.error("  batchNumber: 1-6 (each ~40 suburbs)");
    process.exit(1);
  }
  const bs = Math.min(Math.max(parseInt(process.argv[3] || "40") || 40, 5), 60);
  return { batchNum, batchSize: bs };
}

// ── Progress file (per batch) ──
function progressFile(batchNum) {
  return `/tmp/daily-batch-${batchNum}.json`;
}

function loadProgress(batchNum) {
  const file = progressFile(batchNum);
  try {
    if (fs.existsSync(file)) {
      const d = JSON.parse(fs.readFileSync(file, "utf-8"));
      if (d.batchDate === BATCH_DATE) return d;
    }
  } catch {}
  return { batchDate: BATCH_DATE, batchNum, done: [], failed: [], skipped: [], started: false };
}

function saveProgress(p) {
  fs.writeFileSync(progressFile(p.batchNum), JSON.stringify(p, null, 2));
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Count existing records per property type ──
async function countExistingByType(suburb) {
  try {
    const rows = await q(
      `SELECT property_type, COUNT(*)::int as cnt
       FROM comparable_sales
       WHERE suburb ILIKE $1 AND state = $2
         AND verification_status IN ('cross_source_verified','single_source_observed')
       GROUP BY property_type`,
      [suburb, STATE]
    );
    const map = {};
    for (const r of rows) map[r.property_type] = r.cnt;
    return map;
  } catch {
    return {};
  }
}

// ── Exponential backoff scrape ──
async function scrapeWithBackoff(suburb, state, postcode) {
  const delays = [5000, 15000, 30000, 60000, 120000];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    try {
      console.log(`  [${suburb}] Attempt ${attempt + 1}...`);
      let sales = await scrapeSoldData(suburb, state, postcode, MAX_PAGES);

      if (Array.isArray(sales) && sales.length > 0) {
        const existing = await countExistingByType(suburb);
        const sampleTypes = ['House', 'Unit', 'Townhouse', 'Apartment'];
        const thinSpots = sampleTypes.filter(t => (existing[t] || 0) < MIN_PER_TYPE);
        if (thinSpots.length > 0) {
          console.log(`  [${suburb}] Thin types: ${thinSpots.join(', ')} (existing: ${JSON.stringify(existing)}). Fetching extra pages...`);
          for (let pg = 2; pg <= MAX_PAGES; pg++) {
            const more = await scrapeSoldData(suburb, state, postcode, pg);
            if (more && more.length > 0) {
              const existingAddrs = new Set(sales.map(s => s.address));
              for (const ms of more) {
                if (!existingAddrs.has(ms.address)) sales.push(ms);
              }
            }
            await sleep(2000);
          }
          console.log(`  [${suburb}] ${sales.length} total records after ${MAX_PAGES} pages`);
        }
      }

      if (!Array.isArray(sales) || sales.length === 0) {
        const errMsg = `empty/blocked response (${JSON.stringify(sales).substring(0, 100)})`;
        if (attempt < delays.length - 1) {
          console.log(`  [${suburb}] ${errMsg}, retrying in ${delays[attempt] / 1000}s...`);
          await sleep(delays[attempt]);
          continue;
        }
        return { ok: false, error: errMsg, sales: [] };
      }

      return { ok: true, sales };
    } catch (e) {
      const errMsg = e.message?.substring(0, 120) || String(e);
      if (attempt < delays.length - 1) {
        console.log(`  [${suburb}] Error: ${errMsg}, retrying in ${delays[attempt] / 1000}s...`);
        await sleep(delays[attempt]);
        continue;
      }
      return { ok: false, error: errMsg, sales: [] };
    }
  }
  return { ok: false, error: "max retries", sales: [] };
}

// ── Config ──
const VM_HOST = "vm-aushomevalue";
const VM_RAW_DIR = "/opt/aushomevalue/data/raw/parcel";

// ── Write raw JSON to VM data lake ──
function writeRawToVMLake(suburb, records, batchNum) {
  if (!records || records.length === 0) return;
  const dateStr = new Date().toISOString().split("T")[0];
  const safeName = suburb.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  const filename = `daily_${dateStr}_batch${batchNum}_${safeName}.json`;
  const tmpPath = `/tmp/${filename}`;

  const payload = JSON.stringify({
    metadata: {
      suburb,
      collection_date: dateStr,
      batch_id: `daily-${dateStr}-batch${batchNum}`,
      source: "REA+Domain CDP",
      record_count: records.length,
      collected_at: new Date().toISOString()
    },
    records
  }, null, 2);

  try {
    fs.writeFileSync(tmpPath, payload, "utf8");
    execSync(`rsync -az --rsync-path="mkdir -p ${VM_RAW_DIR} && rsync" ${tmpPath} ${VM_HOST}:${VM_RAW_DIR}/${filename}`, { timeout: 15000 });
    fs.unlinkSync(tmpPath);
    return { ok: true, filename };
  } catch (e) {
    console.error(`    ⚠️  VM lake write failed for ${suburb}: ${e.message.slice(0, 100)}`);
    return { ok: false, error: e.message };
  }
}

// ── Upsert (Neon + VM lake) ──
async function upsertRecords(suburb, records, batchNum) {
  // Write to VM data lake
  const lake = writeRawToVMLake(suburb, records, batchNum);
  if (lake.ok) {
    console.log(`    📦 raw/${lake.filename} sent to VM lake`);
  }

  // Write to Neon (existing, to be deprecated)
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
          $1::text, $2::numeric, $3::date, $4::text,
          $5::int, $6::int, $7::int, $8::numeric,
          $9::text, $10::text, $11::text,
          $12::text, $13::text,
          $14::date, $15::text, $16::text
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
        console.error(`    DB error for ${rec.sale_address}: ${e.message?.substring(0, 120)}`);
      }
    }
  }
  return { inserted, skipped };
}

// ── Infer property type ──
function inferPropertyTypeFromRecord(s, suburb) {
  const addr = (s.address || "").toLowerCase();
  if (/^\s*\d+\s*\//.test(addr)) return { type: "Unit", confidence: "high", source: "address_format" };
  if (/\b(?:unit|flat|apartment|apt)\b/i.test(addr)) return { type: "Unit", confidence: "high", source: "keyword" };
  if (/\btown(?:house)?\b/i.test(addr)) return { type: "Townhouse", confidence: "high", source: "keyword" };
  if (/\bvilla\b/i.test(addr)) return { type: "Villa", confidence: "medium", source: "keyword" };
  if (/\bland\b/i.test(addr) || /vacant/i.test(addr)) return { type: "Vacant land", confidence: "high", source: "keyword" };
  if (s.sourceUrl && /propertyTypes=unit-apartment/i.test(s.sourceUrl)) return { type: "Unit", confidence: "high", source: "source_url" };
  if (s.propertyType && ['Unit','Apartment','Townhouse','Villa','Vacant land'].includes(s.propertyType)) {
    return { type: s.propertyType, confidence: "high", source: "scraper" };
  }
  if (s.propertyType && s.propertyType !== 'House') {
    return { type: s.propertyType, confidence: "medium", source: "scraper_fallback" };
  }
  return { type: "House", confidence: "medium", source: "default" };
}

function formatRecords(sales, suburb, batchNumParam) {
  return sales.map(s => {
    const src = s.source || "";
    return {
      sale_address: s.address,
      sale_price: s.price || s.salePrice || 0,
      sale_date: s.saleDate || null,
      property_type: s.propertyType || inferPropertyTypeFromRecord(s, suburb).type || "Unknown",
      bedrooms: s.bedrooms || null,
      bathrooms: s.bathrooms || null,
      car_spaces: s.carSpaces || null,
      land_size_sqm: s.landSize || null,
      suburb, state: STATE, postcode: s.postcode || s.postCode || null,
      source_url: s.collectionUrl || s.sourceUrl || null,
      source_name: src,
      collection_date: BATCH_DATE,
      collection_round: "daily-batch",
      batch_id: `daily-${BATCH_DATE}-batch${batchNumParam}`,
    };
  });
}

// ── Main ──
async function main() {
  const { batchNum, batchSize } = parseArgs();

  console.log(`\n📋 Daily Batch Collection -- ${BATCH_DATE} (Batch ${batchNum}/6)`);
  console.log(`   Batch size: ${batchSize}\n`);

  sql = getSql();
  q = (text, params) => sql.query(text, params);

  // Ensure schema
  await ensureComparableSchema(sql);

  // Load all suburbs from DB
  const subRows = await q(
    `SELECT DISTINCT suburb, state, MODE() WITHIN GROUP (ORDER BY postcode) AS postcode
     FROM comparable_sales
     WHERE suburb IS NOT NULL
     GROUP BY suburb, state
     ORDER BY suburb`, []
  );

  // Slice to batch
  const sliceSize = Math.ceil(subRows.length / 6);
  const batchStart = (batchNum - 1) * sliceSize;
  const batchEnd = Math.min(batchNum * sliceSize, subRows.length);
  const mySuburbs = subRows.slice(batchStart, batchEnd);

  // Skip Sans Souci (NSW, outlier)
  const filtered = mySuburbs.filter(r => r.suburb !== 'Sans Souci');

  console.log(`   DB total: ${subRows.length}, Batch slice: ${batchStart+1}-${batchEnd}`);
  console.log(`   Suburbs in this batch: ${filtered.length}`);
  console.log(`   ${filtered.map(r => r.suburb).join(', ')}\n`);

  // Load progress
  const progress = loadProgress(batchNum);
  const doneSet = new Set(progress.done);
  const failSet = new Set(progress.failed);
  const skipSet = new Set(progress.skipped);
  const pending = filtered.filter(r => !doneSet.has(r.suburb) && !failSet.has(r.suburb) && !skipSet.has(r.suburb));

  if (pending.length === 0 && doneSet.size > 0) {
    console.log("All suburbs in this batch already collected today!");
    return;
  }

  console.log(`   Already done: ${doneSet.size}, Failed: ${failSet.size}, Skipped: ${skipSet.size}`);
  console.log(`   Pending: ${pending.length}\n`);

  // Process
  let consecutiveFails = 0;
  let totalInserted = 0;

  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize);
    console.log(`\nSub-batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(pending.length / batchSize)} (${batch.length} suburbs)`);

    for (const row of batch) {
      const { suburb, state, postcode } = row;
      console.log(`\n  -> ${suburb} (${postcode || 'no PC'})`);

      const result = await scrapeWithBackoff(suburb, state, postcode);

      if (!result.ok) {
        console.log(`  !! ${suburb}: ${result.error}`);
        progress.failed.push(suburb);
        consecutiveFails++;
        saveProgress(progress);

        if (consecutiveFails >= 5) {
          const cooldown = 600;
          console.log(`\n  !! ${consecutiveFails} consecutive failures. Cooling down for ${cooldown}s...`);
          await sleep(cooldown * 1000);
          consecutiveFails = 0;
        }
        continue;
      }

      consecutiveFails = 0;

      if (!result.sales || result.sales.length === 0) {
        console.log(`  -- ${suburb}: no new sales found`);
        progress.skipped.push(suburb);
        saveProgress(progress);
        continue;
      }

      const records = formatRecords(result.sales, suburb, batchNum);
      const dbResult = await upsertRecords(suburb, records, batchNum);
      totalInserted += dbResult.inserted;

      console.log(`  ++ ${suburb}: ${result.sales.length} scraped, ${dbResult.inserted} inserted, ${dbResult.skipped} dups`);

      progress.done.push(suburb);
      saveProgress(progress);

      await sleep(3000);
    }

    if (i + batchSize < pending.length) {
      console.log(`\n** Sub-batch complete. Pausing 60s before next...`);
      await sleep(60000);
    }
  }

  // Final report
  console.log(`\n********************************************`);
  console.log(`Daily Batch ${batchNum}/6 Complete -- ${BATCH_DATE}`);
  console.log(`   Suburbs processed: ${progress.done.length}`);
  console.log(`   Records inserted: ${totalInserted}`);
  console.log(`   Failed: ${progress.failed.length}`);
  console.log(`   Skipped: ${progress.skipped.length}`);
  if (progress.failed.length > 0) {
    console.log(`   Failed list: ${progress.failed.join(', ')}`);
  }
  console.log(`********************************************\n`);
}

main().catch(e => {
  console.error("FATAL:", e);
  process.exit(1);
});
