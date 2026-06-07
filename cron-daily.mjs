// ── 日更抓取 cron 入口 ──
// 每天凌晨跑：维州 TOP 100 SA2
//
// 用法:  node cron-daily.mjs
// 环境变量: DATABASE_URL (Neon PostgreSQL)

import { getSql, ensureSchema } from "./api/_db.js";
import { ensureComparableSchema } from "./lib/db-schema.js";
import { collectAll, saveSalesToDb } from "./lib/browser-collector.js";

const TOP_100 = [
  // 墨尔本内城区及富裕区
  { sa2_code: "206011128", sa2_name: "Melbourne CBD", suburb: "Melbourne", state: "VIC", priority: "daily" },
  { sa2_code: "206071144", sa2_name: "St Kilda - Brighton", suburb: "Brighton", state: "VIC", priority: "daily" },
  { sa2_code: "206071145", sa2_name: "Camberwell - Glen Iris", suburb: "Camberwell", state: "VIC", priority: "daily" },
  { sa2_code: "206071146", sa2_name: "Hawthorn - Kew", suburb: "Hawthorn", state: "VIC", priority: "daily" },
  { sa2_code: "206071147", sa2_name: "Malvern - Toorak", suburb: "Toorak", state: "VIC", priority: "daily" },
  { sa2_code: "206071148", sa2_name: "Armadale - Malvern East", suburb: "Malvern East", state: "VIC", priority: "daily" },
  { sa2_code: "206071149", sa2_name: "Caulfield - Elsternwick", suburb: "Caulfield", state: "VIC", priority: "daily" },
  { sa2_code: "206071150", sa2_name: "Glen Eira - Bentleigh", suburb: "Bentleigh", state: "VIC", priority: "daily" },
  // 东区
  { sa2_code: "207011149", sa2_name: "Camberwell (South)", suburb: "Camberwell", state: "VIC", priority: "daily" },
  { sa2_code: "207011150", sa2_name: "Hawthorn East - Glenferrie", suburb: "Hawthorn East", state: "VIC", priority: "daily" },
  { sa2_code: "207011151", sa2_name: "Box Hill - Blackburn", suburb: "Box Hill", state: "VIC", priority: "daily" },
  { sa2_code: "207011152", sa2_name: "Doncaster - Templestowe", suburb: "Doncaster", state: "VIC", priority: "daily" },
  { sa2_code: "207011153", sa2_name: "Mitcham - Vermont", suburb: "Mitcham", state: "VIC", priority: "daily" },
  { sa2_code: "207011154", sa2_name: "Ringwood - Croydon", suburb: "Ringwood", state: "VIC", priority: "daily" },
  { sa2_code: "207011155", sa2_name: "Lilydale - Mooroolbark", suburb: "Lilydale", state: "VIC", priority: "daily" },
  { sa2_code: "207011156", sa2_name: "Wantirna - Scoresby", suburb: "Wantirna", state: "VIC", priority: "daily" },
  { sa2_code: "207011157", sa2_name: "Knox - Boronia", suburb: "Knoxfield", state: "VIC", priority: "daily" },
  // 东南区
  { sa2_code: "207011158", sa2_name: "Clayton - Oakleigh", suburb: "Clayton", state: "VIC", priority: "daily" },
  { sa2_code: "207011159", sa2_name: "Oakleigh South - Clarinda", suburb: "Oakleigh South", state: "VIC", priority: "daily" },
  { sa2_code: "207011160", sa2_name: "Springvale - Mulgrave", suburb: "Springvale", state: "VIC", priority: "daily" },
  { sa2_code: "207011161", sa2_name: "Dandenong - Noble Park", suburb: "Dandenong", state: "VIC", priority: "daily" },
  { sa2_code: "207011162", sa2_name: "Chelsea - Edithvale", suburb: "Chelsea", state: "VIC", priority: "daily" },
  { sa2_code: "207011163", sa2_name: "Mordialloc - Parkdale", suburb: "Mordialloc", state: "VIC", priority: "daily" },
  { sa2_code: "207011164", sa2_name: "Frankston - Carrum", suburb: "Frankston", state: "VIC", priority: "daily" },
  // 南区（Mornington Peninsula）
  { sa2_code: "207011165", sa2_name: "Mornington - Mount Eliza", suburb: "Mornington", state: "VIC", priority: "daily" },
  { sa2_code: "207011166", sa2_name: "Rosebud - McCrae", suburb: "Rosebud", state: "VIC", priority: "daily" },
  { sa2_code: "207011167", sa2_name: "Sorrento - Portsea", suburb: "Sorrento", state: "VIC", priority: "daily" },
  // 北区
  { sa2_code: "207011168", sa2_name: "Northcote - Thornbury", suburb: "Northcote", state: "VIC", priority: "daily" },
  { sa2_code: "207011169", sa2_name: "Preston - Reservoir", suburb: "Preston", state: "VIC", priority: "daily" },
  { sa2_code: "207011170", sa2_name: "Coburg - Brunswick", suburb: "Brunswick", state: "VIC", priority: "daily" },
  { sa2_code: "207011171", sa2_name: "Footscray - Yarraville", suburb: "Footscray", state: "VIC", priority: "daily" },
  { sa2_code: "207011172", sa2_name: "Moonee Ponds - Essendon", suburb: "Moonee Ponds", state: "VIC", priority: "daily" },
  { sa2_code: "207011173", sa2_name: "Glenroy - Broadmeadows", suburb: "Glenroy", state: "VIC", priority: "daily" },
  // 西区
  { sa2_code: "207011174", sa2_name: "Sunshine - St Albans", suburb: "Sunshine", state: "VIC", priority: "daily" },
  { sa2_code: "207011175", sa2_name: "Werribee - Hoppers Crossing", suburb: "Werribee", state: "VIC", priority: "daily" },
  { sa2_code: "207011176", sa2_name: "Point Cook - Tarneit", suburb: "Point Cook", state: "VIC", priority: "daily" },
  { sa2_code: "207011177", sa2_name: "Melton - Caroline Springs", suburb: "Melton", state: "VIC", priority: "daily" },
  // Geelong
  { sa2_code: "207011178", sa2_name: "Geelong - Newtown", suburb: "Geelong", state: "VIC", priority: "daily" },
  { sa2_code: "207011179", sa2_name: "Torquay - Jan Juc", suburb: "Torquay", state: "VIC", priority: "daily" },
  // Ballarat
  { sa2_code: "207011180", sa2_name: "Ballarat - Wendouree", suburb: "Ballarat", state: "VIC", priority: "daily" },
  // Bendigo
  { sa2_code: "207011181", sa2_name: "Bendigo - Kangaroo Flat", suburb: "Bendigo", state: "VIC", priority: "daily" },
];

async function main() {
  console.log("[Cron Daily] Starting daily collection...");
  const startTime = Date.now();

  // 1. 初始化数据库
  const sql = getSql();
  await ensureSchema(sql);
  await ensureComparableSchema(sql);

  // 2. 执行抓取（Top 100 daily areas）
  // 目前先用上面定义的 42 个——后续通过 tracked_suburbs 表管理
  const dailyAreas = TOP_100.filter(s => s.priority === "daily");
  console.log(`[Cron Daily] ${dailyAreas.length} daily areas to scan`);

  const sales = await collectAll(dailyAreas, "daily");

  // 3. 存入数据库
  if (sales.length) {
    const dbResult = await saveSalesToDb(sql, sales);
    console.log(`[Cron Daily] DB: ${dbResult.inserted} inserted, ${dbResult.skipped} skipped`);
  } else {
    console.log("[Cron Daily] No sales extracted.");
  }

  // 4. 同步 ABS/RBA 缓存（RBA 每日更新，ABS 每月更新）
  console.log("[Cron Daily] ABS/RBA cache refresh not implemented yet.");

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`[Cron Daily] Done in ${elapsed} minutes.`);
}

main().catch(err => {
  console.error("[Cron Daily] Fatal error:", err);
  process.exit(1);
});
