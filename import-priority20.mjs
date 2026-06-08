
import { getSql } from "./api/_db.js";
import { ensureComparableSchema } from "./lib/db-schema.js";
import { scrapeSoldData } from "./lib/browser-collector.js";

const PRIORITY_SUBURBS = [
  "Oakleigh", "Oakleigh South", "Scoresby", "Bentleigh East",
  "Balwyn North", "Glen Waverley", "Mount Waverley", "Box Hill",
  "Doncaster", "Doncaster East", "Clayton", "Clayton South",
  "Carnegie", "Malvern East", "Toorak", "Hawthorn", "Kew",
  "Camberwell", "Blackburn", "Vermont South",
];

const STATE = "VIC";
const BATCH_ID = `batch-priority20-${new Date().toISOString().split("T")[0]}`;
const COLLECTION_ROUND = "bulk-import";

const SUBURB_POSTCODES = {
  "Oakleigh": "3166", "Oakleigh South": "3167", "Scoresby": "3179",
  "Bentleigh East": "3165", "Balwyn North": "3104", "Glen Waverley": "3150",
  "Mount Waverley": "3149", "Box Hill": "3128", "Doncaster": "3108",
  "Doncaster East": "3109", "Clayton": "3168", "Clayton South": "3169",
  "Carnegie": "3163", "Malvern East": "3145", "Toorak": "3142",
  "Hawthorn": "3122", "Kew": "3101", "Camberwell": "3124",
  "Blackburn": "3130", "Vermont South": "3133",
};

let sql;

