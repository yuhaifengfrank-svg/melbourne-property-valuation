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
   * @param {number} [maxResults=12]
   * @param {number} [maxAgeDays=730] 取两年内成交（Level B/C 可能需要更久）
   * @returns {Promise<ComparableRecord[]>}
   */
  async fetch(subject, { maxResults = 12, maxAgeDays = 730 } = {}) {
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
    // Fetch beyond the final display limit because cross-source copies can
    // otherwise consume several of the available comparable slots.
    const candidateLimit = Math.max(maxResults * 4, maxResults);

    let rows = [];

    // ── Level A: 同 suburb + 同类型 ──
    if (propertyType) {
      rows = await matchSuburbType(sql, suburb, state, propertyType, candidateLimit, maxAgeDays);
    }

    // ── Level B: 同类型 + 放宽 suburb 匹配 ──
    if (deduplicateSaleRows(rows).length < 3 && propertyType) {
      // B1: 同 suburb + 同类型 + 扩大到 4 年
      const b1 = await matchSuburbType(sql, suburb, state, propertyType, candidateLimit, maxAgeDays * 2);
      rows = mergeUnique(rows, b1, candidateLimit);
    }
    if (deduplicateSaleRows(rows).length < 3 && propertyType) {
      // B2: 前缀/反向 suburb 匹配 (Oakleigh South → Oakleigh%)
      const b2 = await matchSuburbPrefixType(sql, suburb, state, propertyType, candidateLimit, maxAgeDays);
      rows = mergeUnique(rows, b2, candidateLimit);
    }

    // ── Level C: 不绑 suburb 兜底（仅 postcode/SA2）──
    // C1（matchSuburb → 全 VIC + type）已删除：不限制 suburb 会混入无关交易
    if (deduplicateSaleRows(rows).length < 3 && postcode && propertyType && propertyType !== 'Unknown') {
      const c2 = await matchPostcode(sql, postcode, state, propertyType, candidateLimit, maxAgeDays);
      rows = mergeUnique(rows, c2, candidateLimit);
    }
    if (deduplicateSaleRows(rows).length < 3 && sa2Code && propertyType && propertyType !== 'Unknown') {
      const c3 = await matchSa2(sql, sa2Code, propertyType, candidateLimit, maxAgeDays);
      rows = mergeUnique(rows, c3, candidateLimit);
    }

    rows = deduplicateSaleRows(rows, maxResults);

    // 计算 subject 坐标
    const subLat = subject.coordinates?.lat != null ? Number(subject.coordinates.lat) : null;
    const subLon = subject.coordinates?.lon != null ? Number(subject.coordinates.lon) : null;

    // ── 价格范围 + 距离过滤 ──
    // 1) 价格：去掉 sale_price 跟 subject 完全不是一个量级的（用 Level A 中位数作参考）
    // 2) 距离：去掉太远的 comparable（>10km 对墨尔本住宅估值无参考价值）
    const MAX_DISTANCE_M = 10000; // 10km

    // 从当前 rows 推算参考价格：优先用 same-suburb+type 的中位价
    const sameSuburbRows = rows.filter(r => r.suburb && r.suburb.toLowerCase() === suburb.toLowerCase());
    const sameTypeRows = sameSuburbRows.length ? sameSuburbRows : rows;
    const referencePrice = medianSalePrice(sameTypeRows);

    const rowsBefore = rows.length;
    rows = rows.filter(r => {
      // 价格过滤（有参考价时才启用）
      if (referencePrice > 0 && r.sale_price > 0) {
        if (r.sale_price < referencePrice * 0.3 || r.sale_price > referencePrice * 3) return false;
      }
      // 距离过滤（有坐标时才启用）
      if (subLat && subLon && r.lat != null && r.lon != null) {
        const dist = distanceBetween(subLat, subLon, Number(r.lat), Number(r.lon));
        if (dist > MAX_DISTANCE_M) return false;
      }
      // 至少保留有基本价格数据的
      if (!r.sale_price || r.sale_price <= 50000) return false;
      return true;
    });
    const rowsAfter = rows.length;
    if (rowsBefore !== rowsAfter) {
      const removed = rowsBefore - rowsAfter;
      const priceFiltered = rows.filter(r => !(referencePrice > 0 && r.sale_price > 0 &&
        (r.sale_price < referencePrice * 0.3 || r.sale_price > referencePrice * 3)));
      // 仅当有实际过滤时记录
      console.warn(`[DbComp] ${suburb} ${propertyType}: priceRef=$${referencePrice?.toLocaleString()}, rows ${rowsBefore}→${rowsAfter} (removed ${removed} outlier comps)`);
    }

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
      sourceCount: r._source_count || 1,
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
 * Unit 查询可匹配 Unit/Townhouse/Villa，但不匹配 Apartment。
 */
const TYPE_COMPAT_BROADEN = {
  // Unit 与 Apartment 不互通（澳洲分类不同）
  // Unit/Townhouse/Villa 边界模糊，数据源常混标，因此互通
  Unit: new Set(['Unit', 'Townhouse', 'Villa']),
  Apartment: new Set(['Apartment']),
  Townhouse: new Set(['Townhouse', 'Unit', 'Villa']),
  Villa: new Set(['Villa', 'Unit', 'Townhouse']),
};

async function matchSuburbType(sql, suburb, state, type, limit, maxAgeDays) {
  if (!suburb || !type) return [];
  if (type === 'Unknown' || type === 'Unknown') return [];

  // 兼容类型扩展：Unit 可取 Townhouse/Villa，但 Apartment 保持独立。
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
 * 生成 property_type 过滤条件，支持受控的兼容类型扩展。
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

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizedSaleAddress(row) {
  let address = String(row?.sale_address || "")
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .trim();

  const suburb = String(row?.suburb || "").toLowerCase().trim();
  const state = String(row?.state || "").toLowerCase().trim();
  const postcode = String(row?.postcode || "").toLowerCase().trim();
  if (suburb) {
    const suffix = new RegExp(
      `(?:,|\\s)\\s*${escapeRegExp(suburb)}` +
      `${state ? `(?:\\s+${escapeRegExp(state)})?` : ""}` +
      `${postcode ? `(?:\\s+${escapeRegExp(postcode)})?` : ""}\\s*$`,
      "i"
    );
    address = address.replace(suffix, "");
  }

  return address
    .replace(/\bst\b/g, "street")
    .replace(/\brd\b/g, "road")
    .replace(/\bave?\b/g, "avenue")
    .replace(/\bct\b/g, "court")
    .replace(/\bdr\b/g, "drive")
    .replace(/\bpl\b/g, "place")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s*-\s*/g, "-")
    .replace(/[,.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function saleDateKey(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function rowCompleteness(row) {
  return [
    "bedrooms", "bathrooms", "car_spaces", "land_size_sqm",
    "building_area_sqm", "lat", "lon", "postcode", "sa2_code", "source_url"
  ].reduce((score, field) => score + (row?.[field] == null || row[field] === "" ? 0 : 1), 0);
}

function verificationRank(value) {
  return {
    cross_source_verified: 4,
    single_source_observed: 3,
    verified: 2,
    unverified: 1,
    rejected: 0
  }[value] ?? 1;
}

function mergeDuplicateRows(existing, incoming) {
  const preferred = rowCompleteness(incoming) > rowCompleteness(existing) ? incoming : existing;
  const fallback = preferred === existing ? incoming : existing;
  const merged = { ...fallback, ...preferred };

  for (const [field, value] of Object.entries(fallback)) {
    if (merged[field] == null || merged[field] === "") merged[field] = value;
  }

  const sources = new Set([
    ...(existing._source_names || []),
    ...(incoming._source_names || []),
    existing.source_name,
    incoming.source_name
  ].filter(Boolean));
  merged._source_names = [...sources];
  merged._source_count = Math.max(sources.size, existing._source_count || 1, incoming._source_count || 1);

  if (merged._source_count >= 2) {
    merged.verification_status = "cross_source_verified";
  } else if (verificationRank(fallback.verification_status) > verificationRank(preferred.verification_status)) {
    merged.verification_status = fallback.verification_status;
  }

  return merged;
}

/**
 * Collapse the same settled sale across providers and address-format variants.
 * The transaction identity is normalized address + sold date + sold price.
 */
export function deduplicateSaleRows(rows, maxResults = Infinity) {
  const transactions = new Map();

  for (const row of rows || []) {
    const address = normalizedSaleAddress(row);
    const date = saleDateKey(row?.sale_date);
    const price = row?.sale_price == null ? "" : String(row.sale_price);
    const canDeduplicate = Boolean(address && date && price);
    const key = canDeduplicate
      ? `${address}|${date}|${price}`
      : `row:${row?.id ?? transactions.size}`;

    const existing = transactions.get(key);
    if (!existing) {
      transactions.set(key, {
        ...row,
        _source_names: row?.source_name ? [row.source_name] : [],
        _source_count: row?._source_count || 1
      });
    } else {
      transactions.set(key, mergeDuplicateRows(existing, row));
    }
  }

  return [...transactions.values()].slice(0, maxResults);
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

export function medianSalePrice(rows) {
  const prices = (rows || [])
    .map((row) => Number(row?.sale_price))
    .filter((price) => Number.isFinite(price) && price > 100000)
    .sort((a, b) => a - b);

  if (prices.length === 0) return 0;
  const mid = Math.floor(prices.length / 2);
  return prices.length % 2 === 0
    ? (prices[mid - 1] + prices[mid]) / 2
    : prices[mid];
}

function formatDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}
