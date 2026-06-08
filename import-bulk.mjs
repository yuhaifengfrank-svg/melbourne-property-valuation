// ── 批量导入脚本 ──
// 支持并行抓取多个 suburb（并发度可调）
// 跳过已有 suburb
// 仅导入 House 类型
// 幂等：依赖 partial unique index cs_dedup_idx2 + ON CONFLICT DO UPDATE
//
// 用法: node import-bulk.mjs [concurrency=5] [batch=10]

import { getSql } from "./api/_db.js";
import { ensureComparableSchema } from "./lib/db-schema.js";
import { scrapeSoldData } from "./lib/browser-collector.js";

const STATE = "VIC";
const BATCH_DATE = new Date().toISOString().split("T")[0];
const BATCH_ID = `batch-bulk-${BATCH_DATE}`;
const COLLECTION_ROUND = "bulk-import";

const ALL_SUBURBS = [
  "Toorak","Brighton","Canterbury","Kew","Balwyn","Balwyn North",
  "Camberwell","Hawthorn","Hawthorn East","Malvern","Malvern East",
  "Armadale","South Yarra","Glen Iris","Middle Park","Albert Park",
  "Box Hill","Glen Waverley","Mount Waverley","Donvale","Doncaster East",
  "Doncaster","Templestowe","Surrey Hills","Mont Albert","Clayton",
  "Oakleigh","Carnegie","Bentleigh East","Moorabbin","Cheltenham",
  "Mentone","Mordialloc","Dingley Village","Springvale","Keysborough",
  "Noble Park","Dandenong","Berwick","Narre Warren","Cranbourne",
  "Cranbourne East","Clyde North","Officer","Pakenham","Frankston",
  "Frankston South","Mount Eliza","Mornington","Aspendale","Werribee",
  "Point Cook","Tarneit","Truganina","Hoppers Crossing","Wyndham Vale",
  "Melton","Rockbank","Caroline Springs","Sunshine","Sunshine North",
  "Sunshine West","St Albans","Deer Park","Braybrook","Maidstone",
  "Footscray","West Footscray","Yarraville","Newport","Williamstown",
  "Altona","Altona North","Laverton","Maribyrnong","Craigieburn",
  "Mickleham","Donnybrook","Wollert","Mernda","South Morang","Epping",
  "Lalor","Thomastown","Reservoir","Preston","Coburg","Coburg North",
  "Brunswick West","Glenroy","Fawkner","Broadmeadows","Greenvale",
  "Sunbury","Geelong","Armstrong Creek","Belmont","Ballarat",
  "Bendigo","Torquay"
];

// CLI args
const CONCURRENCY = Math.min(Math.max(parseInt(process.argv[2] || "5") || 5, 1), 10);
const BATCH_REPORT = Math.min(Math.max(parseInt(process.argv[3] || "10") || 10, 1), 20);

let sql;

