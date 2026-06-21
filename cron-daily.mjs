// ── 日更采集 cron 入口 ──
// 从 realestate.com.au / Domain 采集成交数据 → 写入数据库
// 环境要求：DATABASE_URL (Neon PostgreSQL) + OpenClaw CDP on :18800
//
// 用法：
//   node cron-daily.mjs                              # 采集 TOP 10 SA2
//   node cron-daily.mjs "South Melbourne" VIC 3205   # 指定郊区+邮编

import { scrapeSoldData } from "./lib/browser-collector.js";
import { ensureComparableSchema } from "./lib/db-schema.js";
import { getSql } from "./api/_db.js";

// ── 默认采集列表（TOP 10 墨尔本热门郊区）──
const DEFAULT_AREAS = [
  { suburb: "South Melbourne",     state: "VIC", postcode: "3205" },
  { suburb: "Port Melbourne",      state: "VIC", postcode: "3207" },
  { suburb: "Richmond",            state: "VIC", postcode: "3121" },
  { suburb: "Fitzroy",             state: "VIC", postcode: "3065" },
  { suburb: "Brunswick",           state: "VIC", postcode: "3056" },
  { suburb: "Prahran",             state: "VIC", postcode: "3181" },
  { suburb: "Hawthorn",            state: "VIC", postcode: "3122" },
  { suburb: "Kew",                 state: "VIC", postcode: "3101" },
  { suburb: "Carlton",             state: "VIC", postcode: "3053" },
  { suburb: "St Kilda",            state: "VIC", postcode: "3182" }
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[Cron Daily] DATABASE_URL not set — cron cannot run");
    process.exit(0);  // 干净退出，不报错（环境未配置不是脚本 bug）
  }

  const sql = await getSql();
  await ensureComparableSchema(sql);
  console.log("[Cron Daily] Schema ready");

  const areas = (process.argv[2] && process.argv[3])
    ? [{ suburb: process.argv[2], state: process.argv[3], postcode: process.argv[4] || "" }]
    : DEFAULT_AREAS;

  const batchId = `daily_${new Date().toISOString().slice(0, 10)}_${Date.now()}`;
  let totalSaved = 0;
  let totalFetched = 0;

  for (const area of areas) {
    console.log(`[Cron Daily] Collecting ${area.suburb}, ${area.state} ${area.postcode}...`);

    let raw;
    try {
      raw = await scrapeSoldData(area.suburb, area.state, area.postcode);
    } catch (err) {
      console.warn(`[Cron Daily] scrape failed for ${area.suburb}: ${err.message}`);
      continue;
    }

    const sales = Array.isArray(raw) ? raw : [];
    totalFetched += sales.length;
    console.log(`[Cron Daily] ${area.suburb}: ${sales.length} raw sales fetched`);

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
            ${area.suburb},
            ${area.state},
            ${area.postcode},
            ${s.sourceUrl || ""},
            ${s.source || "unknown"},
            ${s.rawPrice || null},
            CURRENT_DATE,
            'daily',
            ${batchId}
          )
          ON CONFLICT (sale_address, sale_date, sale_price, source_name)
            WHERE sale_date IS NOT NULL AND sale_price IS NOT NULL DO NOTHING
          RETURNING id
        `;
        if (Array.isArray(result) && result.length > 0) {
          totalSaved++;
        }
      } catch (err) {
        console.warn(`[Cron Daily] DB insert error: ${err.message}`);
      }
    }
  }

  console.log(`[Cron Daily] Complete: ${totalFetched} fetched, ${totalSaved} saved (batch ${batchId})`);
  process.exit(0);
}

main().catch(err => {
  console.error("[Cron Daily] Fatal:", err.message);
  process.exit(1); // 真实错误必须报非零
});
