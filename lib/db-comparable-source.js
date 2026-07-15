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
   * 三级降级：
   *   Level A — 同 suburb + 同 propertyType
   *   Level B — 同 propertyType + 放宽 suburb（前缀/反向匹配）
   *   Level C — 仅同 propertyType（suburb 完全放宽）
   *
   * 返回 cross_source_verified 或 single_source_observed 的记录
   *
   * @param {Object} subject
   * @param {string} subject.suburb
   * @param {string} [subject.state="VIC"]
   * @param {string} [subject.propertyType]
   * @param {Object} [subject.coordinates] - Subject 坐标 {lat, lon}（来自 Nominatim 解析）
   * @param {number} [maxResults=24]
   * @param {number} [maxAgeDays=365] 首选 365 天；估值服务在不足 3 条时扩大
   * @returns {Promise<ComparableRecord[]>}
   */
  async fetch(subject, { maxResults = 24, maxAgeDays = 365 } = {}) {
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

    let rows = [];

    // ── Level A: 同 suburb + 同类型 ──
    if (propertyType) {
      rows = await matchSuburbType(sql, suburb, state, propertyType, maxResults, maxAgeDays);
    }

    // ── Level B: 同类型 + 放宽 suburb 匹配 ──
    if (rows.length < 3 && propertyType) {
      // B1: 同 suburb + 同类型 + 扩大到 4 年
      const b1 = await matchSuburbType(sql, suburb, state, propertyType, maxResults, maxAgeDays * 2);
      rows = mergeUnique(rows, b1, maxResults);
    }
    if (rows.length < 3 && propertyType) {
      // B2: 前缀/反向 suburb 匹配 (Oakleigh South → Oakleigh%)
      const b2 = await matchSuburbPrefixType(sql, suburb, state, propertyType, maxResults, maxAgeDays);
      rows = mergeUnique(rows, b2, maxResults);
    }

    // ── Level C: 不绑类型兜底 ──
    // 放宽类型但带着类型过滤标志，让 valuation-engine.js 判断
    // 注意：如果 propertyType 是 Unknown，不尝试无类型匹配（阻止混入）
    if (rows.length < 3 && propertyType && propertyType !== 'Unknown') {
      const c1 = await matchSuburb(sql, suburb, state, propertyType, maxResults, maxAgeDays);
      rows = mergeUnique(rows, c1, maxResults);
    }
    if (rows.length < 3 && postcode && propertyType && propertyType !== 'Unknown') {
      const c2 = await matchPostcode(sql, postcode, state, propertyType, maxResults, maxAgeDays);
      rows = mergeUnique(rows, c2, maxResults);
    }
    if (rows.length < 3 && sa2Code && propertyType && propertyType !== 'Unknown') {
      const c3 = await matchSa2(sql, sa2Code, propertyType, maxResults, maxAgeDays);
      rows = mergeUnique(rows, c3, maxResults);
    }

    // 计算 subject 坐标
    const subLat = subject.coordinates?.lat != null ? Number(subject.coordinates.lat) : null;
    const subLon = subject.coordinates?.lon != null ? Number(subject.coordinates.lon) : null;

    // 转成 ComparableRecord 格式，附带距离
    return rows
      .filter(r => r.property_type && r.property_type !== 'Unknown')
      .map(r => ({
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
      qualityBand: null,
      batchId: r.batch_id || null,
      verificationStatus: r.verification_status || "unverified",
      distanceMeters: (subLat && subLon && r.lat != null && r.lon != null)
        ? Math.round(distanceBetween(subLat, subLon, Number(r.lat), Number(r.lon)))
        : null
    }));
  }

  /**
   * Fetch large-lot comparables (wrapper for the module-level function)
   * @param {Object} subject
   * @param {Object} [options]
   * @returns {Promise<Array>}
   */
  async fetchLargeLot(subject, options = {}) {
    return fetchLargeLotComparables(subject, options);
  }
}

// ── Haversine 距离计算 ──