async function main() {
  sql = getSql();

  // 1. Ensure schema
  console.log("=== Schema Check ===");
  await ensureComparableSchema(sql);
  console.log("✓ Schema ready\n");

  // 2. Query existing suburbs
  const existing = await sql`
    SELECT suburb, COUNT(*)::int as cnt
    FROM comparable_sales
    GROUP BY suburb
  `;
  const existingMap = new Map(existing.map(r => [r.suburb, r.cnt]));
  console.log(`Already in DB: ${existing.length} distinct suburbs`);

  // 3. Filter to new suburbs
  const todoSuburbs = ALL_SUBURBS.filter(s => !existingMap.has(s));
  console.log(`Total requested: ${ALL_SUBURBS.length}`);
  console.log(`Skipping (already in DB): ${ALL_SUBURBS.length - todoSuburbs.length}`);
  console.log(`To import: ${todoSuburbs.length} suburbs\n`);

  if (todoSuburbs.length === 0) {
    console.log("All suburbs already imported. Nothing to do.");
    await sql.end();
    process.exit(0);
  }

  // 4. Ensure dedup index exists
  try {
    await sql`DROP INDEX IF EXISTS cs_dedup_idx`;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS cs_dedup_idx2 ON comparable_sales (
        sale_address, sale_date, sale_price, source_name
      ) WHERE sale_date IS NOT NULL AND sale_price IS NOT NULL
    `;
  } catch (e) {
    console.warn(`⚠ dedup index: ${e.message}`);
  }

  // 5. Import with concurrency control
  let totalInserted = 0;
  let totalErrors = 0;
  let totalCross = 0;
  let totalSingle = 0;
  let suburbResults = [];
  let failures = [];

  const startTime = Date.now();
  const queue = [...todoSuburbs];

  while (queue.length > 0) {
    const batch = queue.splice(0, CONCURRENCY);
    const batchNum = Math.floor(suburbResults.length / CONCURRENCY) + 1;
    const remaining = queue.length;
    console.log(`\n── Batch ${batchNum} (${batch.length} suburbs, ${remaining} remaining) ──`);

    const promises = batch.map(suburb => importSuburb(suburb, existingMap.get(suburb) || 0));
    const results = await Promise.allSettled(promises);

    for (let i = 0; i < results.length; i++) {
      const suburb = batch[i];
      const r = results[i];
      if (r.status === "fulfilled") {
        const data = r.value;
        suburbResults.push(data);
        totalInserted += data.inserted;
        totalErrors += data.errors;
        totalCross += data.crossSourceVerified;
        totalSingle += data.singleSourceObserved;
        if (data.failures.length > 0) {
          failures.push({ suburb, fails: data.failures });
        }
      } else {
        console.error(`  ✗ ${suburb}: script crashed - ${r.reason?.message?.slice(0,200)}`);
        failures.push({ suburb, fails: [r.reason?.message || "Unknown error"] });
        suburbResults.push({
          suburb, scrapedTotal: 0, deduped: 0, inserted: 0, errors: 0,
          crossSourceVerified: 0, singleSourceObserved: 0,
          minSaleDate: null, maxSaleDate: null, sources: [],
          failures: [r.reason?.message || "Unknown error"],
          sufficientForProduction: false,
        });
      }
    }

    // Batch report every N suburbs
    if (suburbResults.length % BATCH_REPORT === 0 || queue.length === 0) {
      printProgress(suburbResults, startTime);
    }
  }

  // 6. Final report
  printFinalReport(suburbResults, startTime);

  await sql.end();
  process.exit(0);
}

async function importSuburb(suburb, existingCount) {
  const failures = [];

  // ── 1. Browser scrape ──
  let sales = [];
  try {
    // Pass postcode as empty string; collector handles it
    sales = await scrapeSoldData(suburb, STATE, "");
    console.log(`  ${suburb}: browser returned ${sales.length} raw sales`);
  } catch (e) {
    failures.push(`browser-collector: ${e.message}`);
    console.error(`  ✗ ${suburb}: browser error - ${e.message}`);
  }

  if (sales.length === 0) {
    return {
      suburb, scrapedTotal: 0, deduped: 0, inserted: 0, errors: 0,
      crossSourceVerified: 0, singleSourceObserved: 0,
      minSaleDate: null, maxSaleDate: null, sources: [], failures,
      sufficientForProduction: false,
    };
  }

  // ── 2. Filter to House only ──
  const houseSales = filterHouseOnly(sales);
  console.log(`  ${suburb}: after House filter: ${houseSales.length}`);

  // ── 3. Dedup (within-scrape) ──
  const deduped = dedupSales(houseSales);
  console.log(`  ${suburb}: after dedup: ${deduped.length}`);

  // ── 4. Determine source coverage ──
  const hasRea = deduped.some(s => (s.source || "").includes("realestate"));
  const hasDomain = deduped.some(s => (s.source || "").includes("domain"));

  // ── 5. Build records ──
  let crossVerified = 0, singleObserved = 0;
  let minDate = null, maxDate = null;
  const allSources = new Set();

  const records = deduped.map(s => {
    // Date tracking
    const sd = s.saleDate || null;
    if (sd) {
      if (!minDate || sd < minDate) minDate = sd;
      if (!maxDate || sd > maxDate) maxDate = sd;
    }

    // Source distribution
    const src = s.source || "";
    if (src) allSources.add(src);

    // Verification: cross-source
    const isCross = src.includes("+") || (hasRea && hasDomain);
    const vStatus = isCross ? "cross_source_verified" : "single_source_observed";

    if (isCross) crossVerified++;
    else singleObserved++;

    return {
      sale_address: s.address,
      sale_price: s.price,
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
      verification_status: vStatus,
      original_evidence: JSON.stringify({
        reaLanding: src.includes("realestate"),
        domainLanding: src.includes("domain"),
        collectionUrl: s.collectionUrl || s.sourceUrl || null,
        batchDate: BATCH_DATE,
      }),
    };
  });

  // ── 6. Upsert to DB ──
  let inserted = 0, errors = 0;
  for (const rec of records) {
    try {
      if (rec.sale_date && rec.sale_price) {
        await sql`
          INSERT INTO comparable_sales (
            sale_address, sale_price, sale_date, property_type,
            bedrooms, bathrooms, car_spaces, land_size_sqm,
            suburb, state, postcode,
            source_url, source_name,
            collection_date, collection_round, batch_id,
            verification_status, original_evidence
          ) VALUES (
            ${rec.sale_address}, ${rec.sale_price}, ${rec.sale_date}, ${rec.property_type},
            ${rec.bedrooms}, ${rec.bathrooms}, ${rec.car_spaces}, ${rec.land_size_sqm},
            ${rec.suburb}, ${rec.state}, ${rec.postcode},
            ${rec.source_url}, ${rec.source_name},
            ${rec.collection_date}, ${rec.collection_round}, ${rec.batch_id},
            ${rec.verification_status},
            ${rec.original_evidence}
          )
          ON CONFLICT (sale_address, sale_date, sale_price, source_name)
          WHERE sale_date IS NOT NULL AND sale_price IS NOT NULL
          DO UPDATE SET
            verification_status = EXCLUDED.verification_status,
            batch_id = EXCLUDED.batch_id,
            original_evidence = EXCLUDED.original_evidence,
            updated_at = NOW()
        `;
      } else {
        await sql`
          INSERT INTO comparable_sales (
            sale_address, sale_price, sale_date, property_type,
            bedrooms, bathrooms, car_spaces, land_size_sqm,
            suburb, state, postcode,
            source_url, source_name,
            collection_date, collection_round, batch_id,
            verification_status, original_evidence
          ) VALUES (
            ${rec.sale_address}, ${rec.sale_price}, ${rec.sale_date}, ${rec.property_type},
            ${rec.bedrooms}, ${rec.bathrooms}, ${rec.car_spaces}, ${rec.land_size_sqm},
            ${rec.suburb}, ${rec.state}, ${rec.postcode},
            ${rec.source_url}, ${rec.source_name},
            ${rec.collection_date}, ${rec.collection_round}, ${rec.batch_id},
            ${rec.verification_status},
            ${rec.original_evidence}
          )
        `;
      }
      inserted++;
    } catch (e) {
      errors++;
      console.error(`    ${suburb}: upsert error for ${rec.sale_address}: ${e.message?.slice(0,150)}`);
    }
  }

  return {
    suburb,
    scrapedTotal: sales.length,
    deduped: deduped.length,
    inserted,
    errors,
    crossSourceVerified: crossVerified,
    singleSourceObserved: singleObserved,
    minSaleDate: minDate,
    maxSaleDate: maxDate,
    sources: [...allSources].map(s => s.replace("com.au", "").replace("www.", "")),
    failures,
    sufficientForProduction: deduped.length >= 3,
  };
}

function filterHouseOnly(sales) {
  return sales.filter(s => {
    const t = (s.propertyType || "House").toLowerCase();
    return !t.includes("unit") && !t.includes("apartment") && !t.includes("townhouse") && !t.includes("villa")
      && !t.includes("terrace") && !t.includes("studio");
  });
}

function dedupSales(sales) {
  // Group by address, keep one with best source
  const groups = new Map();
  for (const s of sales) {
    const key = normalizeAddress(s.address);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, s);
    } else {
      // Merge: keep the one with more evidence / better source coverage
      const existingSource = existing.source || "";
      const newSource = s.source || "";
      if (newSource.includes("+") && !existingSource.includes("+")) {
        groups.set(key, s);
      } else if (!existingSource.includes("+") && !newSource.includes("+") && newSource !== existingSource) {
        // Merge sources: different single-source from different providers
        existing.source = [existingSource, newSource].filter(Boolean).join("+");
      } else if (s.price !== existing.price || s.saleDate !== existing.saleDate) {
        // Different record (same address, different data) - keep both
        groups.set(key + "|" + Math.random(), s);
      }
    }
  }
  return [...groups.values()];
}

function normalizeAddress(addr) {
  return (addr || "")
    .toLowerCase()
    .replace(/[\s,.-\u00a0]+/g, " ")
    .replace(/\b(street|st|road|rd|avenue|ave|drive|dr|crescent|cres|court|ct|place|pl|close|cl|parade|parc|terrace|ter|crest|rise|ridge|grove|view|vale|way|gate|loop|circuit|cct|heights|lane|walk|green|park|meadow|field|bend|glen|dell|brook|dene|side)\b/g, "")
    .trim();
}

function printProgress(results, startTime) {
  const done = results.length;
  const inserted = results.reduce((s, r) => s + r.inserted, 0);
  const errors = results.reduce((s, r) => s + r.errors, 0);
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n── Progress: ${done} suburbs done, ${inserted} records inserted, ${errors} errors in ${elapsed}min ──`);
}

