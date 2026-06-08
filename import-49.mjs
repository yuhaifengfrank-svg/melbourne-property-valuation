// ── Import 49 VIC suburbs: House + Units/Townhouses/Villas ──
import { getSql } from "./api/_db.js";
import { ensureComparableSchema } from "./lib/db-schema.js";
import { scrapeSoldData, fetchPageText, parseReaSold } from "./lib/browser-collector.js";

const SUBURBS = [
  "East Melbourne", "South Melbourne", "Port Melbourne", "North Melbourne", "West Melbourne",
  "Docklands", "Melbourne CBD", "Ashburton", "Murrumbeena", "Glen Huntly",
  "Caulfield East", "Pascoe Vale North", "Keilor Park", "Gowanbrae", "Manor Lakes",
  "Highton", "Newtown", "Diggers Rest", "Bell Park", "Bell Post Hill",
  "Lara", "Leopold", "Waurn Ponds", "Ocean Grove", "Mount Martha",
  "Safety Beach", "Rosebud", "Dromana", "Rye", "Blairgowrie",
  "Tootgarook", "McCrae", "Somerville", "Hastings", "Langwarrin South",
  "Skye North", "Endeavour Hills South", "Narre Warren East", "Officer East",
  "Clyde North East", "Clyde North South", "Tarneit South", "Point Cook South",
  "Truganina West", "Werribee South", "Wyndham Harbour", "Altona Meadows", "Derrimut", "Cairnlea",
];

const STATE = "VIC";
const BATCH_ID = "batch-49-house-units-2026-06-08";
const COLLECTION_ROUND = "bulk-import";
const BATCH_DATE = "2026-06-08";
const CONCURRENCY = 5;

let sql;

// ── Slug helper ──
function toSlug(suburb) {
  return suburb.toLowerCase().replace(/\s+/g, "-");
}

// ── Import House data for one suburb ──
async function importHouse(suburb) {
  let sales;
  try {
    sales = await scrapeSoldData(suburb, STATE, "");
  } catch (e) {
    // Melbourne CBD typically returns 0 houses — that's normal
    return { scraped: 0, inserted: 0, errors: 0 };
  }

  // scrapeSoldData already filters via propertyTypes=house in the URL AND deduplicates via deduplicate()
  // But also do an explicit House filter for safety
  const houseSales = sales.filter(s => {
    const t = (s.propertyType || "House").toLowerCase();
    return !t.includes("unit") && !t.includes("apartment") && !t.includes("townhouse") && !t.includes("villa");
  });

  if (houseSales.length === 0) return { scraped: 0, inserted: 0, errors: 0 };

  let inserted = 0, errors = 0;
  for (const s of houseSales) {
    try {
      const propertyType = "House";
      const collectionUrl = s.collectionUrl || "";
      const sourceName = s.source || "realestate.com.au";

      if (s.saleDate && s.price) {
        await sql`
          INSERT INTO comparable_sales (
            sale_address, sale_price, sale_date, property_type,
            bedrooms, bathrooms, car_spaces, land_size_sqm,
            suburb, state, source_url, source_name,
            collection_date, collection_round, batch_id,
            verification_status, original_evidence
          ) VALUES (
            ${s.address}, ${s.price}, ${s.saleDate}, ${propertyType},
            ${s.bedrooms ?? null}, ${s.bathrooms ?? null}, ${s.carSpaces ?? null}, ${s.landSize ?? null},
            ${suburb}, ${STATE}, ${collectionUrl}, ${sourceName},
            ${BATCH_DATE}, ${COLLECTION_ROUND}, ${BATCH_ID},
            ${s.verificationStatus || "single_source_observed"},
            ${JSON.stringify({
              rawAddress: s.address, rawPrice: s.price, rawDate: s.saleDate,
              bedrooms: s.bedrooms, bathrooms: s.bathrooms, carSpaces: s.carSpaces,
              landSize: s.landSize, source: s.source, collectionUrl,
              propertyType: s.propertyType
            })}
          )
          ON CONFLICT (sale_address, sale_date, sale_price, source_name)
          WHERE sale_date IS NOT NULL AND sale_price IS NOT NULL
          DO UPDATE SET
            batch_id = EXCLUDED.batch_id,
            verification_status = EXCLUDED.verification_status,
            original_evidence = EXCLUDED.original_evidence,
            updated_at = NOW()
        `;
      } else {
        // NULL date/price — insert without conflict handling
        await sql`
          INSERT INTO comparable_sales (
            sale_address, sale_price, sale_date, property_type,
            bedrooms, bathrooms, car_spaces, land_size_sqm,
            suburb, state, source_url, source_name,
            collection_date, collection_round, batch_id,
            verification_status, original_evidence
          ) VALUES (
            ${s.address}, ${s.price}, ${s.saleDate ?? null}, ${propertyType},
            ${s.bedrooms ?? null}, ${s.bathrooms ?? null}, ${s.carSpaces ?? null}, ${s.landSize ?? null},
            ${suburb}, ${STATE}, ${collectionUrl}, ${sourceName},
            ${BATCH_DATE}, ${COLLECTION_ROUND}, ${BATCH_ID},
            ${s.verificationStatus || "single_source_observed"},
            ${JSON.stringify({
              rawAddress: s.address, rawPrice: s.price, rawDate: s.saleDate,
              bedrooms: s.bedrooms, bathrooms: s.bathrooms, carSpaces: s.carSpaces,
              landSize: s.landSize, source: s.source, collectionUrl,
              propertyType: s.propertyType
            })}
          )
        `;
      }
      inserted++;
    } catch (e) {
      errors++;
    }
  }
  return { scraped: houseSales.length, inserted, errors };
}