function distanceBetween(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── 查询函数 ──
// 所有查询返回所有已采集的记录（不限制 verification_status）

/**
 * 类型兼容性映射
 * Unit 查询只兼容 Unit/Townhouse/Villa；Apartment 保持独立，避免公寓成交
 * 拉低或扭曲低密度 Unit/Villa 的估值锚点。
 */
const TYPE_COMPAT_BROADEN = {
  Unit: new Set(['Unit', 'Townhouse', 'Villa']),
  Apartment: new Set(['Apartment', 'Unit']),
  Townhouse: new Set(['Townhouse', 'Unit', 'Villa']),
};

async function matchSuburbType(sql, suburb, state, type, limit, maxAgeDays) {
  if (!suburb || !type) return [];
  if (type === 'Unknown' || type === 'Unknown') return [];

  // 兼容类型扩展：Unit 只取 Unit/Townhouse/Villa，不取 Apartment
  const compatTypes = TYPE_COMPAT_BROADEN[type];
  if (compatTypes && compatTypes.size > 1) {
    const typesArr = [...compatTypes];
    return sql`
      SELECT * FROM comparable_sales
      WHERE suburb ILIKE ${suburb}
        AND state = ${state}
        AND property_type = ANY(${typesArr}::text[])
        AND sale_date >= CURRENT_DATE - ${maxAgeDays}::integer
      ORDER BY sale_date DESC NULLS LAST
      LIMIT ${limit}
    `;
  }

  return sql`
    SELECT * FROM comparable_sales
    WHERE suburb ILIKE ${suburb}
      AND state = ${state}
      AND property_type ILIKE ${type}
      AND sale_date >= CURRENT_DATE - ${maxAgeDays}::integer
    ORDER BY sale_date DESC NULLS LAST
    LIMIT ${limit}
  `;
}

/**
 * 同 propertyType + 前缀/反向 suburb 匹配
 * 用于 Level B：精确 suburb 不够时扩大范围
 */
/**
 * 生成 property_type 过滤条件，支持兼容类型扩展（Unit 不匹配 Apartment）
 */
function typeFilter(sql, type) {
  if (!type || type === 'Unknown') return sql``;
  const compat = TYPE_COMPAT_BROADEN[type];
  if (compat && compat.size > 1) {
    // Neon tagged-template: ${arr} as ANY param works natively
    const arr = [...compat];
    return sql`AND property_type = ANY(${arr}::text[])`;
  }
  return sql`AND property_type ILIKE ${type}`;
}

async function matchSuburbPrefixType(sql, suburb, state, type, limit, maxAgeDays) {
  if (!suburb || !type) return [];
  const firstWord = suburb.split(/\s+/)[0];
  const tf = typeFilter(sql, type);

  let rows = [];

  // Step 1: 短前缀（取前 4 字符）—— 覆盖 Ashburton→Ash%, Brighton→Brig%, Oakleigh→Oakl%
  const shortPrefix = firstWord.slice(0, 4).toLowerCase();
  if (shortPrefix.length >= 3) {
    rows = await sql`
      SELECT * FROM comparable_sales
      WHERE LOWER(suburb) LIKE ${shortPrefix + '%'}
        AND state = ${state}
        ${tf}
        AND sale_date >= CURRENT_DATE - ${maxAgeDays}::integer
      ORDER BY sale_date DESC NULLS LAST
      LIMIT ${limit}
    `;
  }
  if (rows.length >= 3) return rows;

  // Step 2: first word 前缀（Oakleigh South → Oakleigh%）
  if (firstWord !== suburb && firstWord.length > 2) {
    const fwRows = await sql`
      SELECT * FROM comparable_sales
      WHERE suburb ILIKE ${firstWord + '%'}
        AND state = ${state}
        ${tf}
        AND sale_date >= CURRENT_DATE - ${maxAgeDays}::integer
      ORDER BY sale_date DESC NULLS LAST
      LIMIT ${limit}
    `;
    rows = mergeUnique(rows, fwRows, limit);
  }
  if (rows.length >= 3) return rows;

  // Step 3: suburb 精确前缀（Oakleigh → Oakleigh%）
  if (suburb !== firstWord || rows.length === 0) {
    const epRows = await sql`
      SELECT * FROM comparable_sales
      WHERE suburb ILIKE ${suburb + '%'}
        AND state = ${state}
        ${tf}
        AND sale_date >= CURRENT_DATE - ${maxAgeDays}::integer
      ORDER BY sale_date DESC NULLS LAST
      LIMIT ${limit}
    `;
    rows = mergeUnique(rows, epRows, limit);
  }
  return rows;
}

async function matchSuburb(sql, suburb, state, propertyType, limit, maxAgeDays) {
  // 精确 suburb 匹配（同类型优先，含兼容类型扩展）
  const tf = typeFilter(sql, propertyType);
  let rows = await sql`
    SELECT * FROM comparable_sales
    WHERE suburb ILIKE ${suburb}
      AND state = ${state}
      ${tf}
      AND sale_date >= CURRENT_DATE - ${maxAgeDays}::integer
    ORDER BY sale_date DESC NULLS LAST
    LIMIT ${limit}
  `;
  // 精确匹配无结果时，尝试前缀匹配（如 Oakleigh 可匹配 Oakleigh South）
  if (rows.length === 0) {
    rows = await sql`
      SELECT * FROM comparable_sales
      WHERE suburb ILIKE ${suburb + '%'}
        AND state = ${state}
        ${tf}
        AND sale_date >= CURRENT_DATE - ${maxAgeDays}::integer
      ORDER BY sale_date DESC NULLS LAST
      LIMIT ${limit}
    `;
  }
  // 前缀匹配也无结果时，尝试反向前缀匹配（输入 Oakleigh South 匹配 DB 中的 Oakleigh）
  if (rows.length === 0) {
    const firstWord = suburb.split(/\s+/)[0];
    if (firstWord && firstWord !== suburb) {
      rows = await sql`
        SELECT * FROM comparable_sales
        WHERE suburb ILIKE ${firstWord + '%'}
          AND state = ${state}
          ${tf}
          AND sale_date >= CURRENT_DATE - ${maxAgeDays}::integer
        ORDER BY sale_date DESC NULLS LAST
        LIMIT ${limit}
      `;
    }
  }
  return rows;
}

async function matchPostcode(sql, postcode, state, propertyType, limit, maxAgeDays) {
  const tf = typeFilter(sql, propertyType);
  return sql`
    SELECT * FROM comparable_sales
    WHERE postcode = ${postcode}
      AND state = ${state}
      ${tf}
      AND sale_date >= CURRENT_DATE - ${maxAgeDays}::integer
    ORDER BY sale_date DESC NULLS LAST
    LIMIT ${limit}
  `;
}

async function matchSa2(sql, sa2Code, propertyType, limit, maxAgeDays) {
  const tf = typeFilter(sql, propertyType);
  return sql`
    SELECT * FROM comparable_sales
    WHERE sa2_code = ${sa2Code}
      ${tf}
      AND sale_date >= CURRENT_DATE - ${maxAgeDays}::integer
    ORDER BY sale_date DESC NULLS LAST
    LIMIT ${limit}
  `;
}

/**
 * Fetch large-lot comparables for the Large-Lot Valuation Mode.
 *
 * Tier L1: House, land_size ratio 0.65–1.50 x subject land, same suburb,
 *          within 36 months, distance-prioritized within 3km.
 * Tier L2: House, land_size ratio 0.50–2.00, 5km, adj. suburbs, 48 months.
 * Tier L3: Same market area, must be flagged.
 *
 * @param {Object} subject - { suburb, state, landSize, coordinates? }
 * @param {Object} [options]
 * @param {number} [options.maxResults=50]  Fetch up to 50 candidates for engine screening
 * @returns {Promise<Object[]>} Array of comparable records with _largeLotTier field
 */
const LARGE_LOT_EPOCH = new Date();

async function fetchLargeLotComparables(subject, options = {}) {
  const maxResults = options.maxResults || 50;
  const { suburb, state, landSize, coordinates } = subject;
  if (!suburb || !landSize) return [];

  const subLat = coordinates?.lat != null ? Number(coordinates.lat) : null;
  const subLon = coordinates?.lon != null ? Number(coordinates.lon) : null;

  try {
    const { getSql } = await import("../api/_db.js");
    const sql = getSql();
    const stateVal = state || "VIC";

    // Tier L1: same suburb, House, land ratio 0.65–1.50, 36 months
    const tier1 = await sql`
      SELECT *, 'L1' as _large_lot_tier
      FROM comparable_sales
      WHERE property_type = 'House'
        AND suburb ILIKE ${suburb}
        AND state = ${stateVal}
        AND land_size_sqm IS NOT NULL
        AND land_size_sqm BETWEEN ${Math.round(landSize * 0.65)} AND ${Math.round(landSize * 1.50)}
        AND sale_date >= CURRENT_DATE - INTERVAL '36 months'
        AND sale_price IS NOT NULL
        AND sale_price BETWEEN 50000 AND 30000000
      ORDER BY sale_date DESC
      LIMIT ${maxResults}
    `;

    if (tier1 && tier1.length >= 3) {
      // Sufficient L1 comps, no need to expand
      return formatRows(tier1, { lat: subLat, lon: subLon });
    }

    // Tier L2: broader land ratio, 5km, 48 months
    // For radius search we need coordinates; without them use suburb prefix match
    let tier2 = [];
    if (tier1) tier2 = [...tier1];  // keep L1 results

    // Get same-suburb sales with wider land ratio, 48 months
    const widerSuburb = await sql`
      SELECT *, 'L2' as _large_lot_tier
      FROM comparable_sales
      WHERE property_type = 'House'
        AND suburb ILIKE ${suburb}
        AND state = ${stateVal}
        AND land_size_sqm IS NOT NULL
        AND land_size_sqm BETWEEN ${Math.round(landSize * 0.50)} AND ${Math.round(landSize * 2.00)}
        AND sale_date >= CURRENT_DATE - INTERVAL '48 months'
        AND sale_price IS NOT NULL
        AND sale_price BETWEEN 50000 AND 30000000
      ORDER BY sale_date DESC
      LIMIT ${maxResults}
    `;

    if (widerSuburb) {
      for (const r of widerSuburb) {
        if (!tier2.some(e => e.id === r.id)) tier2.push(r);
      }
    }

    if (tier2.length >= 3) {
      return formatRows(tier2, { lat: subLat, lon: subLon });
    }

    // Tier L3: radius-based search (real coordinates) or SA2 neighbor fallback
    // Radius search preferred: any House within 5km with land ratio 0.50–2.00
    let tier3 = [];
    if (subLat && subLon) {
      tier3 = await sql`
        SELECT *, 'L3' as _large_lot_tier
        FROM comparable_sales
        WHERE property_type = 'House'
          AND state = ${stateVal}
          AND lat IS NOT NULL AND lon IS NOT NULL
          AND land_size_sqm IS NOT NULL
          AND land_size_sqm BETWEEN ${Math.round(landSize * 0.50)} AND ${Math.round(landSize * 2.00)}
          AND sale_date >= CURRENT_DATE - INTERVAL '48 months'
          AND sale_price IS NOT NULL
          AND sale_price BETWEEN 50000 AND 30000000
          AND (
            6371000 * 2 * ASIN(SQRT(
              POWER(SIN(RADIANS(lat - ${subLat}) / 2), 2)
              + COS(RADIANS(${subLat})) * COS(RADIANS(lat))
              * POWER(SIN(RADIANS(lon - ${subLon}) / 2), 2)
            ))
          ) <= 5000
        ORDER BY sale_date DESC
        LIMIT ${maxResults}
      `;
    }

    if (tier3) {
      for (const r of tier3) {
        if (!tier2.some(e => e.id === r.id)) tier2.push(r);
      }
    }

    return formatRows(tier2, { lat: subLat, lon: subLon });
  } catch (e) {
    console.warn("[fetchLargeLotComparables] error:", e.message);
    return [];
  }
}

function formatRows(rows, subjCoords = {}) {
  const sLat = subjCoords.lat != null ? Number(subjCoords.lat) : null;
  const sLon = subjCoords.lon != null ? Number(subjCoords.lon) : null;
  return rows.map(r => {
    // Compute distance
    let dist = null;
    if (sLat && sLon && r.lat != null && r.lon != null) {
      dist = Math.round(distanceBetween(sLat, sLon, Number(r.lat), Number(r.lon)));
    }

    // Compute age in months
    let ageM = null;
    if (r.sale_date) {
      const sd = r.sale_date instanceof Date ? r.sale_date : new Date(r.sale_date);
      if (Number.isFinite(sd.getTime())) {
        ageM = Math.round((LARGE_LOT_EPOCH.getTime() - sd.getTime()) / (24 * 60 * 60 * 1000 * 30.4375) * 10) / 10;
      }
    }

    return {
      id: r.id,
      address: r.sale_address,
      suburb: r.suburb,
      state: r.state,
      salePrice: Number(r.sale_price),
      saleDate: r.sale_date instanceof Date ? r.sale_date.toISOString().slice(0, 10) : r.sale_date,
      bedrooms: r.bedrooms == null ? null : Number(r.bedrooms),
      bathrooms: r.bathrooms == null ? null : Number(r.bathrooms),
      carSpaces: r.car_spaces == null ? null : Number(r.car_spaces),
      landSize: r.land_size_sqm == null ? null : Number(r.land_size_sqm),
      propertyType: r.property_type,
      lat: r.lat == null ? null : Number(r.lat),
      lon: r.lon == null ? null : Number(r.lon),
      verificationStatus: r.verification_status,
      distanceMeters: dist,
      ageMonths: ageM,
      sourceCount: r.source_count ? Number(r.source_count) : 1,
      _largeLotTier: r._large_lot_tier || "L1"
    };
  });
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
