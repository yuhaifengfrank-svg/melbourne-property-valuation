// ── 索引迁移脚本（v2: partial unique index for ON CONFLICT support）──
// 旧的 COALESCE 索引无法用于 ON CONFLICT（PostgreSQL 限制），
// 改用 partial unique index，支持 sale_date/sale_price 为 NULL 的多行。
//
// 用法：node migrate-cs-dedup-index.mjs

import { getSql } from "./api/_db.js";

async function main() {
  const sql = getSql();
  console.log("[Index Migration] Connected to DB");

  // 删除旧索引
  await sql`DROP INDEX IF EXISTS cs_dedup_idx`;

  // 创建新的 partial unique index
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cs_dedup_idx2 ON comparable_sales (
      sale_address,
      sale_date,
      sale_price,
      source_name
    ) WHERE sale_date IS NOT NULL AND sale_price IS NOT NULL
  `;

  console.log("[Index Migration] Complete");
  process.exit(0);
}

main().catch(err => {
  console.error("[Index Migration] Fatal:", err.message);
  process.exit(1);
});