async function importSuburb(suburb) {
  const postcode = SUBURB_POSTCODES[suburb] || "";

  // ── 1. Browser scrape ──
  let sales = [];
  let failures = [];
  try {
    sales = await scrapeSoldData(suburb, STATE, postcode);
    console.log(`  → Browser returned ${sales.length} raw sales`);
  } catch (e) {
    failures.push(`browser-collector 失败: ${e.message}`);
    console.error(`  ✗ Browser error: ${e.message}`);
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
  const houseSales = sales.filter(s => {
    const t = (s.propertyType || "House").toLowerCase();
    return !t.includes("unit") && !t.includes("apartment") && !t.includes("townhouse") && !t.includes("villa");
  });
  console.log(`  → After House filter: ${houseSales.length}`);

  // ── 3. Dedup ──
  const seen = new Set();
  const deduped = [];
  for (const s of houseSales) {
    const key = `${s.address}|${s.price}|${s.saleDate || ""}|${s.source || ""}`;
    if (!seen.has(key)) { seen.add(key); deduped.push(s); }
  }
  console.log(`  → After dedup: ${deduped.length}`);

  // ── 4. Build records ──
  const hasRea = deduped.some(s => (s.source || "").includes("realestate"));
  const hasDomain = deduped.some(s => (s.source || "").includes("domain"));
  let crossVerified = 0, singleObserved = 0;

  const records = deduped.map(s => {
    const isCross = (s.source || "").includes("+") || (hasRea && hasDomain);
    const vStatus = isCross ? "cross_source_verified" : "single_source_observed";
    if (isCross) crossVerified++; else singleObserved++;
    return {
      sale_address: s.address, sale_price: s.price, sale_date: s.saleDate || null,
      property_type: "House",
      bedrooms: s.bedrooms || null, bathrooms: s.bathrooms || null,
      car_spaces: s.carSpaces || null, land_size_sqm: s.landSize || null,
      suburb, state: STATE, postcode: postcode || null,
      source_url: s.collectionUrl || s.sourceUrl || "",
      source_name: s.source || "",
      collection_date: new Date().toISOString().split("T")[0],
      collection_round: COLLECTION_ROUND, batch_id: BATCH_ID,
      verification_status: vStatus,
      original_evidence: JSON.stringify({ rawAddress: s.address, rawPrice: s.price, rawDate: s.saleDate, bedrooms: s.bedrooms, bathrooms: s.bathrooms, carSpaces: s.carSpaces, landSize: s.landSize, source: s.source }),
    };
  });

  // ── 5. Upsert in batch ──
  let inserted = 0, errors = 0;
  for (const rec of records) {
    try {
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
        ON CONFLICT ON CONSTRAINT cs_dedup_idx DO UPDATE SET
          verification_status = EXCLUDED.verification_status,
          batch_id = EXCLUDED.batch_id,
          original_evidence = EXCLUDED.original_evidence,
          updated_at = NOW()
      `;
      inserted++;
    } catch (e) {
      // ON CONFLICT on partial unique index cs_dedup_idx2 (sale_address, sale_date, sale_price, source_name WHERE sale_date IS NOT NULL AND sale_price IS NOT NULL)
      // For NULL sale_date or sale_price, we insert without conflict handling
      if (rec.sale_date && rec.sale_price) {
        try {
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
          inserted++;
        } catch (e) {
          errors++;
          console.error(`  ✗ Upsert error: ${e.message?.slice(0,200)}`);
        }
      } else {
        // NULL date/price: insert without conflict handling
        try {
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
          inserted++;
        } catch (e2) {
          errors++;
          console.error(`  ✗ Insert error: ${e2.message?.slice(0,200)}`);
        }
      }
    }
  }

  const dateRange = deduped.reduce((a, s) => {
    if (s.saleDate) { if (!a.min || s.saleDate < a.min) a.min = s.saleDate; if (!a.max || s.saleDate > a.max) a.max = s.saleDate; }
    return a;
  }, { min: null, max: null });

  return {
    suburb, scrapedTotal: houseSales.length, deduped: deduped.length, inserted, errors: 0,
    crossSourceVerified: crossVerified, singleSourceObserved: singleObserved,
    minSaleDate: dateRange.min, maxSaleDate: dateRange.max,
    sources: [...new Set(deduped.flatMap(s => (s.source || "").split("+")))].filter(Boolean),
    failures, sufficientForProduction: deduped.length >= 3,
  };
}

// ── Main ──
async function main() {
  console.log(`╔══════════════════════════════════════════════╗`);
  console.log(`║  Melbourne Priority 20 — House Data Import ║`);
  console.log(`║  Batch ID: ${BATCH_ID}`);
  console.log(`╚══════════════════════════════════════════════╝\n`);

  // Init DB
  try {
    sql = getSql();
    await ensureComparableSchema(sql);
    console.log(`✓ Database connected, schema ready\n`);
  } catch (e) { console.error(`✗ DB connection failed: ${e.message}`); process.exit(1); }

  // Create or ensure dedup index (partial unique index)
  try {
    // Drop old index if it exists (it was COALESCE-based which doesn't support ON CONFLICT)
    await sql`DROP INDEX IF EXISTS cs_dedup_idx`;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS cs_dedup_idx2 ON comparable_sales (
        sale_address, sale_date, sale_price, source_name
      ) WHERE sale_date IS NOT NULL AND sale_price IS NOT NULL
    `;
    console.log(`✓ cs_dedup_idx2 ready\n`);
  } catch (e) { console.warn(`⚠ dedup index: ${e.message}`); }

  const allResults = [];

  for (let i = 0; i < PRIORITY_SUBURBS.length; i++) {
    const suburb = PRIORITY_SUBURBS[i];
    const prefix = `[${String(i+1).padStart(2,"0")}/20]`;
    console.log(`\n${"─".repeat(55)}`);
    console.log(`${prefix} ${suburb}`);
    console.log(`${"─".repeat(55)}`);

    try {
      const r = await importSuburb(suburb);
      allResults.push(r);
      console.log(`  Summary: scraped=${r.scrapedTotal} deduped=${r.deduped} inserted=${r.inserted} cross=${r.crossSourceVerified} single=${r.singleSourceObserved} range=${r.minSaleDate||"?"}~${r.maxSaleDate||"?"} sources=[${r.sources.join(",")}] ready=${r.sufficientForProduction ? "YES" : "NO"}`);
      if (r.failures.length) console.log(`  Failures: ${r.failures.join(" | ")}`);
    } catch (e) {
      allResults.push({ suburb, scrapedTotal:0, deduped:0, inserted:0, errors:0, crossSourceVerified:0, singleSourceObserved:0, minSaleDate:null, maxSaleDate:null, sources:[], failures:[e.message], sufficientForProduction:false });
      console.error(`  ✗ ${e.message}`);
    }
  }

  console.log(`\n\n${"═".repeat(65)}`);
  console.log(`FINAL REPORT`);
  console.log(`${"═".repeat(65)}`);
  console.log(`\n${"Suburb".padEnd(18)} ${"Scraped".padEnd(8)} ${"Inserted".padEnd(9)} ${"Cross".padEnd(6)} ${"Single".padEnd(7)} ${"Ready"}`);
  console.log(`${"─".repeat(55)}`);
  let ts=0, ti=0, tc=0, tsg=0, rdy=0;
  for (const r of allResults) {
    console.log(`${r.suburb.padEnd(18)} ${String(r.scrapedTotal).padEnd(8)} ${String(r.inserted).padEnd(9)} ${String(r.crossSourceVerified).padEnd(6)} ${String(r.singleSourceObserved).padEnd(7)} ${r.sufficientForProduction ? "✅" : "⚠️"}`);
    ts+=r.scrapedTotal; ti+=r.inserted; tc+=r.crossSourceVerified; tsg+=r.singleSourceObserved;
    if (r.sufficientForProduction) rdy++;
  }
  console.log(`${"─".repeat(55)}`);
  console.log(`TOTAL ${String(ts).padEnd(6)} ${String(ti).padEnd(9)} ${String(tc).padEnd(6)} ${String(tsg).padEnd(7)} ${rdy}/20`);

  const fails = allResults.filter(r => r.failures.length > 0);
  if (fails.length) { console.log(`\n⚠️ Failures:`); fails.forEach(r => console.log(`  ${r.suburb}: ${r.failures.join(" | ")}`)); }

  console.log(`\n✓ Done at ${new Date().toISOString()}`);
}

main().catch(e => { console.error(`Fatal: ${e.message}`); process.exit(1); });
