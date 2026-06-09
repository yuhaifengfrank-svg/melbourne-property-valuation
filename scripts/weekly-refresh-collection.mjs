// ── Weekly Incremental Data Collection ──
// Usage:  node scripts/weekly-refresh-collection.mjs [batchSize=20]
//
// What it does:
//   1. Reads all unique (suburb, state, postcode) from comparable_sales
//   2. Scrapes latest sold data from REA+Domain via CDP (1 page only)
//   3. Incremental upsert (ON CONFLICT DO NOTHING)
//   4. Exponential backoff on KPSDK/empty pages
//   5. Saves progress to /tmp/weekly-collect-progress.json (crash-resume)
//   6. After all done: triggers refresh-suburb-metrics.js
//
// Strategy:
//   - batchSize suburbs at a time, 60s rest between batches
//   - Per-suburb: 1 page (~15 records), newest first
//   - Retry: 30s→60s→120s max, then skip+mark
//   - 5 consecutive failures → 10min cooldown

import { getSql } from "../api/_db.js";
import { ensureComparableSchema } from "../lib/db-schema.js";
import { scrapeSoldData, formatAsComparables } from "../lib/browser-collector.js";
import fs from "fs";
import path from "path";

const STATE = "VIC";
const COLLECTION_ROUND = "weekly-refresh";
const BATCH_DATE = new Date().toISOString().split("T")[0];
const BATCH_ID = `weekly-${BATCH_DATE}`;
const PROGRESS_FILE = "/tmp/weekly-collect-progress.json";
const BATCH_SIZE = Math.min(Math.max(parseInt(process.argv[2] || "20") || 20, 5), 40);
const MAX_PAGES = 1; // newest page only

let sql, q;

// ── Load/save progress ──
function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const d = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
      if (d.batchDate === BATCH_DATE) return d;
    }
  } catch {}
  return { batchDate: BATCH_DATE, done: [], failed: [], skipped: [], started: false };
}