function printFinalReport(results, startTime) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
  const totalErrors = results.reduce((s, r) => s + r.errors, 0);
  const totalCross = results.reduce((s, r) => s + r.crossSourceVerified, 0);
  const totalSingle = results.reduce((s, r) => s + r.singleSourceObserved, 0);
  const ready = results.filter(r => r.sufficientForProduction).length;
  const failed = results.filter(r => r.scrapedTotal === 0).length;

  console.log("\n" + "=".repeat(75));
  console.log("  BULK IMPORT REPORT");
  console.log("=".repeat(75));
  console.log(`  Batch ID:      ${BATCH_ID}`);
  console.log(`  Total time:     ${elapsed}s (${(elapsed / 60).toFixed(1)}min)`);
  console.log(`  Suburbs:        ${results.length} attempted`);
  console.log(`  Records:        ${totalInserted} inserted, ${totalErrors} errors`);
  console.log(`  Source:         ${totalCross} cross-source verified, ${totalSingle} single-source`);
  console.log(`  Production:     ${ready}/${results.length} suburbs sufficient`);
  console.log(`  Zero records:   ${failed}/${results.length} suburbs`);
  console.log("-".repeat(75));
  console.log(`  ${"Suburb".padEnd(20)} ${"Scraped".padEnd(8)} ${"Inserted".padEnd(9)} ${"Cross".padEnd(6)} ${"Single".padEnd(7)} ${"Ready"}`);
  console.log("-".repeat(75));
  for (const r of results) {
    console.log(`  ${r.suburb.padEnd(20)} ${String(r.scrapedTotal).padEnd(8)} ${String(r.inserted).padEnd(9)} ${String(r.crossSourceVerified).padEnd(6)} ${String(r.singleSourceObserved).padEnd(7)} ${r.sufficientForProduction ? "✅" : "⚠️"}`);
  }

  const fails = results.filter(r => r.failures.length > 0);
  if (fails.length) {
    console.log(`\n  ⚠️ Failures:`);
    fails.forEach(r => console.log(`    ${r.suburb}: ${r.failures.join(" | ")}`));
  }

  console.log("-".repeat(75));
  console.log(`  ✓ Done at ${new Date().toISOString()}`);
}

main().catch(e => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
