// ── 一次性补充数据少于10条的25个suburb ──
// 用法: node cron-supplement.mjs
import { scrapeSoldData } from "./lib/browser-collector.js";
import { getSql } from "./api/_db.js";

const LOW_DATA_AREAS = [
  ["Balwyn North", "VIC", "3104"],
  ["Balwyn", "VIC", "3103"],
  ["Albert Park", "VIC", "3206"],
  ["Brighton", "VIC", "3186"],
  ["Brighton East", "VIC", "3187"],
  ["Melton", "VIC", "3337"],
  ["Ashburton", "VIC", "3147"],
  ["Malvern", "VIC", "3144"],
  ["Mornington", "VIC", "3931"],
  ["Ballarat", "VIC", "3350"],
  ["Hawthorn East", "VIC", "3123"],
  ["Glen Iris", "VIC", "3146"],
  ["Caulfield North", "VIC", "3161"],
  ["Black Rock", "VIC", "3193"],
  ["Hampton", "VIC", "3188"],
  ["Bendigo", "VIC", "3550"],
  ["South Yarra", "VIC", "3141"],
  ["Bentleigh", "VIC", "3204"],
  ["Kew", "VIC", "3101"],
  ["Armadale", "VIC", "3143"],
  ["Caulfield", "VIC", "3162"],
  ["Mont Albert", "VIC", "3127"],
  ["Caulfield South", "VIC", "3162"],
  ["Canterbury", "VIC", "3126"],
  ["Wheelers Hill", "VIC", "3150"],
];

async function main() {
  const sql = await getSql();
  console.log(`[Supplement] Starting ${LOW_DATA_AREAS.length} low-data suburbs...`);

  const batchId = `supplement_${new Date().toISOString().slice(0, 10)}_${Date.now()}`;
  let totalFetched = 0;
  let totalSaved = 0;

  for (const [suburb, state, postcode] of LOW_DATA_AREAS) {
    console.log(`[Supplement] Collecting ${suburb}...`);
    let raw;
    try {
      raw = await scrapeSoldData(suburb, state, postcode, 5);
    } catch (err) {
      console.warn(`[Supplement] scrape failed ${suburb}: ${err.message}`);
      continue;
    }

    const sales = Array.isArray(raw) ? raw : [];
    totalFetched += sales.length;
    console.log(`  → ${sales.length} raw listings`);

    for (const s of sales) {
      try {
        const exists = await sql`
          SELECT 1 FROM comparable_sales
          WHERE sale_address = ${s.address || ""}
            AND sale_date = ${s.saleDate || null}
            AND sale_price = ${s.price ? Number(s.price) : null}
            AND source_name = ${s.source || "unknown"}
          LIMIT 1
        `;
        if (Array.isArray(exists) && exists.length > 0) continue;

        await sql`
          INSERT INTO comparable_sales (
            sale_address, sale_price, sale_date, property_type,
            bedrooms, bathrooms, car_spaces, land_size_sqm,
            suburb, state, postcode,
            source_url, source_name, raw_price_text,
            collection_date, collection_round, batch_id
          ) VALUES (
            ${s.address || ""},
            ${s.price ? Number(s.price) : null},
            ${s.saleDate || null},
            ${s.propertyType || null},
            ${s.bedrooms ? Number(s.bedrooms) : null},
            ${s.bathrooms ? Number(s.bathrooms) : null},
            ${s.carSpaces ? Number(s.carSpaces) : null},
            ${s.landSize ? Number(s.landSize) : null},
            ${suburb}, ${state}, ${postcode},
            ${s.sourceUrl || ""},
            ${s.source || "unknown"},
            ${s.rawPrice || null},
            CURRENT_DATE, 'supplement', ${batchId}
          )
        `;
        totalSaved++;
      } catch (err) {
        console.warn(`[Supplement] DB insert error: ${err.message}`);
      }
    }
  }

  console.log(`[Supplement] Complete: ${totalFetched} fetched, ${totalSaved} saved`);
  process.exit(0);
}

main().catch(err => {
  console.error("[Supplement] Fatal:", err.message);
  process.exit(1);
});
