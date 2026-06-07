// ── 一次性索引迁移脚本 ──
// 将 cs_dedup_idx 从普通单列/复合索引升级为 COALESCE NULL-safe 版本
//
// 用法：node migrate-cs-dedup-index.mjs
// 使用 sql.transaction(txn => [...]) 保证原子性

import { getSql } from "./api/_db.js";

async function main() {
  const sql = getSql();
  console.log("[Index Migration] Connected to DB");

  await sql.transaction(txn => [
    // 步骤 1：清理重复数据
    txn`DELETE FROM comparable_sales
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
      )`,
    // 步骤 2：删除旧索引
    txn`DROP INDEX IF EXISTS cs_dedup_idx`,
    // 步骤 3：创建 COALESCE 版
    txn`CREATE UNIQUE INDEX cs_dedup_idx ON comparable_sales (
      sale_address,
      COALESCE(sale_date, '1970-01-01'::date),
      COALESCE(sale_price, -1),
      source_name
    )`
  ]);

  console.log("[Index Migration] Complete");
  process.exit(0);
}

main().catch(err => {
  console.error("[Index Migration] Fatal:", err.message);
  process.exit(1);
});
