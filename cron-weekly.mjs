// ── 周更采集 cron 入口 ──
// 比日更覆盖更多郊区（TOP 50），跳过日更已处理的
// 用法：node cron-weekly.mjs

import { scrapeSoldData } from "./lib/browser-collector.js";
import { ensureComparableSchema } from "./lib/db-schema.js";
import { getSql } from "./api/_db.js";

const DAILY_AREAS = [
  "South Melbourne", "Port Melbourne", "Richmond", "Fitzroy", "Brunswick",
  "Prahran", "Hawthorn", "Kew", "Carlton", "St Kilda"
];

const WEEKLY_AREAS = [
  ["Essendon", "VIC", "3040"], ["Moonee Ponds", "VIC", "3039"],
  ["Ascot Vale", "VIC", "3032"], ["Kensington", "VIC", "3031"],
  ["North Melbourne", "VIC", "3051"], ["West Melbourne", "VIC", "3003"],
  ["Docklands", "VIC", "3008"], ["Southbank", "VIC", "3006"],
  ["Albert Park", "VIC", "3206"], ["Middle Park", "VIC", "3206"],
  ["Elwood", "VIC", "3184"], ["Balaclava", "VIC", "3183"],
  ["Caulfield North", "VIC", "3161"], ["Caulfield South", "VIC", "3162"],
  ["Glen Iris", "VIC", "3146"], ["Malvern", "VIC", "3144"],
  ["Toorak", "VIC", "3142"], ["Armadale", "VIC", "3143"],
  ["Camberwell", "VIC", "3124"], ["Canterbury", "VIC", "3126"],
  ["Surrey Hills", "VIC", "3127"], ["Box Hill", "VIC", "3128"],
  ["Doncaster", "VIC", "3108"], ["Balwyn", "VIC", "3103"],
  ["Ivanhoe", "VIC", "3079"], ["Heidelberg", "VIC", "3084"],
  ["Northcote", "VIC", "3070"], ["Thornbury", "VIC", "3071"],
  ["Preston", "VIC", "3072"], ["Coburg", "VIC", "3058"],
  ["Pascoe Vale", "VIC", "3044"], ["Glenroy", "VIC", "3046"],
  ["Footscray", "VIC", "3011"], ["Yarraville", "VIC", "3013"],
  ["Seddon", "VIC", "3011"], ["Williamstown", "VIC", "3016"],
  ["Newport", "VIC", "3015"], ["Altona", "VIC", "3018"],
  ["Point Cook", "VIC", "3030"], ["Werribee", "VIC", "3030"]
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[Cron Weekly] DATABASE_URL not set — cron cannot run");
    process.exit(0);
  }

  const sql = await getSql();
  await ensureComparableSchema(sql);
  console.log("[Cron Weekly] Schema ready");

  const batchId = `weekly_${new Date().toISOString().slice(0, 10)}_${Date.now()}`;
  let totalSaved = 0;
  let totalFetched = 0;

  for (const [suburb, state, postcode] of WEEKLY_AREAS) {
    if (DAILY_AREAS.includes(suburb)) {
      console.log(`[Cron Weekly] Skip ${suburb} (daily coverage)`);
      continue;
    }

    console.log(`[Cron Weekly] Collecting ${suburb}...`);
    let raw;
    try {
      raw = await scrapeSoldData(suburb, state, postcode);
    } catch (err) {
      console.warn(`[Cron Weekly] scrape failed ${suburb}: ${err.message}`);
      continue;
    }

    const sales = Array.isArray(raw) ? raw : [];
    totalFetched += sales.length;

    for (const s of sales) {
      try {
        const result = await sql`
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
            CURRENT_DATE, 'weekly', ${batchId}
          )
          ON CONFLICT (sale_address, COALESCE(sale_date, '1970-01-01'::date), COALESCE(sale_price, -1), source_name)
          DO NOTHING
          RETURNING id
        `;
        if (Array.isArray(result) && result.length > 0) {
          totalSaved++;
        }
      } catch (err) {
        console.warn(`[Cron Weekly] DB insert error: ${err.message}`);
      }
    }
  }

  console.log(`[Cron Weekly] Complete: ${totalFetched} fetched, ${totalSaved} saved (batch ${batchId})`);
  process.exit(0);
}

main().catch(err => {
  console.error("[Cron Weekly] Fatal:", err.message);
  process.exit(1);
});
