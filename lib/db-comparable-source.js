// ── DatabaseComparableSource ──
// 读取 PostgreSQL 中定期采集的 comparable_sales 表
// 供 Vercel 环境（无 CDP）使用
// 复用 api/_db.js — 使用 @neondatabase/serverless

import { getSql } from "../api/_db.js";

export class DatabaseComparableSource {
  constructor() {
    this._available = false;
  }

  isAvailable() {
    return this._available;
  }

  /**
   * 检查数据库是否可连接
   */
  async checkConnection() {
    try {
      const sql = getSql();
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
   * 返回 cross_source_verified 或 single_source_observed 的记录
   *
   * @param {Object} subject
   * @param {string} subject.suburb
   * @param {string} [subject.state="VIC"]
   * @param {string} [subject.propertyType]
   * @param {number} [maxResults=12]
   * @param {number} [maxAgeDays=365] 只取一年内成交
   * @returns {Promise<ComparableRecord[]>}
   */
  async fetch(subject, { maxResults = 12, maxAgeDays = 365 } = {}) {
    if (!this._available) {
      const ok = await this.checkConnection();
      if (!ok) return [];
    }

    if (!subject.suburb && !subject.postcode && !subject.sa2Code) {
      console.warn("[DatabaseComparableSource] No suburb/postcode/SA2 provided, cannot query");
      return [];
    }

    const sql = getSql();
    const suburb = subject.suburb || "";
    const state = subject.state || "VIC";
    const propertyType = subject.propertyType || null;
    const postcode = subject.postcode || "";
    const sa2Code = subject.sa2Code || "";

    // 优先级 1: 同郊区 + 同类型
    let rows = await matchSuburbType(sql, suburb, state, propertyType, maxResults, maxAgeDays);

    // 优先级 2: 同郊区（放宽类型）
    if (rows.length < 3 && propertyType) {
      rows = mergeUnique(rows, await matchSuburb(sql, suburb, state, maxResults, maxAgeDays), maxResults);
    }

    // 优先级 3: 同邮编
    if (rows.length < 3 && postcode) {
      rows = mergeUnique(rows, await matchPostcode(sql, postcode, state, maxResults, maxAgeDays), maxResults);
    }

    // 优先级 4: 同 SA2
    if (rows.length < 3 && sa2Code) {
      rows = mergeUnique(rows, await matchSa2(sql, sa2Code, maxResults, maxAgeDays), maxResults);
    }

    // 转成 ComparableRecord 格式
    // 注意：未验证记录不标 qualityBand: "Core"，除非已被 verification 流程确认
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
      qualityBand: null,               // 由调用方根据 verification_status 定
      batchId: r.batch_id || null,
      verificationStatus: r.verification_status || "unverified"
    }));
  }
}

// ── 查询函数 ──
// 所有查询只返回 cross_source_verified 或 single_source_observed 的记录

async function matchSuburbType(sql, suburb, state, type, limit, maxAgeDays) {
  if (!suburb || !type) return [];
  return sql`
    SELECT * FROM comparable_sales
    WHERE suburb ILIKE ${suburb}
      AND state = ${state}
      AND property_type ILIKE ${type}
      AND verification_status IN ('cross_source_verified', 'single_source_observed')
      AND sale_date >= CURRENT_DATE - ${maxAgeDays}::integer
    ORDER BY sale_date DESC NULLS LAST
    LIMIT ${limit}
  `;
}

async function matchSuburb(sql, suburb, state, limit, maxAgeDays) {
  return sql`
    SELECT * FROM comparable_sales
    WHERE suburb ILIKE ${suburb}
      AND state = ${state}
      AND verification_status IN ('cross_source_verified', 'single_source_observed')
      AND sale_date >= CURRENT_DATE - ${maxAgeDays}::integer
    ORDER BY sale_date DESC NULLS LAST
    LIMIT ${limit}
  `;
}

async function matchPostcode(sql, postcode, state, limit, maxAgeDays) {
  return sql`
    SELECT * FROM comparable_sales
    WHERE postcode = ${postcode}
      AND state = ${state}
      AND verification_status IN ('cross_source_verified', 'single_source_observed')
      AND sale_date >= CURRENT_DATE - ${maxAgeDays}::integer
    ORDER BY sale_date DESC NULLS LAST
    LIMIT ${limit}
  `;
}

async function matchSa2(sql, sa2Code, limit, maxAgeDays) {
  return sql`
    SELECT * FROM comparable_sales
    WHERE sa2_code = ${sa2Code}
      AND verification_status IN ('cross_source_verified', 'single_source_observed')
      AND sale_date >= CURRENT_DATE - ${maxAgeDays}::integer
    ORDER BY sale_date DESC NULLS LAST
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
  return String(d).slice(0, 10);
}
