// ── 一次性索引迁移脚本 ──
// 将 cs_dedup_idx 从普通单列/复合索引升级为 COALESCE NULL-safe 版本
//
// 用法：node migrate-cs-dedup-index.mjs
// 注意事项：
//   1. 先删除重复数据（如果有），否则 COALESCE 唯一约束会拒绝重复记录
//   2. 再删除旧索引，创建新索引
//   3. 事务包裹保证原子性
//
// 安全重启：此脚本可重复运行。如果新版索引已存在，DROP 和 CREATE 都是 IF EXISTS / IF NOT EXISTS。

import { getSql } from "./api/_db.js";

async function main() {
  const sql = getSql();
  console.log("[Index Migration] Connected to DB");

  await sql`BEGIN`;

  try {
    // 步骤 1：清理旧重复数据 — 同一 (address, COALESCE(date, '1970-01-01'), COALESCE(price, -1), source)
    // 保留最新一条记录
    await sql`
      DELETE FROM comparable_sales
      WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY sale_address,
                         COALESCE(sale_date, '1970-01-01'::date),
                         COALESCE(sale_price, -1),
                         source_name
            ORDER BY updated_at DESC NULLS LAST, id DESC
          ) AS rn
          FROM comparable_sales
        ) dups
        WHERE dups.rn > 1
      )
    `;
    console.log("[Index Migration] Duplicates cleaned");

    // 步骤 2：删除旧索引（如果存在）
    await sql`DROP INDEX IF EXISTS cs_dedup_idx_old`;
    // 旧版索引可能叫 cs_dedup_idx（含 NULL-able sale_date, sale_price）
    // 新索引同名，所以先 DROP 再 CREATE 不会冲突
    await sql`DROP INDEX IF EXISTS cs_dedup_idx`;

    // 步骤 3：创建 COALESCE 版
    await sql`
      CREATE UNIQUE INDEX cs_dedup_idx ON comparable_sales (
        sale_address,
        COALESCE(sale_date, '1970-01-01'::date),
        COALESCE(sale_price, -1),
        source_name
      )
    `;
    console.log("[Index Migration] New cs_dedup_idx created");

    await sql`COMMIT`;
    console.log("[Index Migration] Complete");
  } catch (err) {
    await sql`ROLLBACK`;
    console.error("[Index Migration] Failed:", err.message);
    process.exit(1);
  }

  process.exit(0);
}

main().catch(err => {
  console.error("[Index Migration] Fatal:", err.message);
  process.exit(1);
});
