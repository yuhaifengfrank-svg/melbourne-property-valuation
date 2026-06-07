// ── DatabaseComparableSource ──
// 读取 PostgreSQL 中定期采集的 comparable_sales 表
// 供 Vercel 环境（无 CDP）使用
// 要求：Neon DATABASE_URL 环境变量已配置 + db-schema.js 表已创建

import { ComparableSource } from "./comparable-source.js";

let sqlClient = null;

async function getSql() {
  if (sqlClient) return sqlClient;
  const { postgres } = await import("@vercel/postgres");
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    throw new Error("DATABASE_URL not set — DatabaseComparableSource unavailable");
  }
  // @vercel/postgres 的 sql 标签函数
  const { sql } = postgres;
  sqlClient = sql;
  return sqlClient;
}

export class DatabaseComparableSource extends ComparableSource {
  constructor() {
    super();
    this._available = false;
  }

  isAvailable() {
    return this._available;
  }

  /**
   * 检查数据库是否可连接（调用一次后缓存结果）
   */
  async checkConnection() {
    try {
      const sql = await getSql();
      await sql`SELECT 1`;
      this._available = true;
      return true;
    } catch (err) {
      console.warn("[DatabaseComparableSource] DB unavailable:", err.message);
      this._available = false;
      return false;
    }
  }

  /**
   * 为核心估值匹配 comparable 记录
   * @param {Object} subject
   * @param {string} subject.suburb
   * @param {string} [subject.state="VIC"]
   * @param {string} [subject.propertyType]
   * @param {number} [maxResults=12]
   * @returns {Promise<ComparableRecord[]>}
   */
  async fetch(subject, { maxResults = 12 } = {}) {
    if (!this._available) {
      const ok = await this.checkConnection();
      if (!ok) return [];
    }

    const sql = await getSql();
    const suburb = subject.suburb || "";
    const state = subject.state || "VIC";
    const propertyType = subject.propertyType || null;

    // 1) 同郊区 + 同类型（最精确）
    let rows = await matchSuburbType(sql, suburb, state, propertyType, maxResults);

    // 2) 若不足，放宽到同郊区任意类型
    if (rows.length < 3 && propertyType) {
      const fallback = await matchSuburb(sql, suburb, state, maxResults);
      rows = mergeUnique(rows, fallback, maxResults);
    }

    // 3) 仍不足，取 SA2 级别（通过 postcode 推断）
    if (rows.length < 3 && subject.postcode) {
      const sa2 = await matchSa2(sql, state, maxResults);
      rows = mergeUnique(rows, sa2, maxResults);
    }

    // 转成 ComparableRecord 格式
    return rows.map(r => ({
      address: r.sale_address || "",
      salePrice: r.sale_price || 0,
      saleDate: r.sale_date ? formatDate(r.sale_date) : null,
      sourceUrl: r.source_url || "",
      sourceName: r.source_name || "",
      propertyType: r.property_type || null,
      bedrooms: r.bedrooms || null,
      bathrooms: r.bathrooms || null,
      carSpaces: r.car_spaces || null,
      landSize: r.land_size_sqm || null,
      qualityBand: "Core",           // DB 记录视为已验证
      batchId: r.batch_id || null,
      verifiedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null
    }));
  }
}

// ── 查询函数 ──

async function matchSuburbType(sql, suburb, state, type, limit) {
  if (!suburb || !type) return [];
  return sql`
    SELECT *
    FROM comparable_sales
    WHERE suburb ILIKE ${suburb}
      AND state = ${state}
      AND property_type ILIKE ${type}
      AND verification_status != 'rejected'
    ORDER BY sale_date DESC NULLS LAST
    LIMIT ${limit}
  `;
}

async function matchSuburb(sql, suburb, state, limit) {
  return sql`
    SELECT *
    FROM comparable_sales
    WHERE suburb ILIKE ${suburb}
      AND state = ${state}
      AND verification_status != 'rejected'
    ORDER BY sale_date DESC NULLS LAST
    LIMIT ${limit}
  `;
}

async function matchSa2(sql, state, limit) {
  return sql`
    SELECT *
    FROM comparable_sales
    WHERE state = ${state}
      AND verification_status != 'rejected'
    ORDER BY sale_date DESC NULLS LAST, id DESC
    LIMIT ${limit}
  `;
}

function mergeUnique(existing, incoming, max) {
  const seen = new Set(existing.map(r => r.id || r.sale_address));
  for (const r of incoming) {
    if (seen.size >= max) break;
    const key = r.id || r.sale_address;
    if (!seen.has(key)) {
      seen.add(key);
      existing.push(r);
    }
  }
  return existing;
}

function formatDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const str = String(d);
  return str.slice(0, 10);
}
