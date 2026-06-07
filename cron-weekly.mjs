// ── 周更抓取 cron 入口 ──
// 每周日凌晨跑：全维州 533 SA2（含日更的 100 个）
//
// 用法:  node cron-weekly.mjs
// 环境变量: DATABASE_URL (Neon PostgreSQL)

import { getSql, ensureSchema } from "./api/_db.js";
import { ensureComparableSchema, ensureAllSuburbs } from "./lib/db-schema.js";
import { collectAll, saveSalesToDb } from "./lib/browser-collector.js";

// 维州所有 SA2（后续通过 tracked_suburbs 表管理）
import { VIC_ALL_SA2 } from "./lib/vic-sa2-list.js";

async function main() {
  console.log("[Cron Weekly] Starting full VIC collection...");
  const startTime = Date.now();

  // 1. 初始化数据库
  const sql = getSql();
  await ensureSchema(sql);
  await ensureComparableSchema(sql);

  // 2. 全部 SA2
  console.log(`[Cron Weekly] ${VIC_ALL_SA2.length} SA2s to scan`);
  const sales = await collectAll(VIC_ALL_SA2, "weekly");

  // 3. 存入数据库
  if (sales.length) {
    const dbResult = await saveSalesToDb(sql, sales);
    console.log(`[Cron Weekly] DB: ${dbResult.inserted} inserted, ${dbResult.skipped} skipped`);
  } else {
    console.log("[Cron Weekly] No sales extracted.");
  }

  // 4. 更新 tracked_suburbs 表
  for (const sa2 of VIC_ALL_SA2) {
    try {
      await sql`
        INSERT INTO tracked_suburbs (sa2_code, sa2_name, state, suburb, priority)
        VALUES (${sa2.sa2_code}, ${sa2.sa2_name}, 'VIC', ${sa2.suburb}, 'weekly')
        ON CONFLICT (sa2_code) DO NOTHING
      `;
    } catch (_) {}
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`[Cron Weekly] Done in ${elapsed} minutes.`);
}

main().catch(err => {
  console.error("[Cron Weekly] Fatal error:", err);
  process.exit(1);
});