// ── Import Unit/Townhouse/Villa for one suburb ──
async function importUnits(suburb) {
  const slug = toSlug(suburb);
  const url = `https://www.realestate.com.au/sold/in-${slug}+vic/list-1?activeSort=solddate`;

  let result;
  try {
    result = await fetchPageText(url);
  } catch (e) {
    return { scraped: 0, inserted: 0, errors: 1 };
  }

  if (!result.ok || !result.text) return { scraped: 0, inserted: 0, errors: 0 };

  const allSales = parseReaSold(result.text, suburb);

  // parseReaSold defaults to propertyType: "House" — we need to re-evaluate
  // The parser sets propertyType from text patterns "House", "Townhouse", "Apartment", "Unit", "Villa", "Land"
  // Filter for unit/townhouse/villa
  const units = allSales.filter(s => {
    const t = (s.propertyType || "").toLowerCase();
    return t === "unit" || t === "townhouse" || t === "villa";
  });

  // CRITICAL: set collectionUrl and source on every result
  for (const s of units) {
    s.collectionUrl = s.collectionUrl || url;
    s.source = s.source || "realestate.com.au";
  }

  if (units.length === 0) return { scraped: 0, inserted: 0, errors: 0 };

  let inserted = 0, errors = 0;
  for (const s of units) {
    try {
      const propertyType = (() => {
        const t = (s.propertyType || "").toLowerCase();
        if (t === "unit") return "Unit";
        if (t === "townhouse") return "Townhouse";
        if (t === "villa") return "Villa";
        return "Unit";
      })();
      const collectionUrl = s.collectionUrl || url;
      const sourceName = s.source || "realestate.com.au";

      if (s.saleDate && s.price) {
        await sql`
          INSERT INTO comparable_sales (
            sale_address, sale_price, sale_date, property_type,
            bedrooms, bathrooms, car_spaces, land_size_sqm,
            suburb, state, source_url, source_name,
            collection_date, collection_round, batch_id,
            verification_status, original_evidence
          ) VALUES (
            ${s.address}, ${s.price}, ${s.saleDate}, ${propertyType},
            ${s.bedrooms ?? null}, ${s.bathrooms ?? null}, ${s.carSpaces ?? null}, ${s.landSize ?? null},
            ${suburb}, ${STATE}, ${collectionUrl}, ${sourceName},
            ${BATCH_DATE}, ${COLLECTION_ROUND}, ${BATCH_ID},
            'single_source_observed',
            ${JSON.stringify({
              rawAddress: s.address, rawPrice: s.price, rawDate: s.saleDate,
              bedrooms: s.bedrooms, bathrooms: s.bathrooms, carSpaces: s.carSpaces,
              landSize: s.landSize, source: s.source, collectionUrl,
              propertyType: s.propertyType
            })}
          )
          ON CONFLICT (sale_address, sale_date, sale_price, source_name)
          WHERE sale_date IS NOT NULL AND sale_price IS NOT NULL
          DO UPDATE SET
            batch_id = EXCLUDED.batch_id,
            verification_status = EXCLUDED.verification_status,
            original_evidence = EXCLUDED.original_evidence,
            updated_at = NOW()
        `;
      } else {
        await sql`
          INSERT INTO comparable_sales (
            sale_address, sale_price, sale_date, property_type,
            bedrooms, bathrooms, car_spaces, land_size_sqm,
            suburb, state, source_url, source_name,
            collection_date, collection_round, batch_id,
            verification_status, original_evidence
          ) VALUES (
            ${s.address}, ${s.price}, ${s.saleDate ?? null}, ${propertyType},
            ${s.bedrooms ?? null}, ${s.bathrooms ?? null}, ${s.carSpaces ?? null}, ${s.landSize ?? null},
            ${suburb}, ${STATE}, ${collectionUrl}, ${sourceName},
            ${BATCH_DATE}, ${COLLECTION_ROUND}, ${BATCH_ID},
            'single_source_observed',
            ${JSON.stringify({
              rawAddress: s.address, rawPrice: s.price, rawDate: s.saleDate,
              bedrooms: s.bedrooms, bathrooms: s.bathrooms, carSpaces: s.carSpaces,
              landSize: s.landSize, source: s.source, collectionUrl,
              propertyType: s.propertyType
            })}
          )
        `;
      }
      inserted++;
    } catch (e) {
      errors++;
    }
  }
  return { scraped: units.length, inserted, errors };
}

