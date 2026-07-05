// ── Collect Single Suburb — REA only, 50 pages ──
// Dedicated for the 21 stubborn suburbs that need aggressive REA scraping.
// Usage: node scripts/collect-rea-only.mjs <suburb> <state> <postcode> <batchNum>
import { fetchPageText, parseReaSold } from "../lib/browser-collector.js";
import { getSql } from "../api/_db.js";
import fs from "fs";
import { execSync } from "child_process";

const suburb = process.argv[2];
const state  = process.argv[3] || "VIC";
const pc     = process.argv[4] || null;
const batchNum = parseInt(process.argv[5] || "99");
const MAX_PAGES = parseInt(process.argv[6]) || 30;

const melbDate = () => {
  const d = new Date();
  const opts = { timeZone: "Australia/Melbourne", year: "numeric", month: "2-digit", day: "2-digit" };
  const parts = new Intl.DateTimeFormat("en-CA", opts).formatToParts(d);
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
  const subSlug = suburb.toLowerCase().replace(/\s+/g, "-");
  const stateLower = state.toLowerCase();
  const allSales = [];

  console.log(`[${suburb}] Scraping REA only (${MAX_PAGES} pages)...`);

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `https://www.realestate.com.au/sold/in-${subSlug}+${stateLower}/list-${page}?activeSort=solddate&propertyTypes=house`;
    try {
      const result = await fetchPageText(url);
      if (!result.ok || !result.text) break;
      const sales = parseReaSold(result.text, suburb);
      if (sales.length === 0) break;
      sales.forEach(s => { s.collectionUrl = url; s.evidenceUrls = s.evidenceUrls || []; s.evidenceUrls.push(url); });
      allSales.push(...sales);
    } catch { break; }

    if (page % 10 === 0) console.log(`  REA page ${page}/${MAX_PAGES}...`);
  }

  console.log(`[${suburb}] ${allSales.length} records scraped`);

  if (allSales.length === 0) return;

  // Write to VM data lake
  const safeName = suburb.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  const filename = `rea_daily_${BATCH_DATE}_batch${batchNum}_${safeName}.json`;
  const tmpPath = `/tmp/${filename}`;
  fs.writeFileSync(tmpPath, JSON.stringify({
    metadata: {
      suburb, collection_date: BATCH_DATE,
      batch_id: `rea-daily-${BATCH_DATE}-batch${batchNum}`,
      source: "realestate.com.au only",
      record_count: allSales.length,
      max_pages: MAX_PAGES,
      collected_at: new Date().toISOString()
    }, records: allSales
  }, null, 2), "utf8");
  try {
    execSync(`rsync -az --rsync-path="mkdir -p ${VM_RAW_DIR} && rsync" ${tmpPath} ${VM_HOST}:${VM_RAW_DIR}/${filename}`, { timeout: 15000 });
    fs.unlinkSync(tmpPath);
    console.log(`  📦 raw/${filename} sent to VM lake`);
  } catch (e) {
    console.log(`  ⚠️  VM lake write failed: ${e.message.slice(0, 100)}`);
  }

  // Insert into comparable_sales
  let inserted = 0, skipped = 0;
  for (const rec of allSales) {
    try {
      const addr = (rec.address || "").toLowerCase();
      let ptype = rec.propertyType || "House";
      if (/^\s*\d+\s*\//.test(addr)) ptype = "Unit";
      else if (/\b(?:unit|flat|apartment|apt)\b/i.test(addr)) ptype = "Unit";
      else if (/\btown(?:house)?\b/i.test(addr)) ptype = "Townhouse";
      else if (/\bvilla\b/i.test(addr)) ptype = "Villa";
      else if (/\bland\b/i.test(addr) || /vacant/i.test(addr)) ptype = "Vacant land";

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
        DO UPDATE SET batch_id = EXCLUDED.batch_id, updated_at = NOW()`,
        [
          rec.address?.substring(0, 300) || "",
          rec.price,
          rec.saleDate ? rec.saleDate.replace(/\//g, "-") : null,
          ptype,
          rec.bedrooms || null, rec.bathrooms || null,
          rec.carSpaces || null, rec.landSize || null,
          suburb, state, pc,
          rec.evidenceUrls?.[0] || rec.collectionUrl || null,
          rec.source || "realestate.com.au",
          BATCH_DATE, "daily", `rea-daily-${batchNum}`
        ]
      );
      inserted++;
    } catch (e) {
      if (e.message?.includes("duplicate") || e.message?.includes("unique")) {
        skipped++;
      } else {
        console.log(`  ⚠️  DB error: ${e.message?.slice(0, 100)}`);
      }
    }
  }

  console.log(`[${suburb}] → ${inserted} inserted, ${skipped} skipped`);
}

main().catch(e => { console.error(`FATAL: [${suburb}] ${e.message.slice(0, 150)}`); process.exit(1); });