function saveProgress(p) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Exponential backoff: try scrapeSuburb with retries ──
async function scrapeWithBackoff(suburb, state, postcode) {
  const delays = [5000, 15000, 30000, 60000, 120000];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    try {
      console.log(`  [${suburb}] Attempt ${attempt + 1}...`);
      const sales = await scrapeSoldData(suburb, state, postcode, MAX_PAGES);
      
      // Detect KPSDK/empty response
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

// ── Upsert records into DB ──
async function upsertRecords(suburb, records) {
  let inserted = 0, skipped = 0;
  for (const rec of records) {
    try {
      await q(
        `INSERT INTO comparable_sales (
          sale_address, sale_price, sale_date, property_type,
          bedrooms, bathrooms, car_spaces, land_size_sqm,
          suburb, state, postcode,
          source_url, source_name,
          collection_date, collection_round, batch_id,
          verification_status, original_evidence
        ) VALUES (
          $1::text, $2::numeric, $3::date, $4::text,
          $5::int, $6::int, $7::int, $8::numeric,
          $9::text, $10::text, $11::text,
          $12::text, $13::text,
          $14::date, $15::text, $16::text,
          $17::text, $18::jsonb
        )
        ON CONFLICT (sale_address, sale_date, sale_price, source_name)
        WHERE sale_date IS NOT NULL AND sale_price IS NOT NULL
        DO UPDATE SET
          verification_status = EXCLUDED.verification_status,
          batch_id = EXCLUDED.batch_id,
          original_evidence = EXCLUDED.original_evidence,
          updated_at = NOW()`,
        [
          rec.sale_address, rec.sale_price, rec.sale_date, rec.property_type,
          rec.bedrooms, rec.bathrooms, rec.car_spaces, rec.land_size_sqm,
          rec.suburb, rec.state, rec.postcode,
          rec.source_url, rec.source_name,
          rec.collection_date, rec.collection_round, rec.batch_id,
          rec.verification_status,
          JSON.stringify(rec.original_evidence || {})
        ]
      );
      inserted++;
    } catch (e) {
      // If duplicate key → skip, it's already in DB
      if (e.message?.includes("duplicate key") || e.message?.includes("unique constraint")) {
        skipped++;
      } else {
        console.error(`    DB error for ${rec.sale_address}: ${e.message?.substring(0, 120)}`);
      }
    }
  }
  return { inserted, skipped };
}

// ── Format scraped sales into comparable records ──
function formatRecords(sales, suburb) {
  const minDate = null;
  const maxDate = null;
  const allSources = new Set();
  let crossVerified = 0, singleObserved = 0;

  for (const s of sales) {
    const src = s.source || "";
    if (src) allSources.add(src);
  }

  return sales.map(s => {
    const sd = s.saleDate || null;
    const src = s.source || "";
    const hasRea = src.toLowerCase().includes("rea") || src.toLowerCase().includes("realestate");
    const hasDomain = src.toLowerCase().includes("domain");
    const isCross = src.includes("+") || (hasRea && hasDomain);

    return {
      sale_address: s.address,
      sale_price: s.price || s.salePrice || 0,
      sale_date: sd,
      property_type: "House",
      bedrooms: s.bedrooms || null,
      bathrooms: s.bathrooms || null,
      car_spaces: s.carSpaces || null,
      land_size_sqm: s.landSize || null,
      suburb, state: STATE, postcode: s.postcode || s.postCode || null,
      source_url: s.collectionUrl || s.sourceUrl || null,
      source_name: src,
      collection_date: BATCH_DATE,
      collection_round: COLLECTION_ROUND,
      batch_id: BATCH_ID,
      verification_status: isCross ? "cross_source_verified" : "single_source_observed",
      original_evidence: {
        reaLanding: hasRea,
        domainLanding: hasDomain,
        collectionUrl: s.collectionUrl || s.sourceUrl || null,
        batchDate: BATCH_DATE,
      },
    };
  });
}

// ── Main ──
async function main() {
  console.log(`\n🔄 Weekly Refresh Collection — ${BATCH_DATE}`);
  console.log(`   Batch size: ${BATCH_SIZE}, Max pages: ${MAX_PAGES}\n`);

  sql = getSql();
  q = (text, params) => sql.query(text, params);

  // Ensure schema
  await ensureComparableSchema(sql);

  // 1. Load all suburbs from DB
  console.log("Reading existing suburb list from comparable_sales...");
  const subRows = await q(
    `SELECT DISTINCT suburb, state, MODE() WITHIN GROUP (ORDER BY postcode) AS postcode
     FROM comparable_sales
     WHERE suburb IS NOT NULL
     GROUP BY suburb, state
     ORDER BY suburb`, []
  );
  console.log(`   Found ${subRows.length} suburbs\n`);

  // 2. Load progress
  const progress = loadProgress();
  const doneSet = new Set(progress.done);
  const failSet = new Set(progress.failed);
  const skipSet = new Set(progress.skipped);
  const pending = subRows.filter(r => !doneSet.has(r.suburb) && !failSet.has(r.suburb) && !skipSet.has(r.suburb));

  if (pending.length === 0 && doneSet.size > 0) {
    console.log("✅ All suburbs already collected today!");
    return;
  }

  console.log(`   Already done: ${doneSet.size}, Failed: ${failSet.size}, Skipped: ${skipSet.size}`);
  console.log(`   Pending: ${pending.length}\n`);

  // 3. Process in batches
  let consecutiveFails = 0;
  let totalInserted = 0;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    console.log(`\n📦 Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(pending.length / BATCH_SIZE)} (${batch.length} suburbs)`);

    for (const row of batch) {
      const { suburb, state, postcode } = row;
      console.log(`\n  → ${suburb} (${postcode || 'no PC'})`);

      // Scrape with backoff
      const result = await scrapeWithBackoff(suburb, state, postcode);

      if (!result.ok) {
        console.log(`  ⚠️  ${suburb}: ${result.error}`);
        progress.failed.push(suburb);
        consecutiveFails++;
        saveProgress(progress);

        if (consecutiveFails >= 5) {
          const cooldown = 600;
          console.log(`\n  🔥 ${consecutiveFails} consecutive failures. Cooling down for ${cooldown}s...`);
          await sleep(cooldown * 1000);
          consecutiveFails = 0;
        }
        continue;
      }

      consecutiveFails = 0;

      if (!result.sales || result.sales.length === 0) {
        console.log(`  📭 ${suburb}: no new sales found`);
        progress.skipped.push(suburb);
        saveProgress(progress);
        continue;
      }

      // Format & upsert
      const records = formatRecords(result.sales, suburb);
      const dbResult = await upsertRecords(suburb, records);
      totalInserted += dbResult.inserted;

      console.log(`  ✅ ${suburb}: ${result.sales.length} scraped, ${dbResult.inserted} inserted, ${dbResult.skipped} dups`);

      progress.done.push(suburb);
      saveProgress(progress);

      // Brief pause between suburbs
      await sleep(3000);
    }

    // Batch cooldown
    if (i + BATCH_SIZE < pending.length) {
      console.log(`\n⏳ Batch complete. Pausing 60s before next batch...`);
      await sleep(60000);
    }
  }

  // 4. Final report
  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 Collection Complete — ${BATCH_DATE}`);
  console.log(`   Total suburbs processed: ${progress.done.length}`);
  console.log(`   Records inserted: ${totalInserted}`);
  console.log(`   Failed: ${progress.failed.length}`);
  console.log(`   Skipped (no data): ${progress.skipped.length}`);
  if (progress.failed.length > 0) {
    console.log(`   Failed list: ${progress.failed.join(', ')}`);
  }
  console.log(`${'='.repeat(50)}\n`);

  // 5. Auto-trigger refresh
  console.log("🔄 Triggering suburb_metrics refresh...");
  try {
    const { refreshSuburbMetrics } = await import("./refresh-suburb-metrics.js");
    await refreshSuburbMetrics();
    console.log("✅ Refresh complete");
  } catch (e) {
    console.warn("⚠️ Refresh trigger failed:", e.message);
    console.log("   You can run it manually: node lib/refresh-suburb-metrics.js");
  }

  console.log("\n✅ DONE");
}

main().catch(e => {
  console.error("FATAL:", e);
  process.exit(1);
});