// ── Concurrent queue ──
async function runQueue(suburbs, importFn, label) {
  let cursor = 0;
  let totalScraped = 0, totalInserted = 0, totalErrors = 0;
  const suburbResults = [];

  function next() {
    return new Promise(resolve => {
      let completed = 0;
      async function worker() {
        while (true) {
          const idx = cursor++;
          if (idx >= suburbs.length) { resolve(); return; }
          const suburb = suburbs[idx];

          try {
            const r = await importFn(suburb);
            totalScraped += r.scraped;
            totalInserted += r.inserted;
            totalErrors += r.errors;
            suburbResults.push({ suburb, ...r });
            console.log(`  [${label}] [${String(idx + 1).padStart(2, "0")}/${suburbs.length}] ${suburb.padEnd(22)}: scraped=${r.scraped} inserted=${r.inserted}${r.errors ? ` errors=${r.errors}` : ""}`);
          } catch (e) {
            totalErrors++;
            suburbResults.push({ suburb, scraped: 0, inserted: 0, errors: 1 });
            console.log(`  [${label}] [${String(idx + 1).padStart(2, "0")}/${suburbs.length}] ${suburb.padEnd(22)}: ERROR ${e.message?.slice(0, 80)}`);
          }
        }
      }
      for (let i = 0; i < CONCURRENCY; i++) worker();
    });
  }

  await next();
  return { totalScraped, totalInserted, totalErrors, suburbResults };
}

// ── Main ──
async function main() {
  console.log(
    `╔══════════════════════════════════════════════════╗\n` +
    `║     Import 49 VIC Suburbs — House + Units        ║\n` +
    `║  Batch ID: ${BATCH_ID}\n` +
    `╚══════════════════════════════════════════════════╝\n`
  );

  // Init DB
  try {
    sql = getSql();
    await ensureComparableSchema(sql);
    console.log("✓ Database connected, schema ready\n");
  } catch (e) {
    console.error(`✗ DB connection failed: ${e.message}`);
    process.exit(1);
  }

  // ── Phase 1: House import ──
  console.log("─".repeat(55));
  console.log("PHASE 1: House import (REA only, scrapeSoldData)");
  console.log("─".repeat(55));
  const houseResults = await runQueue(SUBURBS, importHouse, "House");
  console.log(
    `\n  House done: ${houseResults.totalScraped} scraped, ${houseResults.totalInserted} inserted, ${houseResults.totalErrors} errors\n`
  );

  // ── Phase 2: Unit/Townhouse/Villa import ──
  console.log("─".repeat(55));
  console.log("PHASE 2: Unit/Townhouse/Villa import (fetchPageText + parseReaSold)");
  console.log("─".repeat(55));
  const unitResults = await runQueue(SUBURBS, importUnits, "Unit");
  console.log(
    `\n  Units done: ${unitResults.totalScraped} scraped, ${unitResults.totalInserted} inserted, ${unitResults.totalErrors} errors\n`
  );

  // ── Summary ──
  const dbCount = await sql`
    SELECT COUNT(*)::int as cnt FROM comparable_sales WHERE batch_id = ${BATCH_ID}
  `;

  const typeDist = await sql`
    SELECT property_type, COUNT(*)::int as cnt
    FROM comparable_sales WHERE batch_id = ${BATCH_ID}
    GROUP BY property_type ORDER BY cnt DESC
  `;

  console.log("\n" + "═".repeat(65));
  console.log("FINAL REPORT");
  console.log("═".repeat(65));
  console.log(`\nTotal scraped (House):   ${houseResults.totalScraped}`);
  console.log(`Total scraped (Units):   ${unitResults.totalScraped}`);
  console.log(`Total inserted (House):  ${houseResults.totalInserted}`);
  console.log(`Total inserted (Units):  ${unitResults.totalInserted}`);
  console.log(`Total DB count (batch):  ${dbCount[0].cnt}`);
  console.log(`Total errors:            ${houseResults.totalErrors + unitResults.totalErrors}`);
  console.log(`\nType breakdown:`);
  for (const x of typeDist) {
    console.log(`  ${x.property_type}: ${x.cnt}`);
  }

  // Suburbs with 0 results
  const zeroHouse = houseResults.suburbResults.filter(r => r.inserted === 0);
  const zeroUnit = unitResults.suburbResults.filter(r => r.inserted === 0);
  if (zeroHouse.length > 0) {
    console.log(`\nSuburbs with 0 House: ${zeroHouse.map(r => r.suburb).join(", ")}`);
  }
  if (zeroUnit.length > 0) {
    console.log(`\nSuburbs with 0 Units: ${zeroUnit.map(r => r.suburb).join(", ")}`);
  }

  console.log(`\n✓ Done at ${new Date().toISOString()}`);
}

main().catch(e => {
  console.error(`\nFatal: ${e.message}`);
  process.exit(1);
});
